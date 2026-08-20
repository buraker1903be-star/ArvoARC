import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { createOrder } from "./actions";

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

  return <Shell active="orders" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small>OPERASYON · CANLI</small><h2>Siparişler</h2><p>Sipariş oluşturulduğunda kalemler ve stok hareketleri atomik olarak işlenir. Stoksuz satış açık varyantlar negatif stoka düşebilir.</p></div></section>
    {params.created && <section className="card" style={{padding:16,marginBottom:20}}><strong>{params.created} siparişi oluşturuldu.</strong></section>}
    {params.error && <section className="card" style={{padding:16,marginBottom:20}}><strong>Sipariş oluşturulamadı: {params.error}</strong></section>}

    {canManage && <section className="card" style={{padding:24,marginBottom:24}}><div className="head"><div><small>MANUEL SİPARİŞ</small><h3>Yeni sipariş</h3></div><span>ARC Native</span></div>
      <form action={createOrder} style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:14,marginTop:20}}>
        <label>Müşteri adı<input name="customer_name" style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label>
        <label>E-posta<input name="customer_email" type="email" style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label>
        <label>Ürün / varyant<select name="variant_id" required defaultValue="" style={{display:"block",width:"100%",padding:12,marginTop:6}}><option value="" disabled>Seçin</option>{variants?.map(v=>{const p=products?.find(item=>item.id===v.product_id);return <option key={v.id} value={v.id}>{p?.name ?? "Ürün"} · {v.sku} · stok {v.stock}{v.allow_backorder?" · stoksuz satış açık":""}</option>})}</select></label>
        <label>Adet<input name="quantity" type="number" min="1" step="1" required defaultValue="1" style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label>
        <button type="submit" style={{padding:12}}>Sipariş oluştur</button>
      </form>
    </section>}

    <section className="card table"><div className="head"><div><small>SİPARİŞ AKIŞI</small><h3>{orders?.length ?? 0} sipariş</h3></div><span>{organization.name}</span></div>
      <div className="row th"><span>SİPARİŞ</span><span>MÜŞTERİ</span><span>KAYNAK</span><span>TUTAR</span><span>DURUM</span></div>
      {orders?.length ? orders.map(order=><div className="row" key={order.id}><span><b>{order.order_number}</b></span><span>{order.customer_name || order.customer_email || "Misafir"}</span><span>{order.source}</span><span>{money.format(order.total/100)}</span><span><em>{order.status} · {order.payment_status}</em></span></div>) : <div style={{padding:24}}><strong>Henüz sipariş yok.</strong><p>İlk manuel siparişi oluşturabilir veya sonraki aşamada Shopify bağlantısını kullanabilirsiniz.</p></div>}
    </section>
  </Shell>;
}
