import { gonderiDurumEtiketi, kargoGorunumu, tedarikciGruplari } from "@/lib/kargo-bolme";
import { KARGO_FIRMALARI } from "@/lib/kargo-firmalari";
import { elleGonderiEkle, etiketiAl, gonderiIptal, gonderiTeslimEdildi, kargoDurumlariniGuncelle, otoEtiketUret, otoTaslakOlustur } from "./gonderi-actions";
import { teslimatSecenekleri } from "@/lib/tryoto/ayar";
import { hacimselAgirlik, VARSAYILAN_KUTU } from "@/lib/tryoto/fiyat";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { alacakKapat, kalemiDuzenle, refundOrder, updateFulfillmentDetails, updateOrderStatus } from "./actions";
import { PanelDrawer } from "@/components/arvo-ui/panel-drawer";
import { PanelModal } from "@/components/arvo-ui/panel-modal";
import { FaturaYazdir } from "./fatura-yazdir";
import { cancelTransferOrder, confirmTransferPayment, quickStatus } from "../actions";
import { isBankTransfer, TRANSFER_STALE_HOURS } from "@/lib/payment-method";
import { ConfirmSubmit } from "@/components/panel/confirm-submit";

/* Render dışında: bileşen içinde saf olmayan çağrı yapılmasın. */
function transferClock(){return Date.now();}
import { isOrderClosed, orderBadge, orderStatusLabel, orderStatusOptions, paymentStatusLabel, paymentStatusOptions, sourceLabel } from "@/lib/commerce-labels";
import { nextOrderStep, orderFlow } from "@/lib/order-flow";
import { describeOrderEvent } from "@/lib/order-events";
import { Icon } from "@/components/panel/icons";
import { PrintButton } from "@/components/panel/print-button";
import { KNot } from "@/components/arvo-ui/k-ui";
import { TalepAkis } from "@/components/arvo-ui/kayit-akis";
import { AnindaForm, AnindaYedek } from "@/components/arvo-ui/aninda";
import { rozetTonu } from "@/lib/rozet-tonu";
// Kalem dökümü ve gönderi kartlarının kendi sınıfları (ac-lines, shipment-*) hâlâ orada.
import "../orders.css";
import "@/components/arvo-ui/kayit-detay.css";
import "./siparis-detay.css";
import { formatPersonName } from "@/lib/format-name";

const money=(value:number,currency:string)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:currency||"TRY"}).format(value/100);
/* Sunucu UTC'de çalışıyor; saat Türkiye saatine göre gösterilir. */
const dateTime=new Intl.DateTimeFormat("tr-TR",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"});
const shortDate=new Intl.DateTimeFormat("tr-TR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"});
const when=(value:string)=>dateTime.format(new Date(value));

type Address={name?:string;address1?:string;address2?:string;city?:string;province?:string;zip?:string;country?:string;phone?:string};
type OrderMeta={discount?:number;coupon_code?:string;refunded_at?:string;refunded_amount?:number;refund_reference?:string;billing?:Address;shipping_address?:Address;payment_method?:string;payment_reference?:string;notes?:string;tags?:string;historical_import?:boolean;shipping_carrier?:string;tracking_number?:string;tracking_url?:string;internal_note?:string};


/* Sol sütundaki adres bölümü (ArvoOS'un talep-gecmis bölümü); eskiden üç ayrı kart. */
function AdresBolumu({baslik,adres}:{baslik:string;adres?:Address}){
  const satirlar=[formatPersonName(adres?.name),adres?.address1,adres?.address2,[adres?.zip,adres?.city].filter(Boolean).join(" "),adres?.province,adres?.country,adres?.phone].filter(Boolean);
  return <div className="talep-gecmis"><h3>{baslik}</h3>{satirlar.length?<address className="siparis-adres">{satirlar.map((satir,sira)=><span key={sira}>{satir}</span>)}</address>:<p className="talep-bos">Bilgi bulunmuyor.</p>}</div>;
}

