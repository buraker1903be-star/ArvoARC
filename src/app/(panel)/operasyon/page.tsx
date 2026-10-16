import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { orderStatusLabel, paymentStatusLabel } from "@/lib/commerce-labels";
import { isBankTransfer, TRANSFER_STALE_HOURS } from "@/lib/payment-method";
import { HavaleEylemleri } from "./havale-eylemleri";
import { GenelBakis, ListeIzgarasi, ListeKarti, ListeSatiri } from "@/components/arvo-ui/genel-bakis";
import "@/components/arvo-ui/kayit-detay.css";

/* Render dışında: bileşen içinde saf olmayan çağrı yapılmasın. */
function currentTime(){return Date.now();}
/* "5 saattir", "2 gündür" */
function waitingFor(createdAt:string,now:number){
  const hours=Math.max(0,Math.floor((now-Date.parse(createdAt))/3_600_000));
  return hours<24?`${hours} saattir`:`${Math.floor(hours/24)} gündür`;
}
import "./operasyon.css";


type ProductMeta={image_paths?:string[];images?:string[];images_migrated?:boolean};
const money=new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"});
const shortDate=new Intl.DateTimeFormat("tr-TR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"});

/* Rozet: sağdaki küçük durum etiketi (ArvoOS status-pill). */
const Rozet=({ton,children}:{ton:string;children:React.ReactNode})=><span className="status-pill" data-tone={ton}>{children}</span>;

