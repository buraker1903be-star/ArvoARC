import Link from "next/link";
import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { OrderForm } from "./order-form";
import { quickStatus } from "./actions";
import { orderBadge, isOrderClosed, sourceLabel } from "@/lib/commerce-labels";

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });

export default async function Orders({ searchParams }: { searchParams: Promise<{ error?: string; created?: string; ok?: string; q?: string; filter?: string }> }) {
  const params = await searchParams;
  const { supabase, organization, membership } = await requireTenant();
  const canManage = ["owner", "admin", "manager"].includes(membership.role);
  const search=(params.q??"").trim();
  const statusFilter=["pending","confirmed","processing","fulfilled","cancelled","refunded"].includes(params.filter??"")?params.filter:"all";

  /*
    Filtreleme veritabanına taşındı.

    Öncesinde son 50 sipariş çekilip bellekte süzülüyordu: "iptal
    edilenler" filtresi yalnızca en yeni 50 sipariş içinde arama
    yapıyordu ve daha eski iptaller hiç görünmüyordu.
  */
  let ordersQuery=supabase.from("arc_orders").select("id,order_number,source,status,payment_status,customer_name,customer_email,total,currency,created_at").eq("organization_id",organization.id).order("created_at",{ascending:false}).limit(50);
  if(statusFilter!=="all")ordersQuery=ordersQuery.eq("status",statusFilter);
  if(search)ordersQuery=ordersQuery.or(`order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%`);

  /*
    Manuel sipariş için varyant listesi.

    Öncesinde 15.365 varyantın tamamı çekiliyordu; hem sayfa
    ağırdı hem de Supabase 1000 satırda kestiği için açılır
    listede ürünlerin çoğu yoktu.

    Artık yalnızca kendi ürünlerimiz listeleniyor: manuel sipariş
    tedarikçi kataloğu için kullanılmıyor, telefonla gelen LR
    siparişleri için var.
  */
  const [{ data: orders, error: ordersError }, { data: variants, error: variantsError }] = await Promise.all([
    ordersQuery,
    supabase.from("arc_product_variants").select("id,product_id,sku,price,stock,allow_backorder").eq("organization_id",organization.id).is("supplier",null).order("sku").limit(500),
  ]);

  if (ordersError) throw new Error(ordersError.message);
  if (variantsError) throw new Error(variantsError.message);

  /* Ürün adları yalnızca listelenen varyantlar için. */
  const variantProductIds=[...new Set((variants??[]).map(v=>v.product_id))];
  const {data:products,error:productsError}=variantProductIds.length
    ?await supabase.from("arc_products").select("id,name,status").in("id",variantProductIds)
    :{data:[],error:null};
  if (productsError) throw new Error(productsError.message);

  const visibleOrders=orders??[];

  /* Sekmede rozet olarak gösteriliyor: bekleyen iade gözden
     kaçmasın. */
  const {count:pendingReturns}=await supabase
    .from("arc_return_requests")
    .select("id",{count:"exact",head:true})
    .eq("organization_id",organization.id)
    .eq("status","beklemede");
  const productById=new Map((products??[]).map(product=>[product.id,product]));
  const variantOptions = (variants ?? []).map((variant) => {
    const product = productById.get(variant.product_id);
    return { id: variant.id, label: `${product?.name ?? "Ürün"} · ${variant.sku} · stok ${variant.stock}${variant.allow_backorder ? " · stoksuz satış açık" : ""}` };
  });

  return <Shell active="orders" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="ac-bar">
      <div>
        <h1>Siparişler</h1>
        <p>{visibleOrders.length} kayıt · {organization.name}</p>
      </div>
      {/*
        Sekmeler. İade siparişin bir aşaması; ayrı menü öğesi
        akışı bölüyordu.
      */}
      <nav className="ac-bar-actions">
        <Link
          className="ac-btn"
          href="/siparisler"
          style={{borderColor:"var(--c-accent)",color:"var(--c-accent)"}}
        >
          Siparişler
        </Link>
        <Link className="ac-btn" href="/siparisler/iadeler">
          İade talepleri
          {(pendingReturns??0) > 0 ? (
            <em className="ac-tag" data-tone="warn" style={{marginLeft:"var(--s2)"}}>
              {pendingReturns}
            </em>
          ) : null}
        </Link>
        <a className="ac-btn" href="/api/disari-aktar/siparisler">CSV indir</a>
      </nav>
    </section>

    <div className="ac-stack">
    {params.created&&<section className="ac ac-pad-sm"><strong>{params.created} siparişi oluşturuldu.</strong></section>}
    {/* Durum güncellemesi öncesinde sessizce geçiyordu: aksiyon
        `?ok=status` ile dönüyor ama sayfa bunu hiç okumuyordu. */}
    {params.ok==="status"&&<section className="ac ac-pad-sm"><strong>Sipariş durumu güncellendi.</strong></section>}
    {params.error&&<section className="ac ac-pad-sm"><strong>
      {params.error==="order-closed"?"Bu sipariş iade edildiği için akışta ilerletilemez."
      :params.error==="order-not-found"?"Sipariş bulunamadı."
      :params.error==="forbidden"?"Bu işlem için yetkiniz yok."
      :params.error==="invalid-status"?"Geçersiz sipariş durumu."
      :params.error==="invalid-order"?"Sipariş bilgileri eksik."
      :`İşlem tamamlanamadı: ${params.error}`}
    </strong></section>}

    {/* Filtre şeridi. Etiketler kaldırıldı: yer tutucu metin
        zaten ne aranacağını söylüyor ve şerit tek satıra
        sığıyor. */}
    {/*
      Durum filtreleri düğme olarak: açılır liste tek tıkla
      filtrelemeye izin vermiyordu, seçip "Filtrele" demek
      gerekiyordu. İade sayfasıyla aynı dil.
    */}
    <nav className="ac-filter">
      {[
        ["all", "Tümü"],
        ["pending", "Bekliyor"],
        ["confirmed", "Onaylandı"],
        ["processing", "Hazırlanıyor"],
        ["fulfilled", "Tamamlandı"],
        ["cancelled", "İptal"],
        ["refunded", "İade"],
      ].map(([key, label]) => (
        <Link
          key={key}
          className="ac-btn"
          href={key === "all" ? "/siparisler" : `/siparisler?filter=${key}`}
          style={
            statusFilter === key
              ? { borderColor: "var(--c-accent)", color: "var(--c-accent)" }
              : undefined
          }
        >
          {label}
        </Link>
      ))}
    </nav>

    {/* Arama ayrı: filtre düğmeleriyle birlikte kullanılıyor. */}
    <section className="ac ac-pad-sm">
      <form className="ac-filter">
        {statusFilter !== "all" ? (
          <input type="hidden" name="filter" value={statusFilter} />
        ) : null}
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Sipariş no, müşteri veya e-posta"
        />
        <button className="ac-btn ac-btn-primary" type="submit">
          Ara
        </button>
        {params.q ? (
          <Link
            className="ac-btn"
            href={statusFilter === "all" ? "/siparisler" : `/siparisler?filter=${statusFilter}`}
          >
            Temizle
          </Link>
        ) : null}
      </form>
    </section>
    <section className="ac table">
      <div className="ac-head ac-pad-sm" style={{marginBottom:0}}>
        <div>
          <h3>Sipariş akışı</h3>
          <p>Satıra tıklayarak detayı açın.</p>
        </div>
      </div>
      <div className="row th"><span>SİPARİŞ</span><span>MÜŞTERİ</span><span>KAYNAK</span><span>TUTAR</span><span>DURUM</span></div>
      {visibleOrders.length ? visibleOrders.map(order=>{
        /*
          Bir sonraki adım. Sipariş akışı doğrusal: onaylandı →
          hazırlanıyor → kargoya verildi. Listeden tek tıkla
          ilerletmek, detaya girip kaydetmekten çok daha hızlı.
        */
        /*
          İptal edilmiş ve iade edilmiş siparişte akış durur.
          Öncesinde iade sonrası satır hâlâ "Onayla →" diyordu:
          parası müşteriye geri gitmiş sipariş hazırlanmaya
          davet ediliyordu.
        */
        const closed=isOrderClosed(order.status,order.payment_status);
        const next=closed?null
          :order.status==="pending"?{key:"confirmed",label:"Onayla"}
          :order.status==="confirmed"?{key:"processing",label:"Hazırlanıyor"}
          :order.status==="processing"?{key:"fulfilled",label:"Kargoya ver"}
          :null;
        const badge=orderBadge(order.status,order.payment_status);

        return <div className="row" key={order.id} style={{alignItems:"center"}}>
          <Link prefetch={false} href={`/siparisler/${order.id}`} style={{textDecoration:"none",color:"inherit",display:"contents"}}>
            <span><b>{order.order_number}</b></span>
            <span>{order.customer_name || order.customer_email || "Misafir"}</span>
            <span>{sourceLabel(order.source)}</span>
            <span>{money.format(order.total/100)}</span>
            <span><em className="ac-tag" data-tone={badge.tone}>{badge.label}</em></span>
          </Link>
          {canManage&&next?(
            <form action={quickStatus} style={{margin:0}}>
              <input type="hidden" name="order_id" value={order.id}/>
              <input type="hidden" name="status" value={next.key}/>
              <button type="submit" className="row-action">{next.label} →</button>
            </form>
          ):<span/>}
        </div>;
      }) : <div style={{padding:24}}><strong>Arama kriterine uygun sipariş bulunamadı.</strong><p>İlk manuel siparişi oluşturabilir veya Veri Aktarımı ekranından eski Shopify sipariş arşivinizi yükleyebilirsiniz.</p></div>}
    </section>
    {/* Manuel sipariş listenin altında: günlük iş listeye
        bakmak, form ara sıra kullanılıyor. */}
    {canManage&&<details className="ac ac-pad">
      <summary style={{cursor:"pointer",fontWeight:800}}>+ Manuel sipariş oluştur</summary><div className="head"><div><small>MANUEL SİPARİŞ</small><h3>Yeni sipariş</h3></div><span>ARC Native · Çok kalemli</span></div><OrderForm variants={variantOptions} />
    </details>}
    </div>
  </Shell>;
}
