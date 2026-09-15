import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { refundOrder, updateFulfillmentDetails, updateOrderStatus } from "./actions";
import { cancelTransferOrder, confirmTransferPayment, quickStatus } from "../actions";
import { isBankTransfer, TRANSFER_STALE_HOURS } from "@/lib/payment-method";
import { ConfirmSubmit } from "@/components/panel/confirm-submit";

/* Render dışında: bileşen içinde saf olmayan çağrı yapılmasın. */
function transferClock(){return Date.now();}
import { isOrderClosed, orderBadge, orderStatusLabel, orderStatusOptions, paymentStatusLabel, paymentStatusOptions, sourceLabel } from "@/lib/commerce-labels";
import { nextOrderStep, orderFlow } from "@/lib/order-flow";
import { Icon } from "@/components/panel/icons";
import { Notice } from "@/components/panel/notice";
import { PrintButton } from "@/components/panel/print-button";
import "../orders.css";

const money=(value:number,currency:string)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:currency||"TRY"}).format(value/100);
/* Sunucu UTC'de çalışıyor; saat Türkiye saatine göre gösterilir. */
const dateTime=new Intl.DateTimeFormat("tr-TR",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"});
const shortDate=new Intl.DateTimeFormat("tr-TR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"});
const when=(value:string)=>dateTime.format(new Date(value));

type Address={name?:string;address1?:string;address2?:string;city?:string;province?:string;zip?:string;country?:string;phone?:string};
type OrderMeta={discount?:number;coupon_code?:string;refunded_at?:string;refunded_amount?:number;refund_reference?:string;billing?:Address;shipping_address?:Address;payment_method?:string;payment_reference?:string;notes?:string;tags?:string;historical_import?:boolean;shipping_carrier?:string;tracking_number?:string;tracking_url?:string;internal_note?:string};

const ERRORS:Record<string,string>={
  "not-paid":"Bu sipariş ödenmediği için iade edilemez.",
  "already-refunded":"Bu sipariş zaten iade edilmiş.",
  "invalid-amount":"İade tutarı sipariş tutarını aşamaz.",
  "refund-failed":"PayTR iade talebini reddetti. Ayrıntı için sunucu günlüklerine bakın.",
  "refund-recorded-failed":"İade yapıldı ancak sipariş kaydı güncellenemedi. PayTR panelinden doğrulayın; tekrar iade denemeyin.",
  "transfer-order":"Havale siparişi PayTR'dan iade edilemez. Parayı bankadan iade edip siparişi elle kapatın.",
  busy:"Bu sipariş için iade zaten işleniyor. Sayfayı yenileyip durumu kontrol edin.",
  "order-closed":"Bu sipariş kapandığı (iptal ya da iade) için akışta ilerletilemez.",
  "order-not-found":"Sipariş bulunamadı.",
  forbidden:"Bu işlem için yetkiniz yok.",
  "invalid-status":"Geçersiz sipariş durumu.",
  "invalid-fulfillment":"Kargo bilgileri çok uzun.",
  "invalid-tracking-url":"Takip bağlantısı https:// ile başlayan geçerli bir adres olmalı.",
  "save-failed":"Durum kaydedilemedi, tekrar deneyin.",
  "not-transfer":"Bu sipariş havale ile verilmemiş; kart ödemeleri PayTR bildirimiyle kapanır.",
  "already-paid":"Bu siparişin ödemesi zaten onaylanmış.",
};

function AddressCard({title,address}:{title:string;address?:Address}){
  const lines=[address?.name,address?.address1,address?.address2,[address?.zip,address?.city].filter(Boolean).join(" "),address?.province,address?.country,address?.phone].filter(Boolean);
  return <article className="ac order-party"><small>{title}</small>{lines.length?lines.map((line,index)=><p key={index}>{line}</p>):<p className="is-empty">Bilgi bulunmuyor.</p>}</article>;
}