export default async function Operations(){
  const {supabase,organization,membership}=await requireTenant();
  const canManage=["owner","admin","manager"].includes(membership.role);
  const now=currentTime();
  /*
    Sorgular sınırlandırıldı ve filtreler veritabanında: her liste
    kendi filtresiyle ve sınırıyla çekiliyor, toplamlar ayrı sayım
    sorgularından geliyor. Öncesinde tüm siparişler ve 15.000+
    varyant belleğe alınıyor, Supabase 1000 satırda kestiği için
    sayılar sessizce yanlış çıkıyordu.
  */
  const {data:settings,error:ayarHatasi}=await supabase.from("arc_store_settings").select("low_stock_threshold").eq("organization_id",organization.id).maybeSingle();
  /* Hata YUTULMUYOR: varsayılan eşiğe (5) düşmek, mağazanın kendi
     belirlediği eşiği sessizce değiştirmek ve yanlış sayıda uyarı
     göstermek demekti. */
  if(ayarHatasi)throw new Error("Mağaza ayarları okunamadı: "+ayarHatasi.message);
  const threshold=settings?.low_stock_threshold??5;

  const OPEN=["pending","confirmed","processing"];
  const PAYMENT=["pending","authorized","failed"];

  const [
    {data:openOrders,error:ordersError},
    {count:openCount},
    {data:paymentPending,error:paymentError},
    {count:paymentCount},
    {data:criticalStock,error:criticalError},
    {count:criticalCount},
    {data:lowStock,error:lowError},
    {count:lowCount},
  ]=await Promise.all([
    supabase.from("arc_orders").select("id,order_number,status,payment_status,customer_name,total,created_at").eq("organization_id",organization.id).in("status",OPEN).order("created_at",{ascending:false}).limit(8),
    supabase.from("arc_orders").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).in("status",OPEN),
    supabase.from("arc_orders").select("id,order_number,status,payment_status,customer_name,total,created_at,metadata").eq("organization_id",organization.id).in("payment_status",PAYMENT).not("status","in","(cancelled,refunded)").order("created_at",{ascending:false}).limit(8),
    supabase.from("arc_orders").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).in("payment_status",PAYMENT).not("status","in","(cancelled,refunded)"),
    // Kritik: stok sıfır ya da eksi ve stoksuz satış kapalı (mağazada satın alınamıyor).
    supabase.from("arc_product_variants").select("id,product_id,sku,stock,allow_backorder").eq("organization_id",organization.id).lte("stock",0).eq("allow_backorder",false).order("stock",{ascending:true}).limit(8),
    supabase.from("arc_product_variants").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).lte("stock",0).eq("allow_backorder",false),
    supabase.from("arc_product_variants").select("id,product_id,sku,stock,allow_backorder").eq("organization_id",organization.id).gt("stock",0).lte("stock",threshold).order("stock",{ascending:true}).limit(8),
    supabase.from("arc_product_variants").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).gt("stock",0).lte("stock",threshold),
  ]);

  if(ordersError||paymentError||criticalError||lowError)throw new Error((ordersError??paymentError??criticalError??lowError)?.message??"Operasyon verisi okunamadı.");

  /* Yalnızca gösterilen varyantların ürün adları çekilir. */
  const stockVariants=[...(criticalStock??[]),...(lowStock??[])];
  const stockProductIds=[...new Set(stockVariants.map(variant=>variant.product_id))];
  const {data:stockProducts}=stockProductIds.length?await supabase.from("arc_products").select("id,name").in("id",stockProductIds):{data:[]};
  const productName=new Map((stockProducts??[]).map(product=>[product.id,product.name]));

  /*
    Görseli eksik ürünler. Metadata içinde arama yapılamadığı için
    son güncellenen 200 aktif ürüne bakılıyor.
  */
  const {data:recentActive,error:urunHatasi}=await supabase.from("arc_products").select("id,name,status,source,metadata").eq("organization_id",organization.id).eq("status","active").order("updated_at",{ascending:false}).limit(200);
  /*
    Hata YUTULMUYOR. Yutulsaydı liste boş kalır, ekran "Aktif
    ürünlerde görsel eksiği bulunmuyor" der ve başlık "Her şey güncel"
    yazardı: işi sorun göstermek olan bir merkezin sessizce temiz
    görünmesi, hata sayfasından çok daha kötü. Siparişlerdeki sorunlu
    kargo süzgecinde aynı karar verilmişti.
  */
  if(urunHatasi)throw new Error("Görseli eksik ürünler okunamadı: "+urunHatasi.message);
  const missingImages=(recentActive??[]).filter(product=>{const meta=(product.metadata??{}) as ProductMeta;return !(meta.image_paths?.length)&&!(meta.images?.length);});

  const stockAlerts=(criticalCount??0)+(lowCount??0);
  const totalActions=(openCount??0)+(paymentCount??0)+stockAlerts+missingImages.length;

  /*
    SATIŞIN GENEL BAKIŞI = ArvoOS'un modül genel bakışı (16.10.2026):
    gizli başlık (uygulamanın adı durum çubuğunda), özet şeridi, yan yana
    dört liste kartı. Eskiden kendi kutu ve satır dili vardı (dash-*,
    modules.css).
  */
  return (
    <GenelBakis gizliBaslik="Operasyon merkezi">
      <nav className="kayit-serit talep-serit" aria-label="Operasyon özeti">
        <dl>
          <div className={(openCount??0)>0?"is-uyari":undefined}><dt>Açık sipariş</dt><dd><Link prefetch={false} href="/siparisler?filter=pending">{(openCount??0).toLocaleString("tr-TR")}</Link></dd><small>bekliyor veya hazırlanıyor</small></div>
          <div className={(paymentCount??0)>0?"is-uyari":undefined}><dt>Ödeme kontrolü</dt><dd>{(paymentCount??0).toLocaleString("tr-TR")}</dd><small>ödemesi tamamlanmamış</small></div>
          <div className={(criticalCount??0)>0?"is-tehlike":(lowCount??0)>0?"is-uyari":undefined}><dt>Stok uyarısı</dt><dd><Link prefetch={false} href={(criticalCount??0)>0?"/stok?filter=zero":"/stok?filter=low"}>{stockAlerts.toLocaleString("tr-TR")}</Link></dd><small>{(criticalCount??0).toLocaleString("tr-TR")} satışa kapalı · {(lowCount??0).toLocaleString("tr-TR")} azalan</small></div>
          <div className={missingImages.length>0?"is-uyari":undefined}><dt>Görsel eksiği</dt><dd>{missingImages.length.toLocaleString("tr-TR")}</dd><small>son güncellenen 200 aktif üründe</small></div>
        </dl>
      </nav>
      {totalActions===0?<p className="operasyon-temiz">Her şey güncel; aksiyon bekleyen kayıt yok.</p>:null}

      <ListeIzgarasi etiket="Aksiyon bekleyenler">
        <ListeKarti baslik="Açık siparişler" alt="Onay ve hazırlık bekleyenler" bos="Açık sipariş bulunmuyor." href="/siparisler?filter=pending" hrefEtiket="Siparişler" sayi={(openOrders??[]).length}>
          {(openOrders??[]).map(order=>(
            <ListeSatiri key={order.id} href={`/siparisler/${order.id}`}
              baslik={order.customer_name||"Müşteri"}
              alt={`${order.order_number} · ${orderStatusLabel(order.status)} · ${shortDate.format(new Date(order.created_at))}`}
              sag={<Rozet ton={order.status==="pending"?"warning":"info"}>{money.format(order.total/100)}</Rozet>}/>
          ))}
        </ListeKarti>

        <ListeKarti baslik="Ödeme kontrolü" alt="Ödenmemiş, tahsil edilmemiş ya da başarısız" bos="Ödeme bekleyen sipariş bulunmuyor." sayi={(paymentPending??[]).length}>
          {(paymentPending??[]).map(order=>{
            const transfer=isBankTransfer(order.metadata);
            /* Havalede bekleme süresi görünür; 72 saati geçen satır kırmızı ve iptal edilebilir. */
            const stale=transfer&&now-Date.parse(order.created_at)>TRANSFER_STALE_HOURS*3_600_000;
            const detail=transfer?`Havale · ${waitingFor(order.created_at,now)} bekliyor${stale?" (süresi geçti)":""}`:paymentStatusLabel(order.payment_status);
            const ton=order.payment_status==="failed"||stale?"danger":"warning";
            /*
              Havale ödemesi burada tek tıkla onaylanır. Düğmeler satırın
              bağlantısının DIŞINDA: bağlantı içinde form geçersiz ve
              tıklama satırı açardı.
            */
            if(transfer&&canManage&&order.payment_status!=="failed"){
              return (
                <li key={order.id} className="operasyon-havale">
                  <Link prefetch={false} className="dash-col-row" href={`/siparisler/${order.id}`}>
                    <span className="dash-col-main"><b>{order.customer_name||"Müşteri"}</b><small>{order.order_number} · {detail}</small></span>
                    <Rozet ton={ton}>{money.format(order.total/100)}</Rozet>
                  </Link>
                  <HavaleEylemleri
                    siparisId={order.id}
                    onayMesaji={`${order.order_number} için ${money.format(order.total/100)} havale ödemesi alındı olarak işaretlensin mi? Müşteriye “Ödemeniz alındı” e-postası gönderilir.`}
                    iptalMesaji={stale?`${order.order_number} ${waitingFor(order.created_at,now)} ödenmedi. Sipariş iptal edilsin mi? Müşteriye “Siparişiniz iptal edildi” e-postası gönderilir.`:undefined}
                  />
                </li>
              );
            }
            return <ListeSatiri key={order.id} href={`/siparisler/${order.id}`} baslik={order.customer_name||"Müşteri"} alt={`${order.order_number} · ${detail}`} sag={<Rozet ton={ton}>{money.format(order.total/100)}</Rozet>}/>;
          })}
        </ListeKarti>

        <ListeKarti baslik="Kritik stoklar" alt={`Satışa kapalı ve ${threshold} adet altına düşenler`} bos="Stok uyarısı bulunmuyor." href="/stok?filter=zero" hrefEtiket="Stok" sayi={stockVariants.length}>
          {stockVariants.map(variant=>(
            <ListeSatiri key={variant.id} href={`/stok?q=${encodeURIComponent(variant.sku)}`}
              baslik={productName.get(variant.product_id)??"Ürün"}
              alt={variant.sku}
              sag={<Rozet ton={variant.stock<=0?"danger":"warning"}>{variant.stock} adet</Rozet>}/>
          ))}
        </ListeKarti>

        <ListeKarti baslik="Görseli eksik ürünler" alt="Yayında ama kapak görseli yok" bos="Aktif ürünlerde görsel eksiği bulunmuyor." href="/urunler?filter=active" hrefEtiket="Ürünler" sayi={Math.min(missingImages.length,8)}>
          {missingImages.slice(0,8).map(product=>(
            <ListeSatiri key={product.id} href={`/urunler/${product.id}`} baslik={product.name} baslikIpucu={product.name}
              alt={product.source==="shopify"?"Shopify aktarımı":"ArvoARC"}
              sag={<Rozet ton="gold">Görsel ekle</Rozet>}/>
          ))}
        </ListeKarti>
      </ListeIzgarasi>
    </GenelBakis>
  );
}
