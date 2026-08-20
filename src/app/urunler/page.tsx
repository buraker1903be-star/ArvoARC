import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { createProduct } from "./actions";

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });

const errorMessages: Record<string, string> = {
  forbidden: "Bu hesap ürün oluşturma yetkisine sahip değil.",
  "invalid-product": "Ürün bilgilerini kontrol edin.",
  "23505": "Bu SKU zaten kullanılıyor.",
};

export default async function Products({ searchParams }: { searchParams: Promise<{ error?: string; created?: string }> }) {
  const params = await searchParams;
  const { supabase, organization, membership } = await requireTenant();

  const [{ data: products, error: productsError }, { data: variants, error: variantsError }] = await Promise.all([
    supabase.from("arc_products").select("id,name,description,status,source,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }),
    supabase.from("arc_product_variants").select("id,product_id,sku,price,currency,stock").eq("organization_id", organization.id),
  ]);

  if (productsError) throw new Error(productsError.message);
  if (variantsError) throw new Error(variantsError.message);

  const canManage = ["owner", "admin", "manager"].includes(membership.role);

  return <Shell active="products" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small>KATALOG · CANLI</small><h2>Ürünler</h2><p>Ürün, SKU, fiyat ve stok bilgileri ArvoOS Supabase commerce çekirdeğinde tutulur.</p></div></section>

    {params.created === "1" && <section className="card" style={{padding:16,marginBottom:20}}><strong>Ürün başarıyla oluşturuldu.</strong></section>}
    {params.error && <section className="card" style={{padding:16,marginBottom:20}}><strong>{errorMessages[params.error] ?? `Ürün işlemi tamamlanamadı (${params.error}).`}</strong></section>}

    {canManage && <section className="card" style={{padding:24,marginBottom:24}}>
      <div className="head"><div><small>YENİ ÜRÜN</small><h3>Kataloğa ekle</h3></div><span>Native ARC ürün</span></div>
      <form action={createProduct} style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:14,marginTop:20}}>
        <label>Ürün adı<input name="name" required maxLength={200} style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label>
        <label>SKU<input name="sku" required maxLength={80} style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label>
        <label>Fiyat (₺)<input name="price" type="number" min="0" step="0.01" required style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label>
        <label>Başlangıç stoku<input name="stock" type="number" min="0" step="1" required defaultValue="0" style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label>
        <label>Durum<select name="status" defaultValue="draft" style={{display:"block",width:"100%",padding:12,marginTop:6}}><option value="draft">Taslak</option><option value="active">Aktif</option></select></label>
        <label style={{gridColumn:"1 / -1"}}>Açıklama<textarea name="description" rows={4} style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label>
        <button type="submit" style={{padding:12}}>Ürün oluştur</button>
      </form>
    </section>}

    <section className="card table"><div className="head"><div><small>KATALOG</small><h3>{products?.length ?? 0} ürün</h3></div><span>{organization.name}</span></div>
      <div className="row th"><span>ÜRÜN</span><span>SKU</span><span>STOK</span><span>FİYAT</span><span>DURUM</span></div>
      {products?.length ? products.map((product, index) => { const variant = variants?.find((item) => item.product_id === product.id); return <div className="row" key={product.id}><span><i className={`swatch s${index%5}`}>AC</i><b>{product.name}</b></span><span>{variant?.sku ?? "—"}</span><span>{variant?.stock ?? 0}</span><span>{variant ? money.format(variant.price / 100) : "—"}</span><span><em>{product.status}</em></span></div>; }) : <div style={{padding:24}}><strong>Henüz ürün yok.</strong><p>Yukarıdaki formdan ilk ArvoARC ürününü oluşturabilirsiniz.</p></div>}
    </section>
  </Shell>;
}