export default async function OrderDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{agirlik?:string;en?:string;boy?:string;yuk?:string;pencere?:string}>}){
  const {id}=await params;const query=await searchParams;
  const {supabase,organization,membership}=await requireTenant();
  const [{data:order,error},{data:items,error:itemsError},{data:events,error:eventsError},{data:shipments}]=await Promise.all([
    supabase.from("arc_orders").select("id,order_number,source,status,payment_status,customer_name,customer_email,currency,subtotal,tax,shipping,total,metadata,created_at,updated_at").eq("organization_id",organization.id).eq("id",id).maybeSingle(),
    supabase.from("arc_order_items").select("id,variant_id,product_name,sku,quantity,unit_price,total").eq("organization_id",organization.id).eq("order_id",id).order("product_name"),
    supabase.from("arc_order_events").select("id,event_type,event_data,created_by,created_at").eq("organization_id",organization.id).eq("order_id",id).order("created_at",{ascending:false}).limit(50),
    /* Gönderiler ve kalemleri: bir sipariş birden çok firmaya bölünebiliyor. */
    supabase.from("arc_shipments").select("id,sequence,source,status,carrier_code,carrier_name,tracking_number,tracking_url,awb_url,supplier,shipped_at,failure_reason,arc_shipment_items(order_item_id,quantity)").eq("organization_id",organization.id).eq("order_id",id).order("sequence")
  ]);
  const canManage=["owner","admin","manager"].includes(membership.role);
  const meta=(order?.metadata??{}) as OrderMeta;
  if(error)throw new Error(error.message);if(itemsError)throw new Error(itemsError.message);if(eventsError)throw new Error(eventsError.message);if(!order)notFound();

  /*
    KDV dilimleri. Bir faturada farklı oranlar bir arada
    bulunabiliyor: giyim %10, kozmetik %20. Fatura mevzuatı her
    oranı ayrı matrah ve vergi satırı olarak göstermeyi
    gerektiriyor.

    Kalem SKU'sundan ürüne ulaşıp oranı okuyoruz.
  */
  const skus=[...new Set((items??[]).map(item=>item.sku).filter(Boolean))];
  const {data:rateRows}=skus.length
    ?await supabase.from("arc_product_variants").select("sku,supplier,arc_products(tax_rate)").eq("organization_id",organization.id).in("sku",skus)
    :{data:[]};

  const rateBySku=new Map<string,number>();
  /* Tedarikçi sipariş kaleminde saklı değil, varyanttan geliyor; gönderi
     önerisi kalemleri ona göre grupluyor (ayrı depo = ayrı paket). */
  const supplierBySku=new Map<string,string|null>();
  for(const row of (rateRows??[]) as unknown as Array<{sku:string;supplier:string|null;arc_products:{tax_rate:number|null}|{tax_rate:number|null}[]|null}>){
    const product=Array.isArray(row.arc_products)?row.arc_products[0]:row.arc_products;
    rateBySku.set(row.sku, product?.tax_rate ?? 20);
    supplierBySku.set(row.sku,row.supplier??null);
  }

  /* Gönderi bölümünün verisi: kalemler tedarikçileriyle, mevcut gönderiler
     ve kargoya verilmemiş adetler. */
  const kargoKalemleri=(items??[]).map(item=>({id:item.id,quantity:item.quantity,product_name:item.product_name,supplier:supplierBySku.get(item.sku)??null}));
  const gonderiler=((shipments??[]) as Array<{id:string;sequence:number;source:string;status:string;carrier_code:string|null;carrier_name:string|null;tracking_number:string|null;tracking_url:string|null;awb_url:string|null;supplier:string|null;shipped_at:string|null;failure_reason:string|null;arc_shipment_items:{order_item_id:string;quantity:number}[]|null}>)
    .map(satir=>({...satir,items:satir.arc_shipment_items??[]}));
  const gruplar=tedarikciGruplari(kargoKalemleri,gonderiler);
  /* Teslim aşaması dâhil: cron delivered yazıyordu ama ekran "kargoda"
     demeye devam ediyordu. */
  const kargoDurumuOzet=kargoGorunumu(kargoKalemleri,gonderiler);
  /* İptal edilen gönderi ne özette ne sayımda: yola çıkmayacak bir
     paketin takip numarasını göstermek yanlış bilgi. */
  const acikGonderiler=gonderiler.filter(g=>g.status!=="cancelled");
  const iptalGonderiler=gonderiler.filter(g=>g.status==="cancelled");
  const takipliGonderiSayisi=acikGonderiler.filter(g=>g.tracking_number?.trim()).length;
  const kalemAdi=new Map((items??[]).map(item=>[item.id,item.product_name]));

  /*
    DÜZENLEME VERİSİ (16.10.2026): her kalemin ürününün bütün varyantları
    (değiştirme seçenekleri) ve tedarikçi tamponu (stok rozeti). Tedarikçi
    ürününde "stokta" demek stok > tampon (arc_variant_available); kendi
    ürünümüzde stok > 0 ya da stoksuz satış açık. Rozet bu kuralın
    ikizini çizmiyor, aynı kuralı okuyor: satılabilir() aşağıda.
  */
  const kalemVaryantIdleri=[...new Set((items??[]).map(item=>item.variant_id).filter((v):v is string=>Boolean(v)))];
  const {data:kalemVaryantlari,error:kalemVaryantHatasi}=kalemVaryantIdleri.length
    ?await supabase.from("arc_product_variants").select("id,product_id").eq("organization_id",organization.id).in("id",kalemVaryantIdleri)
    :{data:[] as {id:string;product_id:string}[],error:null};
  if(kalemVaryantHatasi)throw new Error("Kalem varyantları okunamadı: "+kalemVaryantHatasi.message);
  const urunByVaryant=new Map((kalemVaryantlari??[]).map(v=>[v.id,v.product_id]));
  const urunIdleri=[...new Set((kalemVaryantlari??[]).map(v=>v.product_id))];
  type Secenek={id:string;product_id:string;sku:string;title:string|null;price:number;stock:number;allow_backorder:boolean;supplier:string|null};
  const [{data:secenekVerisi,error:secenekHatasi},{data:tamponVerisi,error:tamponHatasi}]=await Promise.all([
    urunIdleri.length
      ?supabase.from("arc_product_variants").select("id,product_id,sku,title,price,stock,allow_backorder,supplier").eq("organization_id",organization.id).in("product_id",urunIdleri).order("sku").limit(500)
      :Promise.resolve({data:[] as Secenek[],error:null}),
    supabase.from("arc_suppliers").select("code,stock_buffer").eq("organization_id",organization.id),
  ]);
  if(secenekHatasi)throw new Error("Varyant seçenekleri okunamadı: "+secenekHatasi.message);
  if(tamponHatasi)throw new Error("Tedarikçi tamponu okunamadı: "+tamponHatasi.message);
  const secenekler=(secenekVerisi??[]) as Secenek[];
  const tampon=new Map(((tamponVerisi??[]) as {code:string;stock_buffer:number|null}[]).map(t=>[t.code,t.stock_buffer??5]));
  const satilabilir=(v:Secenek)=>v.supplier?v.stock>(tampon.get(v.supplier)??5):v.stock>0||v.allow_backorder;
  const varyantById=new Map(secenekler.map(v=>[v.id,v]));

  /*
    TASLAK gönderi varsa kargo fiyatları sorulur: kullanıcı firmayı
    fiyatını görerek seçsin. Taslak yoksa OTO'ya hiç dokunulmuyor —
    her sipariş açılışında fiyat sormak gereksiz çağrı olurdu.

    Çıkış şehri mağaza ayarındaki adres. Gerçek gönderici konumu OTO'da
    tanımlıysa (pickupLocationCode) sevkiyat oradan çıkıyor ve fiyat bir
    miktar sapabilir; seçenekleri ve sıralamayı görmek için yeterli.
  */
  const taslaklar=gonderiler.filter(g=>g.source==="oto"&&g.status==="draft");
  /*
    FİYAT AĞIRLIĞA GÖRE DEĞİŞİYOR ve ağırlık adresten okunamıyor. Önce
    sabit 1 kg ile soruluyordu: kullanıcı kartta ağırlığı değiştirse bile
    liste aynı kalıyor, seçilen fiyatla gerçekleşen fiyat tutmuyordu.
    Ağırlık artık adres çubuğunda; değiştirince sayfa yeniden yükleniyor
    ve fiyatlar o ağırlıkla geliyor.
  */
  const sorgulananAgirlik=Math.min(Math.max(Number(query.agirlik??"1")||1,0.1),100);
  /*
    PAKET ÖLÇÜSÜ de sorguya giriyor. Ölçüsüz sorgu hiç seçenek
    döndürmüyordu: OTO fiyatı gerçek ağırlıkla hacimsel ağırlığın
    büyüğünden hesaplıyor ve ölçü olmadan hacimseli bilemiyor.
    Varsayılan kargo poşeti ölçüsü (OTO panelindeki varsayılanla aynı).
  */
  const olcu={
    enCm:Math.min(Math.max(Number(query.en??VARSAYILAN_KUTU.enCm)||VARSAYILAN_KUTU.enCm,1),200),
    boyCm:Math.min(Math.max(Number(query.boy??VARSAYILAN_KUTU.boyCm)||VARSAYILAN_KUTU.boyCm,1),200),
    yukseklikCm:Math.min(Math.max(Number(query.yuk??VARSAYILAN_KUTU.yukseklikCm)||VARSAYILAN_KUTU.yukseklikCm,1),200),
  };
  const hacimsel=hacimselAgirlik(olcu.enCm,olcu.boyCm,olcu.yukseklikCm);
  const {data:kargoAyarSatiri}=taslaklar.length
    ?await supabase.from("arc_store_settings").select("tryoto_enabled,tryoto_refresh_token_enc,tryoto_pickup_location_code,tryoto_test_mode,address_city").eq("organization_id",organization.id).maybeSingle()
    :{data:null};
  const teslimatAdresi=meta.shipping_address??{};
  const {secenekler:kargoSecenekleri,hata:kargoFiyatHatasi}=taslaklar.length
    ?await teslimatSecenekleri(organization.id,kargoAyarSatiri,{
        cikisSehri:String((kargoAyarSatiri as {address_city?:string|null}|null)?.address_city??""),
        varisSehri:teslimatAdresi.city??"",
        agirlikKg:sorgulananAgirlik,
        ...olcu,
      })
    :{secenekler:[],hata:null};

  /* İndirim payı orantılı düşülür: müşteri indirimli tutarı
     ödedi, matrah da o tutar üzerinden olmalı. */
  const discount=Number(meta.discount??0);
  /* Havale indirimi de matrahtan düşer (veritabanındaki KDV hesabıyla aynı:
     arc_fill_order_tax, 20261016122046). Eskiden yalnızca kupon düşülüyordu;
     havale siparişinin fatura dökümü %3 fazla KDV gösteriyordu. */
  const toplamIndirim=discount+Math.max(0,Number((meta as {transfer_discount?:number}).transfer_discount??0)||0);
  const gross=(order.subtotal??0)+(order.shipping??0);
  const factor=toplamIndirim>0&&gross>0?1-Math.min(toplamIndirim,gross)/gross:1;

  const brackets=new Map<number,{matrah:number;kdv:number}>();
  const addBracket=(rate:number,grossAmount:number)=>{
    const net=Math.round(grossAmount*factor);
    const kdv=Math.round(net-net/(1+rate/100));
    const current=brackets.get(rate)??{matrah:0,kdv:0};
    brackets.set(rate,{matrah:current.matrah+(net-kdv),kdv:current.kdv+kdv});
  };

  for(const item of items??[]) addBracket(rateBySku.get(item.sku)??20,item.total);
  /* Kargo genel orana tabidir. */
  if((order.shipping??0)>0) addBracket(20,order.shipping);

  const bracketList=[...brackets.entries()].sort((a,b)=>a[0]-b[0]);

  /*
    Fatura satırları.

    Her satır kendi indirim payını ve KDV'sini taşıyor. İndirim
    toplam üzerinden orantılı dağıtılıyor: hangi kaleme ait
    olduğu kayıtlı değil.

    Kargo da bir satır: ayrı gösterilmesi fatura düzeninin
    gereği.
  */
  const discountRate=gross>0?Math.min(toplamIndirim,gross)/gross:0;

  type Line={
    name:string;
    sku:string;
    quantity:number;
    unit:number;
    discountAmount:number;
    netUnit:number;
    rate:number;
    vat:number;
    total:number;
  };

  /*
    Birim fiyatlar KDV HARİÇ gösteriliyor; e-fatura standardı
    böyle. Toplam sütunu KDV dâhil kalıyor — müşterinin ödediği
    tutar o.

    Kayıtlı fiyatlar KDV dâhil olduğu için hariç tutar
    hesaplanıyor: 310,90 dâhil → 259,08 hariç.
  */
  const exVat=(gross:number,rate:number)=>Math.round(gross/(1+rate/100));

  const buildLine=(name:string,sku:string,quantity:number,unit:number,grossTotal:number,rate:number):Line=>{
    const discountAmount=Math.round(grossTotal*discountRate);
    const paid=grossTotal-discountAmount;
    const vat=Math.round(paid-paid/(1+rate/100));
    const netTotal=paid-vat;
    return {
      name,
      sku,
      quantity,
      /* KDV hariç birim fiyat. */
      unit:exVat(unit,rate),
      /* İndirim de hariç tutar üzerinden gösteriliyor. */
      discountAmount:exVat(discountAmount,rate),
      netUnit:quantity>0?Math.round(netTotal/quantity):netTotal,
      rate,
      vat,
      total:paid,
    };
  };

  const lines:Line[]=(items??[]).map(item=>
    buildLine(item.product_name,item.sku,item.quantity,item.unit_price,item.total,rateBySku.get(item.sku)??20)
  );

  if((order.shipping??0)>0){
    lines.push(buildLine("Kargo bedeli","—",1,order.shipping,order.shipping,20));
  }

  /*
    Akış göstergesi. Her adımın tarihi işlem geçmişinden okunur
    (durum değişikliği kayıtları); ilk adım siparişin oluşturulma
    zamanı.
  */
  const reachedAt=new Map<string,string>([["pending",order.created_at]]);
  for(const event of [...(events??[])].reverse()){
    if(event.event_type!=="status_updated")continue;
    const newStatus=((event.event_data??{}) as Record<string,string|null>).new_status;
    if(newStatus&&!reachedAt.has(newStatus))reachedAt.set(newStatus,event.created_at);
  }
  const closed=isOrderClosed(order.status,order.payment_status);
  const refundedSoFar=Math.max(0,Number(meta.refunded_amount??0)||0);
  /* Düzenleme alacağı: ödenmiş siparişten çıkarılan kalemin parası (migration 20261016115843). */
  /* Havale indirimi ayrı alanda (api/storefront/odeme): gösterilmezse ara toplam − indirim + kargo, toplamı tutmuyordu. */
  const havaleIndirimi=Math.max(0,Number((meta as {transfer_discount?:number}).transfer_discount??0)||0);
  /*
    Siparişten çıkarılan kalemler (migration 20261016121535): satırları
    gidiyor ama müşterinin ne istediği görünür kalsın diye üstü çizili
    çiziliyor. Toplama girmez.
  */
  type CikanKalem={urun:string|null;sku:string|null;adet:number|null;tutar:number|null;islem:string|null;yerine:string|null;zaman:string|null};
  const cikanKalemler=Array.isArray((meta as {cikan_kalemler?:unknown}).cikan_kalemler)?((meta as {cikan_kalemler:CikanKalem[]}).cikan_kalemler):[];
  const havaleYuzdesi=Number((meta as {transfer_discount_percent?:number}).transfer_discount_percent??0)||0;
  const alacak=Math.max(0,Number((meta as {duzenleme_alacagi?:number}).duzenleme_alacagi??0)||0);
  const refundable=Math.max(0,(order.total??0)-refundedSoFar)+alacak;
  const flowIndex=orderFlow.findIndex(step=>step.key===order.status);
  const reachedIndex=flowIndex>=0?flowIndex:Math.max(0,...orderFlow.map((step,index)=>reachedAt.has(step.key)?index:0));
  const badge=orderBadge(order.status,order.payment_status);
  const next=nextOrderStep(order.status,order.payment_status);
  const itemCount=(items??[]).reduce((sum,item)=>sum+item.quantity,0);

  /* İşlem geçmişi: kayıtlı olaylar + oluşturma + (varsa) iade, yeniden eskiye. */
  const timeline=[
    /* Eskiden burada "status_updated mı, değilse kargo" ikilemi vardı:
       tanınmayan her olay "Kargo bilgileri güncellendi" diye gösteriliyordu.
       Etiketler artık tek yerden (lib/order-events.ts). */
    ...(events??[]).map(event=>{
      const data=(event.event_data??{}) as Record<string,string|null>;
      const view=describeOrderEvent(event.event_type,data,{
        orderStatusLabel,paymentStatusLabel,money:(kurus)=>money(kurus,order.currency),
      });
      return {
        id:String(event.id),
        kind:view.kind==="payment"?"status":view.kind==="unknown"?"shipping":view.kind,
        title:view.title,
        detail:view.detail,
        by:event.created_by?"Yetkili kullanıcı":"Sistem",
        at:String(event.created_at),
      };
    }),
    ...(meta.refunded_at?[{id:"refund",kind:"refund",title:"İade yapıldı",detail:money(Number(meta.refunded_amount??0),order.currency),by:"PayTR",at:String(meta.refunded_at)}]:[]),
    {id:"created",kind:"created",title:"Sipariş oluşturuldu",detail:sourceLabel(order.source),by:"",at:String(order.created_at)},
  ].sort((a,b)=>b.at.localeCompare(a.at));

  /*
    Havale ödemesi bekleyen sipariş: Operasyon'daki tek tık onay ve
    süresi geçince iptal burada da var. Öncesinde detayda ödeme ve
    durum listelerini elle değiştirmek gerekiyordu.
  */
  const transferPending=isBankTransfer(meta)&&["pending","authorized"].includes(order.payment_status)&&!closed;
  const waitedHours=Math.max(0,Math.floor((transferClock()-Date.parse(order.created_at))/3_600_000));
  const waitedLabel=waitedHours<24?`${waitedHours} saattir`:`${Math.floor(waitedHours/24)} gündür`;
  const transferStale=transferPending&&waitedHours>=TRANSFER_STALE_HOURS;

  /*
    ÜÇ SÜTUN (16.10.2026, ArvoOS'un iş detayı): solda müşteri ve adresler,
    ortada asıl iş (akış, kalemler, gönderiler), sağda sekmeli akış
    (geçmiş, operasyon notu, iade). Durum ve ödeme üstteki şeritte,
    değişince anında kaydediliyor.

    Eskiden üstte dört özet kutusu, altında üç adres kartı, kalemler ve
    gönderiler alt alta diziliyordu; durum, not, iade ve geçmiş başlıktaki
    düğmelerle açılan pencerelerdeydi. Gönderiyi hazırlarken geçmişe ya da
    nota bakmak bir pencere açıp kapatmak demekti.

    Eski ?pencere= bağlantıları ilgili sekmeyi seçiyor.
  */
  const adres=`/siparisler/${order.id}`;
  /* Düzenleme kapısı veritabanındakinin aynası (arc_siparis_kalemi_duzenle); asıl karar orada. */
  const odemeYontemi=(meta.payment_method??"").toLocaleLowerCase("tr-TR");
  const kartBekliyor=["pending","authorized"].includes(order.payment_status)&&odemeYontemi!==""&&!odemeYontemi.includes("havale");
  const duzenlenebilir=canManage&&["pending","confirmed","processing"].includes(order.status)&&!["refunded","partially_refunded"].includes(order.payment_status)&&!kartBekliyor;
  const odenmis=order.payment_status==="paid";
  const gonderidekiKalemler=new Set(acikGonderiler.flatMap(g=>g.items.map(k=>k.order_item_id)));
  /*
    ADIMLAR: dört sipariş durumu + TESLİM EDİLDİ. Teslim bir sipariş durumu
    değil, gönderilerden türüyor (kargoGorunumu → "teslim"); kargoya
    verilmiş ama teslim edilmemiş siparişte beşinci adım "şu an".
  */
  const adimlar=[...orderFlow,{key:"delivered",label:"Teslim edildi"}];
  const teslimEdildi=kargoDurumuOzet==="teslim";
  const adimSirasi=teslimEdildi||order.status==="fulfilled"?adimlar.length-1:reachedIndex;
  const iadeAcik=["paid","partially_refunded"].includes(order.payment_status)&&refundable>0&&!(meta.refunded_at&&refundedSoFar<=0)&&!isBankTransfer(meta)&&["owner","admin"].includes(membership.role);
  /* Kargo ilk sekme: gönderi hazırlamak bu sayfanın en sık işi (16.10.2026). */
  const sekmeler=["Kargo",`Geçmiş (${timeline.length})`,"Operasyon notu",...(iadeAcik?["İade"]:[])];
  const ilkSekme=query.pencere==="gecmis"?1:query.pencere==="durum"?2:query.pencere==="iade"&&iadeAcik?3:0;
  const musteriAdi:string=formatPersonName(order.customer_name)||order.customer_email||"Misafir müşteri";
  const telefon:string|null=meta.shipping_address?.phone??meta.billing?.phone??null;
  const basHarfler=musteriAdi.split(/\s+/).filter(Boolean).slice(0,2).map((p)=>p.charAt(0).toLocaleUpperCase("tr-TR")).join("")||"?";
  const kargoOzeti=acikGonderiler.length
    ?`${acikGonderiler.length} paket · ${!takipliGonderiSayisi?"takip no bekleniyor":kargoDurumuOzet==="teslim"?"teslim edildi":kargoDurumuOzet==="tamam"?"tamamı kargoda":kargoDurumuOzet==="kismi"?"bir kısmı kargoda":"kargoya verilmedi"}`
    :meta.tracking_number?`Takip: ${meta.tracking_number}`:"Henüz kargoya verilmedi";
  /* Seçim kutusunun tonu rozetle aynı: şeride bakınca renk de bilgi veriyor. */
  const durumTonu=rozetTonu(badge.tone);
  const odemeTonu=order.payment_status==="paid"?"success":["pending","authorized"].includes(order.payment_status)?"warning":["failed","refunded","partially_refunded"].includes(order.payment_status)?"danger":"neutral";

  return (
    <main className="crm-page-stack talep opd opd-v3 siparis-detay">
      <AnindaYedek />
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">SİPARİŞ · {when(order.created_at)}</small>
          <h1>{order.order_number}</h1>
        </div>
        <div className="talep-bas-eylem order-noprint">
          {canManage&&next?(
            <form action={quickStatus}>
              <input type="hidden" name="order_id" value={order.id}/>
              <input type="hidden" name="status" value={next.key}/>
              <input type="hidden" name="back" value={adres}/>
              <button className="panel-primary" type="submit">{next.label} →</button>
            </form>
          ):null}
          <details className="os-menu talep-menu">
            <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
            <div className="os-menu-list" role="menu">
              <PrintButton className="os-menu-item" />
              {order.customer_email?<a className="os-menu-item" href={`mailto:${order.customer_email}`}>Müşteriye e-posta</a>:null}
              <Link prefetch={false} className="os-menu-item" href="/siparisler">Siparişlere dön</Link>
            </div>
          </details>
        </div>
      </header>

      {transferPending?(
        <div className="siparis-havale">
        <KNot ton={transferStale?"tehlike":"uyari"}>
          <b>{transferStale?`Havale ${waitedLabel} ödenmedi · süresi geçti.`:`Havale ödemesi bekleniyor · ${waitedLabel}.`}</b>{" "}
          Ödeme hesabınıza ulaştıysa onaylayın; müşteriye “Ödemeniz alındı” e-postası gider.{transferStale?" Ödeme gelmeyecekse siparişi iptal edebilirsiniz.":""}
        </KNot>
        {/* Düğmeler notun DIŞINDA: not bir paragraf, içindeki form tarayıcıda paragrafı bölüyordu. */}
          {canManage?(
            <span className="siparis-not-eylem order-noprint">
              <form action={confirmTransferPayment}>
                <input type="hidden" name="order_id" value={order.id}/>
                <input type="hidden" name="back" value={adres}/>
                <ConfirmSubmit className="panel-primary" message={`${order.order_number} için ${money(order.total,order.currency)} havale ödemesi alındı olarak işaretlensin mi? Müşteriye “Ödemeniz alındı” e-postası gönderilir.`}>Ödeme alındı</ConfirmSubmit>
              </form>
              {transferStale?(
                <form action={cancelTransferOrder}>
                  <input type="hidden" name="order_id" value={order.id}/>
                  <input type="hidden" name="back" value={adres}/>
                  <ConfirmSubmit className="panel-danger" message={`${order.order_number} ${waitedLabel} ödenmedi. Sipariş iptal edilsin mi? Müşteriye “Siparişiniz iptal edildi” e-postası gönderilir.`}>İptal et</ConfirmSubmit>
                </form>
              ):null}
            </span>
          ):null}
        </div>
      ):null}
      {closed?(
        <KNot ton="tehlike">
          <b>Sipariş kapandı · {badge.label}.</b>{" "}
          {meta.refunded_at?`${money(Number(meta.refunded_amount??0),order.currency)} iade edildi · ${when(String(meta.refunded_at))}. `:""}
          Kapanmış sipariş akışta ilerletilemez.
        </KNot>
      ):null}


      {alacak>0?(
        <div className="siparis-havale">
          <KNot ton="uyari">
            <b>Müşteriye {money(alacak,order.currency)} iade edilecek.</b>{" "}
            Sipariş ödendikten sonra düzenlendi ve toplam düştü.{isBankTransfer(meta)?" Havale siparişi: tutarı bankadan iade edip burada işaretleyin.":" İade sekmesinden kartına geri ödeyin."}
          </KNot>
          {["owner","admin"].includes(membership.role)?(
            <span className="siparis-not-eylem order-noprint">
              {isBankTransfer(meta)?(
                <form action={alacakKapat}>
                  <input type="hidden" name="order_id" value={order.id}/>
                  <ConfirmSubmit className="panel-primary" message={`${money(alacak,order.currency)} müşteriye bankadan iade edildi olarak işaretlensin mi?`}>Bankadan iade ettim</ConfirmSubmit>
                </form>
              ):<Link prefetch={false} scroll={false} className="panel-primary" href={`${adres}?pencere=iade`}>İadeye git</Link>}
            </span>
          ):null}
        </div>
      ):null}

      {/*
        DURUM ŞERİDİ (ArvoOS'un iş detayındaki gibi): durum ve ödeme
        seçilince anında kaydediliyor (AnindaForm). İki form birbirinin
        alanını gizli taşıyor: işlem ikisini birlikte istiyor ve biri
        boş giderse "geçersiz durum" dönerdi.
      */}
      <div className="opd-serit order-noprint">
        <AnindaForm action={updateOrderStatus} className="opd-ff">
          <input type="hidden" name="order_id" value={order.id}/>
          <input type="hidden" name="payment_status" value={order.payment_status}/>
          <label className="opd-ff-etiket" htmlFor="siparis-durumu">Durum</label>
          <select key={order.status} id="siparis-durumu" name="status" defaultValue={order.status} disabled={!canManage} data-tone={durumTonu}>
            {orderStatusOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
        </AnindaForm>
        <AnindaForm action={updateOrderStatus} className="opd-ff">
          <input type="hidden" name="order_id" value={order.id}/>
          <input type="hidden" name="status" value={order.status}/>
          <label className="opd-ff-etiket" htmlFor="odeme-durumu">Ödeme</label>
          <select key={order.payment_status} id="odeme-durumu" name="payment_status" defaultValue={order.payment_status} disabled={!canManage} data-tone={odemeTonu}>
            {paymentStatusOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
          {/* Elle değiştirmenin bedeli başlıkta: eskiden durum penceresindeki notta. */}
          <span className="opd-ff-not" title="Ödeme durumu normalde PayTR bildirimiyle güncellenir; elle değiştirmek muhasebe kayıtlarıyla uyumsuzluk yaratabilir.">{meta.payment_method??"Kredi kartı"}</span>
        </AnindaForm>
        <div className="opd-ff">
          <span className="opd-ff-etiket">Kargo</span>
          <span className="opd-ff-not" data-tone={kargoDurumuOzet==="teslim"?"success":kargoDurumuOzet==="kismi"?"warning":undefined}>{kargoOzeti}</span>
        </div>
        {/*
          FATURA DÖKÜMÜ şeridin sağında, pencerede (16.10.2026, kurum
          sahibi). Eskiden sipariş kartının dibinde katlanmış duruyordu ve
          dokuz sütunu orta sütuna sığmıyordu; pencerede tam genişlik.
        */}
        <div className="siparis-serit-sag">
          <PanelModal triggerLabel="Fatura dökümü" boy="genis" kicker={`${order.order_number} · FATURA DÖKÜMÜ`} title="Fatura dökümü" description="Birim fiyatlar KDV hariç; indirim (kupon ve havale) kalemlere orantılı dağıtılır, KDV oranlara göre matrahıyla ayrılır.">
            <div className="fatura-belge">
              <header className="fatura-bas">
                <div>
                  <small>SİPARİŞ</small>
                  <b>{order.order_number}</b>
                  <span>{when(order.created_at)}</span>
                </div>
                <div>
                  <small>MÜŞTERİ</small>
                  <b>{musteriAdi}</b>
                  {[meta.billing?.address1,meta.billing?.address2,[meta.billing?.zip,meta.billing?.city].filter(Boolean).join(" "),meta.billing?.province].filter(Boolean).map((satir,sira)=><span key={sira}>{satir}</span>)}
                  {order.customer_email?<span>{order.customer_email}</span>:null}
                </div>
                <div>
                  <small>ÖDEME</small>
                  <b>{meta.payment_method??"Kredi kartı"}</b>
                  <span>{paymentStatusLabel(order.payment_status)}</span>
                </div>
              </header>
              <div className="siparis-kalemler">
          <div className="ac-lines">
            <div className="ac-line ac-line-head">
              <span>ÜRÜN / SKU</span>
              <span>ADET</span>
              <span>BİRİM (HARİÇ)</span>
              <span>İND. %</span>
              <span>İNDİRİM</span>
              <span>İND. BİRİM (HARİÇ)</span>
              <span>KDV %</span>
              <span>KDV</span>
              <span>TOPLAM (DÂHİL)</span>
            </div>

            {lines.map((line,index)=>(
              <div className="ac-line" key={`${line.sku}-${index}`}>
                <span>
                  <b>{line.name}</b>
                  <span className="ac-dim">{line.sku}</span>
                </span>
                <span>{line.quantity}</span>
                <span>{money(line.unit,order.currency)}</span>
                <span>{discountRate>0?`%${(discountRate*100).toLocaleString("tr-TR",{maximumFractionDigits:1})}`:"—"}</span>
                <span>{line.discountAmount>0?`−${money(line.discountAmount,order.currency)}`:"—"}</span>
                <span>{money(line.netUnit,order.currency)}</span>
                <span>%{line.rate}</span>
                <span>{money(line.vat,order.currency)}</span>
                <span><b>{money(line.total,order.currency)}</b></span>
              </div>
            ))}
          </div>

          <div className="ac-totals">
            {bracketList.map(([rate,v])=>(
              <span key={rate}>%{rate} matrah <b>{money(v.matrah,order.currency)}</b></span>
            ))}
            {bracketList.map(([rate,v])=>(
              <span key={`k${rate}`}>KDV %{rate} <b>{money(v.kdv,order.currency)}</b></span>
            ))}
          </div>
              </div>
              <dl className="siparis-toplamlar fatura-toplam">
                <div><dt>Ara toplam (KDV dâhil)</dt><dd>{money(order.subtotal??0,order.currency)}</dd></div>
                {(order.shipping??0)>0?<div><dt>Kargo</dt><dd>{money(order.shipping,order.currency)}</dd></div>:null}
                {discount>0?<div><dt>İndirim{meta.coupon_code?` · ${meta.coupon_code}`:""}</dt><dd>−{money(discount,order.currency)}</dd></div>:null}
                {havaleIndirimi>0?<div><dt>Havale indirimi{havaleYuzdesi?` · %${havaleYuzdesi}`:""}</dt><dd>−{money(havaleIndirimi,order.currency)}</dd></div>:null}
                <div><dt>Toplam KDV</dt><dd>{money(order.tax??0,order.currency)}</dd></div>
                <div className="is-toplam"><dt>Ödenecek toplam</dt><dd>{money(order.total,order.currency)}</dd></div>
              </dl>
              <p className="fatura-not">Bu döküm bilgi amaçlıdır; yasal fatura yerine geçmez.</p>
            </div>
            <div className="fatura-eylem order-noprint">
              <FaturaYazdir />
            </div>
          </PanelModal>
        </div>
      </div>

      <div className="talep-izgara opd-izgara">
        <section className="panel-card talep-musteri" aria-label="Müşteri ve teslimat">
          <div className="talep-musteri-kimlik">
            <span className="talep-avatar" aria-hidden="true">{basHarfler}</span>
            <div>
              <h2>{musteriAdi}</h2>
              <small>Müşteri · {sourceLabel(order.source)}</small>
            </div>
          </div>
          {telefon||order.customer_email?(
            <div className="talep-iletisim order-noprint">
              {telefon?<a className="panel-secondary" href={`tel:${telefon.replace(/[^\d+]/g,"")}`}>Ara</a>:null}
              {order.customer_email?<a className="panel-secondary" href={`mailto:${order.customer_email}`}>E-posta</a>:null}
            </div>
          ):null}
          <dl className="talep-liste">
            <div><dt>Telefon</dt><dd>{telefon||<em>Yok</em>}</dd></div>
            <div><dt>E-posta</dt><dd>{order.customer_email||<em>Yok</em>}</dd></div>
            <div><dt>Tarih</dt><dd>{when(order.created_at)}</dd></div>
            <div><dt>Ödeme türü</dt><dd>{meta.payment_method??"Kredi kartı"}</dd></div>
            {meta.coupon_code?<div><dt>İndirim kodu</dt><dd><code>{meta.coupon_code}</code></dd></div>:null}
            {discount>0?<div><dt>İndirim</dt><dd>{money(discount,order.currency)}</dd></div>:null}
          </dl>
          <AdresBolumu baslik="Teslimat adresi" adres={meta.shipping_address}/>
          <AdresBolumu baslik="Fatura adresi" adres={meta.billing}/>
          {meta.notes?(
            <div className="talep-gecmis">
              <h3>Müşteri notu</h3>
              <p className="siparis-not">{meta.notes}</p>
            </div>
          ):null}
          {meta.internal_note?(
            <div className="talep-gecmis">
              <h3>Operasyon notu</h3>
              <p className="siparis-not">{meta.internal_note}</p>
            </div>
          ):null}
          <p className="opd-zaman">Oluşturuldu {when(order.created_at)} · güncellendi {when(order.updated_at)}</p>
        </section>

        <section className="panel-card talep-bilgi opd-gorevler" aria-label="Sipariş">
          <header className="opd-gorev-bas">
            <div>
              <h2>Sipariş</h2>
              <small>{items?.length??0} kalem · {itemCount} adet · birim fiyatlar KDV hariç</small>
            </div>
            <strong>{money(order.total,order.currency)}</strong>
          </header>

          <ol className="order-steps siparis-adimlar order-noprint" data-closed={closed?"":undefined}>
            {adimlar.map((step,index)=>{
              const done=index<adimSirasi||(index===adimSirasi&&(closed||teslimEdildi));
              const current=index===adimSirasi&&!done;
              const at=reachedAt.get(step.key);
              return <li key={step.key} className={done?"is-done":current?"is-current":undefined} aria-current={current?"step":undefined}>
                <span className="order-step-dot">{done?<Icon name="check" size={12}/>:index+1}</span>
                <b>{step.label}</b>
                <small>{step.key==="delivered"?(teslimEdildi?"Teslim":current?"Yolda":"—"):at&&index<=adimSirasi?shortDate.format(new Date(at)):current?"Şu an":"—"}</small>
              </li>;
            })}
          </ol>

          {/*
            KALEMLER DERLİ TOPLU (16.10.2026). Dokuz sütunluk fatura dökümü
            orta sütunda okunmuyordu: ürün adı dört satıra bölünüyor, satır
            başına 100px yer kaplıyordu. Günlük soru "ne, kaç tane, ne
            tutuyor, stokta mı"; fatura dökümü aşağıda katlanmış duruyor
            (açılıp yazdırılırsa belgeye girer).
          */}
          <ul id="kalemler" className="siparis-kalem-listesi">
            {(items??[]).map(kalem=>{
              const varyant=kalem.variant_id?varyantById.get(kalem.variant_id):undefined;
              const urunSecenekleri=kalem.variant_id?secenekler.filter(v=>v.product_id===urunByVaryant.get(kalem.variant_id!)):[];
              const tukendi=Boolean(varyant&&!satilabilir(varyant)&&!closed&&order.status!=="fulfilled");
              const gonderide=gonderidekiKalemler.has(kalem.id);
              return <li key={kalem.id} data-tukendi={tukendi?"":undefined}>
                <div className="siparis-kalem-ad">
                  <b title={kalem.product_name}>{kalem.product_name}</b>
                  <small>
                    {varyant?.title?<span>{varyant.title}</span>:null}
                    <span className="siparis-kalem-sku">{kalem.sku}</span>
                    {tukendi?<span className="status-pill" data-tone="danger">{varyant?.supplier?"Tedarikçide tükendi":"Stokta yok"}</span>:null}
                    {gonderide?<span className="status-pill" data-tone="info">Gönderide</span>:null}
                  </small>
                </div>
                <span className="siparis-kalem-adet">{kalem.quantity} × {money(kalem.unit_price,order.currency)}</span>
                <b className="siparis-kalem-tutar">{money(kalem.total,order.currency)}</b>
                {duzenlenebilir&&!gonderide?(
                  <PanelDrawer triggerLabel="Düzenle" triggerClassName="siparis-kalem-duzenle order-noprint" kicker={`${order.order_number} · KALEM`} title={kalem.product_name} description="Adedi değiştirin, başka bir varyantla değiştirin ya da kalemi siparişten çıkarın. Stok ve toplam aynı anda güncellenir.">
                    <form action={kalemiDuzenle} className="order-form-grid">
                      <input type="hidden" name="order_id" value={order.id}/>
                      <input type="hidden" name="item_id" value={kalem.id}/>
                      {urunSecenekleri.length>1?(
                        <label>Varyant
                          <select name="variant_id" defaultValue={kalem.variant_id??""} className="ac-input">
                            {urunSecenekleri.map(v=>{
                              const uygun=satilabilir(v)||v.id===kalem.variant_id;
                              return <option key={v.id} value={v.id} disabled={!uygun}>{v.title||v.sku} · {money(v.price,order.currency)} · {v.id===kalem.variant_id?"şu anki":satilabilir(v)?(v.supplier||!v.allow_backorder?`stok ${v.stock}`:"stoksuz satış"):"tükendi"}</option>;
                            })}
                          </select>
                        </label>
                      ):null}
                      <label>Adet<input name="adet" type="number" min={1} max={999} defaultValue={kalem.quantity} className="ac-input"/></label>
                      <p className="list-hint">{odenmis
                        ?"Sipariş ödenmiş: toplam düşerse fark “müşteriye iade edilecek” olarak yazılır ve İade sekmesinden geri ödenir. Ödenen tutar aşılamaz."
                        :"Sipariş henüz ödenmedi: müşteri yeni toplamı öder."} Tedarikçi ürününde stok, ürünün canlı sayfasından doğrulanır.</p>
                      <button className="ac-btn ac-btn-primary" type="submit">Kaydet</button>
                    </form>
                    {(items?.length??0)>1?(
                      <form action={kalemiDuzenle} className="siparis-kalem-kaldir">
                        <input type="hidden" name="order_id" value={order.id}/>
                        <input type="hidden" name="item_id" value={kalem.id}/>
                        <input type="hidden" name="adet" value="0"/>
                        <ConfirmSubmit className="panel-danger" message={`${kalem.product_name} (${kalem.sku}) siparişten çıkarılsın mı? Stok geri verilir, toplam yeniden hesaplanır.${odenmis?" Fark müşteriye iade edilecek tutar olarak yazılır.":""}`}>Kalemi siparişten çıkar</ConfirmSubmit>
                      </form>
                    ):<p className="list-hint">Siparişte tek kalem var: çıkarmak yerine siparişi iptal edin (Durum → İptal).</p>}
                  </PanelDrawer>
                ):null}
              </li>;
            })}
            {cikanKalemler.map((kalem,sira)=>(
              <li key={`cikan-${sira}`} className="is-cikan">
                <div className="siparis-kalem-ad">
                  <b title={kalem.urun??""}>{kalem.urun||kalem.sku||"Ürün"}</b>
                  <small>
                    <span className="siparis-kalem-sku">{kalem.sku}</span>
                    <span className="status-pill" data-tone="neutral">{kalem.islem==="degisti"?`Değiştirildi${kalem.yerine?` → ${kalem.yerine}`:""}`:"Siparişten çıkarıldı"}{kalem.zaman?` · ${shortDate.format(new Date(kalem.zaman))}`:""}</span>
                  </small>
                </div>
                <span className="siparis-kalem-adet">{kalem.adet??"—"} adet</span>
                <b className="siparis-kalem-tutar">{kalem.tutar!=null?money(Number(kalem.tutar),order.currency):"—"}</b>
              </li>
            ))}
          </ul>

          <dl className="siparis-toplamlar">
            <div><dt>Ara toplam</dt><dd>{money(order.subtotal??0,order.currency)}</dd></div>
            <div><dt>Kargo</dt><dd>{(order.shipping??0)>0?money(order.shipping,order.currency):"Ücretsiz"}</dd></div>
            {discount>0?<div><dt>İndirim{meta.coupon_code?` · ${meta.coupon_code}`:""}</dt><dd>−{money(discount,order.currency)}</dd></div>:null}
            {havaleIndirimi>0?<div><dt>Havale indirimi{havaleYuzdesi?` · %${havaleYuzdesi}`:""}</dt><dd>−{money(havaleIndirimi,order.currency)}</dd></div>:null}
            <div><dt>KDV (dâhil)</dt><dd>{money(order.tax??0,order.currency)}</dd></div>
            <div className="is-toplam"><dt>Toplam</dt><dd>{money(order.total,order.currency)}</dd></div>
            {alacak>0?<div className="is-alacak"><dt>Müşteriye iade edilecek</dt><dd>{money(alacak,order.currency)}</dd></div>:null}
          </dl>


        </section>

        {/* Sağ sütun: ArvoOS'taki sekmeli akış (TalepAkis). */}
        <TalepAkis sekmeler={sekmeler} baslangic={ilkSekme}>
          <div className="siparis-sekme">
            <section id="gonderiler" className="siparis-gonderiler">
              <div className="ac-head">
                <div><h3>Gönderiler</h3><p>{acikGonderiler.length?`${acikGonderiler.length} gönderi · ${
                  kargoDurumuOzet==="teslim"?"tamamı teslim edildi"
                  :kargoDurumuOzet==="tamam"?"tüm ürünler kargoda"
                  :kargoDurumuOzet==="kismi"?"bir kısmı kargoda"
                  :"henüz kargoya verilmedi"}`:"Bu siparişte henüz gönderi yok."}</p></div>
                {/*
                  Durum OTO'dan ÇEKİLİYOR, webhook'la gelmiyor: OTO'nun webhook
                  yükünün şekli belgelenmemiş ve tahmine dayalı bir uç nokta,
                  yanlış eşleşen bir bildirimin gönderiyi "teslim edildi"
                  yapması demekti. Siparişteki bütün açık gönderiler tek
                  düğmeyle güncelleniyor.
                */}
                {canManage&&gonderiler.some(g=>g.source==="oto"&&!["draft","cancelled","delivered"].includes(g.status))
                  ?<form action={kargoDurumlariniGuncelle}><input type="hidden" name="order_id" value={order.id}/><button type="submit" className="shipment-refresh">Kargo durumlarını güncelle</button></form>
                  :null}
              </div>

              {acikGonderiler.length?<ul className="shipment-list">
                {acikGonderiler.map(gonderi=>
                  <li key={gonderi.id} data-durum={gonderi.status}>
                    <div className="shipment-head">
                      <b>{gonderi.sequence}. paket{gonderi.supplier?` · ${gonderi.supplier}`:""}</b>
                      <span data-durum={gonderi.status}>{gonderiDurumEtiketi(gonderi.status,gonderi.source)}</span>
                    </div>
                    <p>{gonderi.carrier_name??"Firma belirtilmedi"}{gonderi.tracking_number?` · ${gonderi.tracking_number}`:""}</p>
                    <p className="shipment-items">{gonderi.items.map(kalem=>`${kalemAdi.get(kalem.order_item_id)??"Ürün"} ×${kalem.quantity}`).join(" · ")||"Kalem yok"}</p>
                    {gonderi.failure_reason?<p className="shipment-error">{gonderi.failure_reason}</p>:null}

                    {/*
                      TASLAK gönderi: kalemler ayrıldı, OTO'ya henüz dokunulmadı
                      (bakiye harcanmadı). Firma fiyatıyla birlikte seçiliyor;
                      tek adımda yapılsaydı kullanıcı fiyatı görmeden seçerdi.
                    */}
                    {/*
                      FİYAT SORGUSU NEYE GÖRE YAPILDI — açıkça yazılı. OTO
                      panelindeki fiyatla buradaki farklı çıkabiliyor: orada
                      paket ölçüleri ve teslim biçimi (şubeye teslim / adresten
                      alım) tek tek seçiliyor, burada yalnızca şehir ve ağırlık
                      gönderiliyor. Sayıyı sebebini söylemeden göstermek, farkı
                      hata sanmaya yol açıyordu.
                    */}
                    {canManage&&gonderi.source==="oto"&&gonderi.status==="draft"?<>
                      <form method="get" className="shipment-weight">
                        <label>Ağırlık (kg)<input name="agirlik" type="number" step="0.1" min="0.1" max="100" defaultValue={sorgulananAgirlik}/></label>
                        <label>En (cm)<input name="en" type="number" min="1" max="200" defaultValue={olcu.enCm}/></label>
                        <label>Boy (cm)<input name="boy" type="number" min="1" max="200" defaultValue={olcu.boyCm}/></label>
                        <label>Yükseklik (cm)<input name="yuk" type="number" min="1" max="200" defaultValue={olcu.yukseklikCm}/></label>
                        <button type="submit">Fiyatları yenile</button>
                        {/* Hacimsel ağırlık gösteriliyor: fiyat gerçek ağırlıkla
                            bunun BÜYÜĞÜNDEN hesaplanıyor ve kullanıcı neden o
                            fiyatı gördüğünü ancak böyle anlıyor. */}
                        <small>{(kargoAyarSatiri as {address_city?:string|null}|null)?.address_city||"?"} → {teslimatAdresi.city||"?"} · {sorgulananAgirlik} kg · hacimsel {hacimsel} kg{hacimsel>sorgulananAgirlik?" (fiyat buna göre)":""} · {kargoSecenekleri.length} seçenek</small>
                      </form>
                      <form action={otoEtiketUret} className="shipment-oto">
                        <input type="hidden" name="order_id" value={order.id}/>
                        <input type="hidden" name="shipment_id" value={gonderi.id}/>
                        {kargoSecenekleri.length?<>
                          <label>Kargo seçeneği<select name="delivery_option_id" defaultValue={kargoSecenekleri[0]?.id}>
                            {kargoSecenekleri.map(secenek=>
                              /* Değer "id|ad": firma adı createOrder yanıtından
                                 okunamıyor (alan adları sürümden sürüme değişiyor
                                 ve canlıda boş geldi — kart "Etiket üretildi ·
                                 firma belirtilmedi" diyordu). Kullanıcının
                                 EKRANDA GÖRDÜĞÜ ad kayda da o şekilde giriyor. */
                              <option key={secenek.id} value={`${secenek.id}|${secenek.firmaAdi}`}>
                                {secenek.firmaAdi}{secenek.teslimTuru?` · ${secenek.teslimTuru}`:""}{secenek.hizmet?` · ${secenek.hizmet}`:""}{secenek.ucretKurus!==null?` · ${money(secenek.ucretKurus,order.currency)}`:" · fiyat yok"}{secenek.tahminiTeslim?` · ${secenek.tahminiTeslim}`:""}
                              </option>)}
                          </select></label>
                          {/* Ağırlık gizli: fiyat zaten bu ağırlıkla soruldu ve
                              etiket de onunla üretilmeli, yoksa seçilen fiyatla
                              gerçekleşen fiyat tutmaz. */}
                          <input type="hidden" name="weight" value={sorgulananAgirlik}/>
                          <input type="hidden" name="en" value={olcu.enCm}/>
                          <input type="hidden" name="boy" value={olcu.boyCm}/>
                          <input type="hidden" name="yuk" value={olcu.yukseklikCm}/>
                          <button type="submit">Etiket üret</button>
                        </>:<p className="shipment-error">{kargoFiyatHatasi??"Bu adres için kargo seçeneği dönmedi. Teslimat şehrini ve mağaza ayarlarındaki çıkış şehrini kontrol edin."}</p>}
                      </form></>:null}
                    <div className="shipment-actions">
                      {/* Etiket Tarzyeri'ne gönderilecek olan; kargoya vermenin ön şartı. */}
                      {gonderi.awb_url?<a href={gonderi.awb_url} target="_blank" rel="noreferrer" className="shipment-awb">Etiketi yazdır ↗</a>:null}
                      {gonderi.tracking_url?<a href={gonderi.tracking_url} target="_blank" rel="noreferrer">Kargo takip ↗</a>:null}
                      {/* Kargo firması AWB'yi bazen gecikmeyle üretiyor; ilk
                          çağrıda adres boş dönerse buradan yeniden sorulabiliyor. */}
                      {canManage&&gonderi.source==="oto"&&gonderi.status!=="draft"&&gonderi.status!=="cancelled"&&!gonderi.awb_url
                        ?<form action={etiketiAl}><input type="hidden" name="order_id" value={order.id}/><input type="hidden" name="shipment_id" value={gonderi.id}/><button type="submit">Etiketi al</button></form>
                        :null}
                      {/*
                        ONAY İSTENİYOR: OTO gönderisinde iptal artık OTO'da da
                        yapılıyor ve etiket geçersizleşiyor. Teslim edilmiş
                        gönderide düğme hiç görünmüyor — iptal edilecek bir şey
                        yok, kalemleri yeniden bölünebilir saymak ikinci kez
                        göndermeye açık bırakırdı.
                      */}
                      {/*
                        TESLİM EDİLDİ. Cron yalnızca tryOTO gönderilerini
                        izliyor; tedarikçinin kendi gönderdiği paketten OTO
                        haberdar değil ve o kayıtlar sonsuza kadar "Kargoda"
                        kalıyordu. Kargo firmalarının takip sayfasını kazımak
                        denenmedi: bugün Sürat'ın formunun yalnızca POST
                        kabul ettiğini, MNG'nin alan adının öldüğünü ölçtük;
                        tahmine dayalı izleme yanlış "teslim edildi" üretir.

                        OTO gönderilerinde de duruyor — cron gecikirse ya da
                        OTO durumu geç yazarsa elle kapatmak gerekebiliyor.
                      */}
                      {canManage&&!["cancelled","delivered"].includes(gonderi.status)&&gonderi.tracking_number?(
                        <form action={gonderiTeslimEdildi}>
                          <input type="hidden" name="order_id" value={order.id}/>
                          <input type="hidden" name="shipment_id" value={gonderi.id}/>
                          <button type="submit" className="shipment-delivered">Teslim edildi</button>
                        </form>
                      ):null}

                      {canManage&&gonderi.status!=="cancelled"&&gonderi.status!=="delivered"?(
                        <form action={gonderiIptal}>
                          <input type="hidden" name="order_id" value={order.id}/>
                          <input type="hidden" name="shipment_id" value={gonderi.id}/>
                          <ConfirmSubmit message={
                            gonderi.source==="oto"&&!["draft","failed"].includes(gonderi.status)
                              ? `${gonderi.sequence}. paket OTO'da da iptal edilecek ve üretilen etiket geçersiz olacak. Kurye alıma geldiyse önce kargo firmasıyla görüşün. Devam edilsin mi?`
                              : `${gonderi.sequence}. paket iptal edilsin mi? Kalemleri yeniden bölünebilir olur.`
                          }>İptal et</ConfirmSubmit>
                        </form>
                      ):null}

                      {/*
                        YİNE DE KAPAT. OTO iptali reddettiyse kayıt kilitli
                        kalıyordu: kalemler "kargoda" sayıldığı için müşteriye
                        yeniden gönderilemiyordu. Düğme yalnızca o hata
                        yazılıysa çıkıyor ve sebebi kayda not düşüyor —
                        sessizce ayrışmak yerine açık bir karar.
                      */}
                      {canManage&&gonderi.status!=="cancelled"&&gonderi.failure_reason?.startsWith("OTO iptal etmedi")?(
                        <form action={gonderiIptal}>
                          <input type="hidden" name="order_id" value={order.id}/>
                          <input type="hidden" name="shipment_id" value={gonderi.id}/>
                          <input type="hidden" name="zorla" value="on"/>
                          <ConfirmSubmit message={`${gonderi.sequence}. paket OTO'da iptal EDİLMEDİ. Kargo firmasıyla görüşüp paketin durdurulduğundan emin olduysanız bu kaydı kapatabilirsiniz; kalemleri yeniden bölünebilir olur. Devam edilsin mi?`}>Yine de kapat</ConfirmSubmit>
                        </form>
                      ):null}
                    </div>
                  </li>)}
              </ul>:null}

              {/*
                İPTAL EDİLENLER KATLANIYOR ve TEK SATIRA İNİYOR.

                İptal edilmiş gönderide taslak formu, fiyat alanı ve etiket
                düğmesi anlamsız; yine de tam kart çiziliyordu. Bu siparişte on
                iptal kaydı 1.218px yer kaplıyordu — sayfanın dörtte biri
                (canlıda ölçüldü, 27.09.2026). Kayıtlar SİLİNMİYOR: hangi
                denemenin neden düştüğü sorusunun cevabı onlarda.
              */}
              {iptalGonderiler.length?(
                <details className="shipment-cancelled">
                  <summary>{iptalGonderiler.length} iptal edilen gönderi</summary>
                  <ul>
                    {iptalGonderiler.map(gonderi=>
                      <li key={gonderi.id}>
                        <b>{gonderi.sequence}. paket{gonderi.supplier?` · ${gonderi.supplier}`:""}</b>
                        {gonderi.tracking_number?<span>{gonderi.tracking_number}</span>:null}
                        {gonderi.failure_reason?<small>{gonderi.failure_reason}</small>:null}
                      </li>
                    )}
                  </ul>
                </details>
              ):null}

              {/*
                Yeni gönderi TEDARİKÇİYE GÖRE öneriliyor: aynı depodan çıkanlar
                bir pakette. Tamamı kargoya verilmiş tedarikçi burada hiç
                görünmüyor.
              */}
              {canManage&&gruplar.length?<div className="shipment-new">
                {gruplar.map(grup=>
                  <form key={grup.tedarikci??"belirsiz"} action={elleGonderiEkle} className="shipment-form">
                    <input type="hidden" name="order_id" value={order.id}/>
                    <input type="hidden" name="supplier" value={grup.tedarikci??""}/>
                    <h4>{grup.tedarikci??"Tedarikçisi belirsiz"}<small>{grup.toplamAdet} ürün kargoya verilmedi</small></h4>
                    <div className="shipment-item-picks">
                      {grup.kalemler.map(kalem=>
                        <label key={kalem.id}>
                          <span>{kalem.ad}</span>
                          <input type="number" name={`kalem_${kalem.id}`} min={0} max={kalem.kalan} defaultValue={kalem.kalan}/>
                          <em>/ {kalem.kalan}</em>
                        </label>)}
                    </div>
                    <div className="shipment-form-fields">
                      <label>Kargo firması<select name="carrier_code" defaultValue="">
                        <option value="" disabled>Seçin</option>
                        {KARGO_FIRMALARI.map(firma=><option key={firma.kod} value={firma.kod}>{firma.ad}</option>)}
                      </select></label>
                      <label>Takip numarası<input name="tracking_number" placeholder="Tedarikçiden gelen numara" autoComplete="off"/></label>
                      <label className="wide">Takip adresi (isteğe bağlı)<input name="tracking_url" placeholder="Boş bırakılırsa firmanın sorgu sayfası kullanılır" autoComplete="off"/></label>
                    </div>
                    {/*
                      İki çalışma biçimi aynı formda, iki ayrı düğmeyle:
                      tedarikçi kendi gönderdiyse takip numarası giriliyor,
                      etiketi biz üretiyorsak yukarıdaki alanlar boş bırakılıp
                      tryOTO'ya gidiliyor. Ayrı formlar aynı kalem seçimini iki
                      kez yaptırırdı.
                    */}
                    <div className="shipment-submit">
                      <button type="submit">Takip numarasıyla kaydet</button>
                      <button type="submit" formAction={otoTaslakOlustur} className="ghost">tryOTO ile etiket üret →</button>
                    </div>
                  </form>)}
              </div>:canManage?<p className="list-hint">Siparişteki bütün ürünler kargoya verilmiş.</p>:null}
            </section>
          </div>
          <div className="siparis-sekme">
            <ol className="order-timeline">
              {timeline.map(item=>(
                <li key={item.id}>
                  <span className="order-timeline-dot" data-kind={item.kind}/>
                  <div><b>{item.title}</b><small>{item.detail}{item.by?` · ${item.by}`:""}</small></div>
                  <time dateTime={item.at}>{shortDate.format(new Date(item.at))}</time>
                </li>
              ))}
            </ol>
          </div>
          <div className="siparis-sekme">
            <p className="siparis-pencere-alt">{gonderiler.length?"Takip numaraları Gönderiler bölümünde, paket başına tutuluyor.":"Takip numarası girildiğinde müşteriye e-posta gider."}</p>
            {canManage?(
              <form action={updateFulfillmentDetails} className="order-form-grid">
                <input type="hidden" name="order_id" value={order.id}/>
                {gonderiler.length?(
                  <>
                    {/* Var olan değerler korunuyor: alan gizlendiği için
                        boş gönderilirse kayıtlı numara silinirdi. */}
                    <input type="hidden" name="shipping_carrier" value={meta.shipping_carrier??""}/>
                    <input type="hidden" name="tracking_number" value={meta.tracking_number??""}/>
                    <input type="hidden" name="tracking_url" value={meta.tracking_url??""}/>
                  </>
                ):(
                  <>
                    <label>Kargo firması<input name="shipping_carrier" defaultValue={meta.shipping_carrier??""} maxLength={100} className="ac-input"/></label>
                    <label>Takip numarası<input name="tracking_number" defaultValue={meta.tracking_number??""} maxLength={160} className="ac-input"/></label>
                    <label>Takip bağlantısı<input name="tracking_url" type="url" defaultValue={meta.tracking_url??""} placeholder="https://..." className="ac-input"/></label>
                  </>
                )}
                <label>İç operasyon notu<textarea name="internal_note" defaultValue={meta.internal_note??""} maxLength={1000} rows={3} className="ac-input"/></label>
                <button className="ac-btn ac-btn-primary" type="submit">{gonderiler.length?"Notu kaydet":"Kargo bilgilerini kaydet"}</button>
              </form>
            ):<p className="list-hint">{meta.shipping_carrier||"Kargo firması yok"} · {meta.tracking_number||"Takip numarası yok"}</p>}
            {meta.tracking_url&&!gonderiler.length?<p className="order-track"><a className="ac-btn" href={meta.tracking_url} target="_blank" rel="noreferrer"><Icon name="external" size={16}/>Kargo takibini aç</a></p>:null}
          </div>
          {iadeAcik?(
            <div className="siparis-sekme">
            <p className="siparis-pencere-alt">
              Tutar PayTR üzerinden müşterinin kartına iade edilir.
              {refundedSoFar>0?<> Daha önce <strong>{money(refundedSoFar,order.currency)}</strong> iade edildi.</>:null}
            </p>
            <form action={refundOrder} className="order-form-grid is-narrow">
              <input type="hidden" name="order_id" value={order.id}/>
              <label>
                İade tutarı (₺)
                <input name="amount" type="text" inputMode="decimal" autoComplete="off" placeholder={`${refundedSoFar>0?"Kalanın tamamı":"Tamamı"}: ${money(refundable,order.currency)}`} className="ac-input"/>
              </label>
              <p className="list-hint">
                Boş bırakırsanız {refundedSoFar>0?"kalan tutarın":"siparişin"} tamamı iade edilir ve sipariş kapanır. Bu işlem geri
                alınamaz.
                {/* Kısmi iadede sipariş kapanmaz: kalan ürünler gönderilebilir. */}
                {order.status!=="fulfilled"?" Kısmi iadede sipariş açık kalır; kalan ürünler hazırlanıp kargoya verilebilir.":""}
                {" "}Müşteriye iade tutarını bildiren e-posta gider.
              </p>
              <button className="ac-btn ac-btn-danger" type="submit">İadeyi başlat</button>
            </form>
            </div>
          ):null}
        </TalepAkis>
      </div>
    </main>
  );
}
