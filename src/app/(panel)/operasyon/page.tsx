import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { orderStatusLabel, paymentStatusLabel } from "@/lib/commerce-labels";
import { isBankTransfer } from "@/lib/payment-method";
import { Icon, type IconName } from "@/components/panel/icons";
import { Notice } from "@/components/panel/notice";
import { ConfirmSubmit } from "@/components/panel/confirm-submit";
import { cancelTransferOrder, confirmTransferPayment } from "../siparisler/actions";

/* Havale bu süreden uzun ödenmezse satır "süresi geçti" olarak işaretlenir. */
const TRANSFER_STALE_HOURS=72;
/* Render dışında: bileşen içinde saf olmayan çağrı yapılmasın. */
function currentTime(){return Date.now();}
/* "5 saattir", "2 gündür" */
function waitingFor(createdAt:string,now:number){
  const hours=Math.max(0,Math.floor((now-Date.parse(createdAt))/3_600_000));
  return hours<24?`${hours} saattir`:`${Math.floor(hours/24)} gündür`;
}
import "../modules.css";

const PAYMENT_ERRORS:Record<string,string>={
  forbidden:"Ödeme onayı için yönetici yetkisi gerekir.",
  "order-not-found":"Sipariş bulunamadı.",
  "not-transfer":"Bu sipariş havale ile verilmemiş; kart ödemeleri PayTR bildirimiyle kapanır.",
  "already-paid":"Bu siparişin ödemesi zaten onaylanmış.",
  "order-closed":"Sipariş kapanmış ya da ödemesi başarısız; detaydan kontrol edin.",
  "save-failed":"Ödeme kaydedilemedi. Tekrar deneyin.",
};

type ProductMeta={image_paths?:string[];images?:string[];images_migrated?:boolean};
const money=new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"});
const shortDate=new Intl.DateTimeFormat("tr-TR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"});

type Tone="info"|"gold"|"success"|"warning"|"danger"|"brand"|"muted";

/* Aksiyon satırı: tonu anlam taşır (sarı dikkat, kırmızı sorun). */
function ActionRow({href,icon,tone,title,detail,side}:{href:string;icon:IconName;tone:Tone;title:string;detail:string;side:React.ReactNode}){
  return <Link prefetch={false} className="dash-row" data-tone={tone} href={href}>
    <span className="dash-row-icon"><Icon name={icon} size={16}/></span>
    <span className="dash-row-label"><span>{title}</span><small>{detail}</small></span>
    {side}
    <span className="dash-chevron"><Icon name="chevron" size={16}/></span>
  </Link>;
}