export default async function OrderDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{saved?:string;error?:string;ok?:string}>}){
  const {id}=await params;const query=await searchParams;
  const {supabase,organization,membership}=await requireTenant();
  const [{data:order,error},{data:items,error:itemsError},{data:events,error:eventsError}]=await Promise.all([
    supabase.from("arc_orders").select("id,order_number,source,status,payment_status,customer_name,customer_email,currency,subtotal,tax,shipping,total,metadata,created_at,updated_at").eq("organization_id",organization.id).eq("id",id).maybeSingle(),
    supabase.from("arc_order_items").select("id,product_name,sku,quantity,unit_price,total").eq("organization_id",organization.id).eq("order_id",id).order("product_name"),
    supabase.from("arc_order_events").select("id,event_type,event_data,created_by,created_at").eq("organization_id",organization.id).eq("order_id",id).order("created_at",{ascending:false}).limit(50)
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
    ?await supabase.from("arc_product_variants").select("sku,arc_products(tax_rate)").eq("organization_id",organization.id).in("sku",skus)
    :{data:[]};

  const rateBySku=new Map<string,number>();
  for(const row of (rateRows??[]) as unknown as Array<{sku:string;arc_products:{tax_rate:number|null}|{tax_rate:number|null}[]|null}>){
    const product=Array.isArray(row.arc_products)?row.arc_products[0]:row.arc_products;
    rateBySku.set(row.sku, product?.tax_rate ?? 20);
  }

  /* İndirim payı orantılı düşülür: müşteri indirimli tutarı
     ödedi, matrah da o tutar üzerinden olmalı. */
  const discount=Number(meta.discount??0);
  const gross=(order.subtotal??0)+(order.shipping??0);
  const factor=discount>0&&gross>0?1-discount/gross:1;

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
  const discountRate=gross>0?discount/gross:0;

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
  const flowIndex=orderFlow.findIndex(step=>step.key===order.status);
  const reachedIndex=flowIndex>=0?flowIndex:Math.max(0,...orderFlow.map((step,index)=>reachedAt.has(step.key)?index:0));
  const lastIndex=orderFlow.length-1;
  const badge=orderBadge(order.status,order.payment_status);
  const next=nextOrderStep(order.status,order.payment_status);
  const itemCount=(items??[]).reduce((sum,item)=>sum+item.quantity,0);

  /* İşlem geçmişi: kayıtlı olaylar + oluşturma + (varsa) iade, yeniden eskiye. */
  const timeline=[
    ...(events??[]).map(event=>{
      const data=(event.event_data??{}) as Record<string,string|null>;
      const isStatus=event.event_type==="status_updated";
      return {
        id:String(event.id),
        kind:isStatus?"status":"shipping",
        title:isStatus?"Sipariş durumu güncellendi":"Kargo bilgileri güncellendi",
        detail:isStatus?`${orderStatusLabel(data.old_status)} → ${orderStatusLabel(data.new_status)} · Ödeme: ${paymentStatusLabel(data.new_payment_status)}`:`${data.shipping_carrier||"Kargo firması yok"} · ${data.tracking_number||"Takip numarası yok"}`,
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

  return <>
    <section className="ac-bar">
      <div>
        <Link prefetch={false} className="order-back order-noprint" href="/siparisler">← Siparişler</Link>
        <h1>{order.order_number}</h1>
        <p>{when(order.created_at)} · {order.customer_name||order.customer_email||"Misafir müşteri"} · {sourceLabel(order.source)}</p>
      </div>
      <div className="order-head-actions">
        {/* Rozet listeyle aynı yerden üretiliyor: iki ekran
            aynı siparişe farklı isim vermesin. */}
        <em className="ac-tag" data-tone={badge.tone}>{badge.label}</em>
        <span className="order-noprint"><PrintButton /></span>
        {canManage&&next?(
          <form action={quickStatus} className="order-noprint">
            <input type="hidden" name="order_id" value={order.id}/>
            <input type="hidden" name="status" value={next.key}/>
            <input type="hidden" name="back" value={`/siparisler/${order.id}`}/>
            <button className="ac-btn ac-btn-primary" type="submit">{next.label} →</button>
          </form>
        ):null}
      </div>
    </section>

    <div className="ac-stack">
      {query.saved?<Notice title={query.saved==="fulfillment"?"Kargo ve operasyon bilgileri kaydedildi.":query.saved==="refund"?"İade tamamlandı.":"Sipariş durumu güncellendi."}/>:null}
      {query.error?<Notice tone="error" title="İşlem tamamlanamadı">{ERRORS[query.error]??query.error}</Notice>:null}
      {query.ok==="payment"?<Notice title="Havale ödemesi onaylandı.">Sipariş onaylandı; müşterinin e-posta adresi varsa “Ödemeniz alındı” bildirimi gönderildi.</Notice>:null}
      {query.ok==="cancelled"?<Notice title="Sipariş iptal edildi.">Müşterinin e-posta adresi varsa “Siparişiniz iptal edildi” bildirimi gönderildi.</Notice>:null}
      {transferPending?(
        <div className="order-transfer">
          <Notice tone={transferStale?"error":"warn"} title={transferStale?`Havale ${waitedLabel} ödenmedi · süresi geçti`:`Havale ödemesi bekleniyor · ${waitedLabel}`}>
            Ödeme hesabınıza ulaştıysa onaylayın; müşteriye “Ödemeniz alındı” e-postası gider.{transferStale?" Ödeme gelmeyecekse siparişi iptal edebilirsiniz.":""}
          </Notice>
          {canManage?(
            <div className="order-transfer-actions order-noprint">
              <form action={confirmTransferPayment}>
                <input type="hidden" name="order_id" value={order.id}/>
                <input type="hidden" name="back" value={`/siparisler/${order.id}`}/>
                <ConfirmSubmit className="ac-btn ac-btn-primary" message={`${order.order_number} için ${money(order.total,order.currency)} havale ödemesi alındı olarak işaretlensin mi? Müşteriye “Ödemeniz alındı” e-postası gönderilir.`}>Ödeme alındı</ConfirmSubmit>
              </form>
              {transferStale?(
                <form action={cancelTransferOrder}>
                  <input type="hidden" name="order_id" value={order.id}/>
                  <input type="hidden" name="back" value={`/siparisler/${order.id}`}/>
                  <ConfirmSubmit className="ac-btn ac-btn-danger" message={`${order.order_number} ${waitedLabel} ödenmedi. Sipariş iptal edilsin mi? Müşteriye “Siparişiniz iptal edildi” e-postası gönderilir.`}>İptal et</ConfirmSubmit>
                </form>
              ):null}
            </div>
          ):null}
        </div>
      ):null}
      {closed?(
        <Notice tone="error" title={`Sipariş kapandı · ${badge.label}`}>
          {meta.refunded_at?`${money(Number(meta.refunded_amount??0),order.currency)} iade edildi · ${when(String(meta.refunded_at))}. `:""}
          Kapanmış sipariş akışta ilerletilemez.
        </Notice>
      ):null}

      <section className="ac ac-pad order-noprint" aria-label="Sipariş akışı">
        <ol className="order-steps" data-closed={closed?"":undefined}>
          {orderFlow.map((step,index)=>{
            const done=index<reachedIndex||(index===reachedIndex&&(closed||index===lastIndex));
            const current=index===reachedIndex&&!done;
            const at=reachedAt.get(step.key);
            return <li key={step.key} className={done?"is-done":current?"is-current":undefined} aria-current={current?"step":undefined}>
              <span className="order-step-dot">{done?<Icon name="check" size={15}/>:index+1}</span>
              <b>{step.label}</b>
              <small>{at&&index<=reachedIndex?shortDate.format(new Date(at)):current?"Şu an":"—"}</small>
            </li>;
          })}
        </ol>
      </section>

      <section className="ac-metrics order-facts" aria-label="Sipariş özeti">
        <article className="ac-metric"><span>Toplam</span><strong>{money(order.total,order.currency)}</strong><small>{discount>0?`${money(discount,order.currency)} indirim uygulandı`:"KDV dâhil"}</small></article>
        <article className="ac-metric" data-tone={order.payment_status==="paid"?"good":["pending","authorized"].includes(order.payment_status)?"warn":["failed","refunded","partially_refunded"].includes(order.payment_status)?"bad":undefined}><span>Ödeme</span><strong>{paymentStatusLabel(order.payment_status)}</strong><small>{meta.payment_method??"Kredi kartı"}</small></article>
        <article className="ac-metric"><span>Kargo</span><strong>{meta.shipping_carrier||"—"}</strong><small>{meta.tracking_number?`Takip: ${meta.tracking_number}`:"Takip numarası girilmedi"}</small></article>
        <article className="ac-metric"><span>Kalemler</span><strong>{itemCount} adet</strong><small>{items?.length??0} kalem</small></article>
      </section>

      {/* Müşteri, fatura ve teslimat bilgileri en başta: siparişi
          hazırlarken ilk bakılan yer burası. */}
      <section className="order-parties">
        <article className="ac order-party">
          <small>MÜŞTERİ</small>
          <p><b>{order.customer_name||"İsimsiz müşteri"}</b></p>
          {order.customer_email?<p><a href={`mailto:${order.customer_email}`}>{order.customer_email}</a></p>:<p className="is-empty">E-posta yok</p>}
          {meta.notes?<p className="order-party-note"><b>Müşteri notu:</b> {meta.notes}</p>:null}
        </article>
        <AddressCard title="FATURA ADRESİ" address={meta.billing}/>
        <AddressCard title="TESLİMAT ADRESİ" address={meta.shipping_address}/>
      </section>

      {/* Sipariş kalemleri tam genişlikte: dokuz sütunlu fatura
          dökümü yan panelle birlikte sığmıyordu. */}
      <section className="ac ac-pad">
        <div className="ac-head"><div><h3>Sipariş kalemleri</h3><p>{items?.length??0} kalem · birim fiyatlar KDV hariç</p></div></div>
        {/*
          Fatura düzeni. Her satırda birim fiyat, indirim, KDV
          oranı ve tutarı ayrı ayrı; fatura keserken doğrudan
          kullanılabilir.
        */}
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
              <span>{discountRate>0?`%${(discountRate*100).toFixed(1)}`:"—"}</span>
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
          <strong>Toplam tutar <b>{money(order.total,order.currency)}</b></strong>
          <span>Ödeme türü <b>{meta.payment_method??"Kredi kartı"}</b></span>
          {meta.coupon_code?<span>İndirim kodu <b>{meta.coupon_code}</b></span>:null}
        </div>
      </section>

      {/*
        Yönetim ve kargo yan yana iki kart. Öncesinde tek sütunda
        alt alta dizilmişti ve takip numarası girmek için en aşağı
        inmek gerekiyordu.
      */}
      <section className="ac-split-even order-noprint">
        <div className="ac ac-pad">
          <div className="ac-head"><div><h3>Sipariş durumu</h3><p>Akıştaki konumu ve ödeme durumu.</p></div></div>
          {canManage?(
            <form action={updateOrderStatus} className="order-form-grid">
              <input type="hidden" name="order_id" value={order.id}/>
              <label>Sipariş durumu<select name="status" defaultValue={order.status} className="ac-input">{orderStatusOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
              <label>Ödeme durumu<select name="payment_status" defaultValue={order.payment_status} className="ac-input">{paymentStatusOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
              <p className="order-hint">Ödeme durumu normalde PayTR bildirimiyle güncellenir; elle değiştirmek muhasebe kayıtlarıyla uyumsuzluk yaratabilir.</p>
              <button className="ac-btn ac-btn-primary" type="submit">Durumu kaydet</button>
            </form>
          ):<p className="order-hint">{orderStatusLabel(order.status)} · {paymentStatusLabel(order.payment_status)}</p>}
        </div>

        <div className="ac ac-pad">
          <div className="ac-head"><div><h3>Kargo ve operasyon</h3><p>Takip numarası girildiğinde müşteriye e-posta gider.</p></div></div>
          {canManage?(
            <form action={updateFulfillmentDetails} className="order-form-grid">
              <input type="hidden" name="order_id" value={order.id}/>
              <label>Kargo firması<input name="shipping_carrier" defaultValue={meta.shipping_carrier??""} maxLength={100} className="ac-input"/></label>
              <label>Takip numarası<input name="tracking_number" defaultValue={meta.tracking_number??""} maxLength={160} className="ac-input"/></label>
              <label>Takip bağlantısı<input name="tracking_url" type="url" defaultValue={meta.tracking_url??""} placeholder="https://..." className="ac-input"/></label>
              <label>İç operasyon notu<textarea name="internal_note" defaultValue={meta.internal_note??""} maxLength={1000} rows={3} className="ac-input"/></label>
              <button className="ac-btn ac-btn-primary" type="submit">Kargo bilgilerini kaydet</button>
            </form>
          ):<p className="order-hint">{meta.shipping_carrier||"Kargo firması yok"} · {meta.tracking_number||"Takip numarası yok"}</p>}
          {meta.tracking_url?<p className="order-track"><a className="ac-btn" href={meta.tracking_url} target="_blank" rel="noreferrer"><Icon name="external" size={15}/>Kargo takibini aç</a></p>:null}
        </div>
      </section>

      {/*
        İade. Ayrı bir kartta ve yalnızca ödenmiş siparişte
        görünüyor: parasal işlem, yanlışlıkla tıklanmamalı.
      */}
      {order.payment_status==="paid"&&!meta.refunded_at&&["owner","admin"].includes(membership.role)?(
        <section className="ac ac-pad order-noprint">
          <div className="ac-head">
            <div>
              <h3>İade</h3>
              <p>Tutar PayTR üzerinden müşterinin kartına iade edilir.</p>
            </div>
          </div>

          <form action={refundOrder} className="order-form-grid is-narrow">
            <input type="hidden" name="order_id" value={order.id}/>
            <label>
              İade tutarı (₺)
              <input name="amount" type="number" min="0" step="0.01" max={(order.total/100).toFixed(2)} placeholder={`Tamamı: ${(order.total/100).toFixed(2)}`} className="ac-input"/>
            </label>
            <p className="order-hint">
              Boş bırakırsanız siparişin tamamı iade edilir. Bu işlem geri
              alınamaz.
              {/*
                Kargo çıkmadıysa kargo bedeli de müşteriye geri gider;
                tamamı zaten kargoyu içeriyor ama kısmi tutar yazan
                kullanıcı bunu hesaba katmayı unutabiliyor.
              */}
              {order.status!=="fulfilled"&&(order.shipping??0)>0?(
                <>
                  {" "}Kargo çıkmadığı için{" "}
                  <strong>{money(order.shipping,order.currency)}</strong>{" "}
                  kargo bedeli de iadeye dâhildir; kısmi tutar yazarken
                  bunu ekleyin.
                </>
              ):null}
            </p>
            <button className="ac-btn ac-btn-danger" type="submit">İadeyi başlat</button>
          </form>
        </section>
      ):null}

      <section className="ac ac-pad order-noprint">
        <div className="ac-head"><div><h3>İşlem geçmişi</h3><p>Bu siparişte yapılan değişiklikler.</p></div><span className="ac-count">{timeline.length}</span></div>
        <ol className="order-timeline">
          {timeline.map(item=>(
            <li key={item.id}>
              <span className="order-timeline-dot" data-kind={item.kind}/>
              <div><b>{item.title}</b><small>{item.detail}{item.by?` · ${item.by}`:""}</small></div>
              <time dateTime={item.at}>{shortDate.format(new Date(item.at))}</time>
            </li>
          ))}
        </ol>
      </section>
    </div>
  </>;
}
