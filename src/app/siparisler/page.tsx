import Link from "next/link";
import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { OrderForm } from "./order-form";

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });

export default async function Orders({ searchParams }: { searchParams: Promise<{ error?: string; created?: string; q?: string; filter?: string }> }) {
  const params = await searchParams;
  const { supabase, organization, membership } = await requireTenant();
  const [{ data: orders, error: ordersError }, { data: variants, error: variantsError }, { data: products, error: productsError }] = await Promise.all([
    supabase.from("arc_orders").select("id,order_number,source,status,payment_status,customer_name,customer_email,total,currency,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("arc_product_variants").select("id,product_id,sku,price,stock,allow_backorder").eq("organization_id", organization.id).order("sku"),
    supabase.from("arc_products").select("id,name,status").eq("organization_id", organization.id),
  ]);
  if (ordersError) throw new Error(ordersError.message);
  if (variantsError) throw new Error(variantsError.message);
  if (productsError) throw new Error(productsError.message);
  const canManage = ["owner", "admin", "manager"].includes(membership.role);
  const search=(params.q??"").trim().toLocaleLowerCase("tr-TR");
  const statusFilter=["pending","confirmed","processing","fulfilled","cancelled","refunded"].includes(params.filter??"")?params.filter:"all";
  const visibleOrders=(orders??[]).filter(order=>(statusFilter==="all"||order.status===statusFilter)&&(!search||[order.order_number,order.customer_name,order.customer_email].some(value=>(value??"").toLocaleLowerCase("tr-TR").includes(search))));
  const variantOptions = (variants ?? []).map((variant) => {
    const product = products?.find((item) => item.id === variant.product_id);
    return { id: variant.id, label: `${product?.name ?? "Ürün"} · ${variant.sku} · stok ${variant.stock}${variant.allow_backorder ? " · stoksuz satış açık" : ""}` };
  });

  return <Shell active="orders" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small>OPERASYON · CANLI</small><h2>Siparişler</h2><p>Çok kalemli sipariş, sipariş satırları ve stok hareketleri tek transaction içinde işlenir. Stoksuz satış açık varyantlar negatif stoka düşebilir.</p></div></section>
    {params.created && <section className="card" style={{padding:16,marginBottom:20}}><strong>{params.created} siparişi oluşturuldu.</strong></section>}
    {params.error && <section className="card" style={{padding:16,marginBottom:20}}><strong>Sipariş oluşturulamadı: {params.error}</strong></section>}

    <section className="card" style={{padding:20,marginBottom:20}}><form style={{display:"grid",gridTemplateColumns:"minmax(220px,1fr) 190px auto auto",gap:10,alignItems:"end"}}><label>Siparişlerde ara<input name="q" defaultValue={params.q??""} placeholder="Sipariş no, müşteri veya e-posta" style={{display:"block",width:"100%",padding:12,marginTop:6}}/></label><label>Durum<select name="filter" defaultValue={statusFilter} style={{display:"block",width:"100%",padding:12,marginTop:6}}><option value="all">Tüm durumlar</option><option value="pending">Bekliyor</option><option value="confirmed">Onaylandı</option><option value="processing">Hazırlanıyor</option><option value="fulfilled">Tamamlandı</option><option value="cancelled">İptal</option><option value="refunded">İade</option></select></label><button type="submit" style={{padding:12}}>Filtrele</button>{(params.q||statusFilter!=="all")&&<Link href="/siparisler" style={{padding:12}}>Temizle</Link>}</form></section>
    {canManage && <section className="card" style={{padding:24,marginBottom:24}}><div className="head"><div><small>MANUEL SİPARİŞ</small><h3>Yeni sipariş</h3></div><span>ARC Native · Çok kalemli</span></div><OrderForm variants={variantOptions} /></section>}

    <section className="card table"><div className="head"><div><small>SİPARİŞ AKIŞI</small><h3>{visibleOrders.length} sipariş</h3></div><span>{organization.name}</span></div>
      <div className="row th"><span>SİPARİŞ</span><span>MÜŞTERİ</span><span>KAYNAK</span><span>TUTAR</span><span>DURUM</span></div>
      {visibleOrders.length ? visibleOrders.map(order=><Link href={`/siparisler/${order.id}`} className="row" key={order.id} style={{textDecoration:"none",color:"inherit"}}><span><b>{order.order_number}</b></span><span>{order.customer_name || order.customer_email || "Misafir"}</span><span>{order.source}</span><span>{money.format(order.total/100)}</span><span><em>{order.status} · {order.payment_status}</em></span></Link>) : <div style={{padding:24}}><strong>Arama kriterine uygun sipariş bulunamadı.</strong><p>İlk manuel siparişi oluşturabilir veya Veri Aktarımı ekranından eski Shopify sipariş arşivinizi yükleyebilirsiniz.</p></div>}
    </section>
  </Shell>;
}