export default async function Operations({searchParams}:{searchParams:Promise<{ok?:string;error?:string;order?:string}>}){
  const params=await searchParams;
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
  const {data:settings}=await supabase.from("arc_store_settings").select("low_stock_threshold").eq("organization_id",organization.id).maybeSingle();
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
  const {data:recentActive}=await supabase.from("arc_products").select("id,name,status,source,metadata").eq("organization_id",organization.id).eq("status","active").order("updated_at",{ascending:false}).limit(200);
  const missingImages=(recentActive??[]).filter(product=>{const meta=(product.metadata??{}) as ProductMeta;return !(meta.image_paths?.length)&&!(meta.images?.length);});

  const stockAlerts=(criticalCount??0)+(lowCount??0);
  const totalActions=(openCount??0)+(paymentCount??0)+stockAlerts+missingImages.length;

  return <>
    <section className="ac-bar">
      <div>
        <h1>Operasyon Merkezi</h1>
        <p>{totalActions?`${totalActions.toLocaleString("tr-TR")} kayıt aksiyon bekliyor.`:"Her şey güncel; aksiyon bekleyen kayıt yok."}</p>
      </div>
    </section>

    {params.ok==="payment"?<Notice title={`${params.order??"Sipariş"} için havale ödemesi onaylandı.`}>Sipariş onaylandı; müşterinin e-posta adresi varsa “Ödemeniz alındı” bildirimi gönderildi.</Notice>:null}
    {params.ok==="cancelled"?<Notice title={`${params.order??"Sipariş"} iptal edildi.`}>Müşterinin e-posta adresi varsa “Siparişiniz iptal edildi” bildirimi gönderildi.</Notice>:null}
    {params.error?<Notice tone="error" title="İşlem tamamlanamadı">{PAYMENT_ERRORS[params.error]??params.error}</Notice>:null}

    <div className="dash">
      {/* Renk anlamlı: sıfır olan sayaç nötr, dolu olan dikkat. */}
      <section className="ac-metrics" aria-label="Operasyon özeti">
        <Link prefetch={false} className="ac-metric ac-lift" data-tone={(openCount??0)>0?"warn":undefined} href="/siparisler?filter=pending">
          <span>Açık sipariş</span><strong>{(openCount??0).toLocaleString("tr-TR")}</strong><small>Bekliyor veya hazırlanıyor</small>
        </Link>
        <article className="ac-metric" data-tone={(paymentCount??0)>0?"warn":undefined}>
          <span>Ödeme kontrolü</span><strong>{(paymentCount??0).toLocaleString("tr-TR")}</strong><small>Ödemesi tamamlanmamış</small>
        </article>
        <Link prefetch={false} className="ac-metric ac-lift" data-tone={(criticalCount??0)>0?"bad":(lowCount??0)>0?"warn":undefined} href={(criticalCount??0)>0?"/stok?filter=zero":"/stok?filter=low"}>
          <span>Stok uyarısı</span><strong>{stockAlerts.toLocaleString("tr-TR")}</strong><small>{(criticalCount??0).toLocaleString("tr-TR")} satışa kapalı · {(lowCount??0).toLocaleString("tr-TR")} azalan</small>
        </Link>
        <article className="ac-metric" data-tone={missingImages.length>0?"warn":undefined}>
          <span>Görsel eksiği</span><strong>{missingImages.length.toLocaleString("tr-TR")}</strong><small>Son güncellenen 200 aktif üründe</small>
        </article>
      </section>

      <div className="ops-grid">
        <article className="dash-card">
          <div className="dash-card-head">
            <div><h2>Açık siparişler</h2><p>Onay ve hazırlık bekleyenler, en yeniden.</p></div>
            <Link prefetch={false} className="dash-card-link" href="/siparisler?filter=pending">Siparişler <Icon name="chevron" size={15}/></Link>
          </div>
          {(openOrders??[]).length?<div className="dash-list">{(openOrders??[]).map(order=>(
            <ActionRow key={order.id} href={`/siparisler/${order.id}`} icon="box" tone={order.status==="pending"?"warning":"info"} title={`${order.order_number} · ${order.customer_name||"Müşteri"}`} detail={`${orderStatusLabel(order.status)} · ${shortDate.format(new Date(order.created_at))}`} side={<strong className="ops-amount">{money.format(order.total/100)}</strong>}/>
          ))}</div>:<p className="dash-empty">Açık sipariş bulunmuyor.</p>}
        </article>

        <article className="dash-card">
          <div className="dash-card-head">
            <div><h2>Ödeme kontrolü</h2><p>Ödeme bekleyen, onaylanmış ama tahsil edilmemiş veya başarısız.</p></div>
          </div>
          {(paymentPending??[]).length?<div className="dash-list">{(paymentPending??[]).map(order=>{
            const transfer=isBankTransfer(order.metadata);
            /* Havalede bekleme süresi görünür; 72 saati geçen satır kırmızı ve iptal edilebilir. */
            const stale=transfer&&now-Date.parse(order.created_at)>TRANSFER_STALE_HOURS*3_600_000;
            const waiting=transfer?` · ${waitingFor(order.created_at,now)} bekliyor${stale?" (süresi geçti)":""}`:"";
            const row=<ActionRow href={`/siparisler/${order.id}`} icon="lira" tone={order.payment_status==="failed"||stale?"danger":"warning"} title={order.order_number} detail={`${paymentStatusLabel(order.payment_status)}${transfer?" · Havale":""}${waiting} · ${order.customer_name||"Müşteri"}`} side={<strong className="ops-amount">{money.format(order.total/100)}</strong>}/>;
            /* Havale ödemesi burada tek tıkla onaylanır; kart ödemesi PayTR bildirimiyle kapanır. */
            return transfer&&canManage&&order.payment_status!=="failed"?(
              <div className="ops-pay" key={order.id}>
                {row}
                <form action={confirmTransferPayment}>
                  <input type="hidden" name="order_id" value={order.id}/>
                  <input type="hidden" name="back" value="/operasyon"/>
                  <ConfirmSubmit className="ac-btn ops-pay-btn" message={`${order.order_number} için ${money.format(order.total/100)} havale ödemesi alındı olarak işaretlensin mi? Müşteriye “Ödemeniz alındı” e-postası gönderilir.`}>Ödeme alındı</ConfirmSubmit>
                </form>
                {stale?(
                  <form action={cancelTransferOrder}>
                    <input type="hidden" name="order_id" value={order.id}/>
                    <input type="hidden" name="back" value="/operasyon"/>
                    <ConfirmSubmit className="ac-btn ac-btn-danger ops-pay-btn" message={`${order.order_number} ${waitingFor(order.created_at,now)} ödenmedi. Sipariş iptal edilsin mi? Müşteriye “Siparişiniz iptal edildi” e-postası gönderilir.`}>İptal et</ConfirmSubmit>
                  </form>
                ):null}
              </div>
            ):<div key={order.id}>{row}</div>;
          })}</div>:<p className="dash-empty">Ödeme bekleyen sipariş bulunmuyor.</p>}
        </article>

        <article className="dash-card">
          <div className="dash-card-head">
            <div><h2>Kritik stoklar</h2><p>Satışa kapalı olanlar ve {threshold} adet altına düşenler.</p></div>
            <Link prefetch={false} className="dash-card-link" href="/stok?filter=zero">Stok <Icon name="chevron" size={15}/></Link>
          </div>
          {stockVariants.length?<div className="dash-list">{stockVariants.map(variant=>(
            <ActionRow key={variant.id} href={`/stok?q=${encodeURIComponent(variant.sku)}`} icon="alert" tone={variant.stock<=0?"danger":"warning"} title={productName.get(variant.product_id)??"Ürün"} detail={`${variant.sku} · ${variant.stock<=0?"mağazada satın alınamıyor":"azalıyor"}`} side={<span className="dash-row-count">{variant.stock}</span>}/>
          ))}</div>:<p className="dash-empty">Stok uyarısı bulunmuyor.</p>}
        </article>

        <article className="dash-card">
          <div className="dash-card-head">
            <div><h2>Görseli eksik ürünler</h2><p>Yayında ama kapak görseli yok.</p></div>
            <Link prefetch={false} className="dash-card-link" href="/urunler?filter=active">Ürünler <Icon name="chevron" size={15}/></Link>
          </div>
          {missingImages.length?<div className="dash-list">{missingImages.slice(0,8).map(product=>(
            <ActionRow key={product.id} href={`/urunler/${product.id}`} icon="tag" tone="gold" title={product.name} detail={product.source==="shopify"?"Shopify aktarımı":"ARVO ARC"} side={<span className="ops-cta">Görsel ekle</span>}/>
          ))}</div>:<p className="dash-empty">Aktif ürünlerde görsel eksiği bulunmuyor.</p>}
        </article>
      </div>
    </div>
  </>;
}
