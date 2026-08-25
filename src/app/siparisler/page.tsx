import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { OrderForm } from "./order-form";

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });

export default async function Orders({ searchParams }: { searchParams: Promise<{ error?: string; created?: string }> }) {
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
  const variantOptions = (variants ?? []).map((variant) => {
    const product = products?.find((item) => item.id === variant.product_id);
    return { id: variant.id, label: `${product?.name ?? "Ürün"} · ${variant.sku} · stok ${variant.stock}${variant.allow_backorder ? " · stoksuz satış açık" : ""}` };
  });

  return <Shell active="orders" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small>OPERASYON · CANLI</small><h2>Siparişler</h2><p>Çok kalemli sipariş, sipariş satırları ve stok hareketleri tek transaction içinde işlenir. Stoksuz satış açık varyantlar negatif stoka düşebilir.</p></div></section>
    {params.created && <section className="card" style={{padding:16,marginBottom:20}}><strong>{params.created} siparişi oluşturuldu.</strong></section>}
    {params.error && <section className="card" style={{padding:16,marginBottom:20}}><strong>Sipariş oluşturulamadı: {params.error}</strong></section>}

    {canManage && <section className="card" style={{padding:24,marginBottom:24}}><div className="head"><div><small>MANUEL SİPARİŞ</small><h3>Yeni sipariş</h3></div><span>ARC Native · Çok kalemli</span></div><OrderForm variants={variantOptions} /></section>}

    <section className="card table"><div className="head"><div><small>SİPARİŞ AKIŞI</small><h3>{orders?.length ?? 0} sipariş</h3></div><span>{organization.name}</span></div>
      <div className="row th"><span>SİPARİŞ</span><span>MÜŞTERİ</span><span>KAYNAK</span><span>TUTAR</span><span>DURUM</span></div>
      {orders?.length ? orders.map(order=><div className="row" key={order.id}><span><b>{order.order_number}</b></span><span>{order.customer_name || order.customer_email || "Misafir"}</span><span>{order.source}</span><span>{money.format(order.total/100)}</span><span><em>{order.status} · {order.payment_status}</em></span></div>) : <div style={{padding:24}}><strong>Henüz sipariş yok.</strong><p>İlk manuel siparişi oluşturabilir veya Veri Aktarımı ekranından eski Shopify sipariş arşivinizi yükleyebilirsiniz.</p></div>}
    </section>
  </Shell>;
}
