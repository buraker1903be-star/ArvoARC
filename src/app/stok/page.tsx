import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { adjustInventory } from "./actions";

export default async function Stock({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string; q?: string; filter?: string }> }) {
  const params = await searchParams;
  const { supabase, organization, membership } = await requireTenant();
  const canManage = ["owner", "admin", "manager"].includes(membership.role);

  const [{ data: variants, error: variantsError }, { data: products, error: productsError }, { data: movements, error: movementsError }, {data:settings,error:settingsError}] = await Promise.all([
    supabase.from("arc_product_variants").select("id,product_id,sku,stock,allow_backorder").eq("organization_id", organization.id).order("stock", { ascending: true }),
    supabase.from("arc_products").select("id,name,status").eq("organization_id", organization.id),
    supabase.from("arc_inventory_movements").select("id,variant_id,kind,quantity,note,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("arc_store_settings").select("low_stock_threshold").eq("organization_id",organization.id).maybeSingle(),
  ]);
  if (variantsError) throw new Error(variantsError.message);
  if (productsError) throw new Error(productsError.message);
  if (movementsError) throw new Error(movementsError.message);
  if (settingsError) throw new Error(settingsError.message);

  const productName = new Map((products ?? []).map((product) => [product.id, product.name]));
  const variantMap = new Map((variants ?? []).map((variant) => [variant.id, variant]));
  const negative = (variants ?? []).filter((variant) => variant.stock < 0);
  const unavailable = (variants ?? []).filter((variant) => variant.stock <= 0 && !variant.allow_backorder);
  const zero=(variants??[]).filter(variant=>variant.stock===0);
  const lowStockThreshold=settings?.low_stock_threshold??5;
  const low=(variants??[]).filter(variant=>variant.stock>0&&variant.stock<=lowStockThreshold);
  const totalUnits=(variants??[]).reduce((sum,variant)=>sum+variant.stock,0);
  const search=(params.q??"").trim().toLocaleLowerCase("tr-TR");
  const stockFilter=["negative","zero","low","available","backorder"].includes(params.filter??"")?params.filter:"all";
  const visibleVariants=(variants??[]).filter(variant=>{
    const name=productName.get(variant.product_id)??"";
    if(search&&!name.toLocaleLowerCase("tr-TR").includes(search)&&!variant.sku.toLocaleLowerCase("tr-TR").includes(search))return false;
    if(stockFilter==="negative")return variant.stock<0;
    if(stockFilter==="zero")return variant.stock===0;
    if(stockFilter==="low")return variant.stock>0&&variant.stock<=lowStockThreshold;
    if(stockFilter==="available")return variant.stock>0;
    if(stockFilter==="backorder")return variant.allow_backorder;
    return true;
  });

  return <Shell active="stock" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small>OPERASYON · CANLI</small><h2>Stok Yönetimi</h2><p>Negatif stok desteklenir. Stoksuz satış açık varyantlar eksi stoka düşebilir; tüm değişiklikler hareket bazında kaydedilir.</p></div><a href="/api/disari-aktar/stok" style={{padding:"12px 16px",background:"var(--ink)",color:"white"}}>CSV indir ↓</a></section>
    {params.updated === "1" && <section className="card" style={{padding:16,marginBottom:20}}><strong>Stok hareketi kaydedildi.</strong></section>}
    {params.error && <section className="card" style={{padding:16,marginBottom:20}}><strong>İşlem tamamlanamadı: {params.error}</strong></section>}
    <section className="metrics"><article><span>TOPLAM STOK</span><strong>{totalUnits}</strong><small>{variants?.length??0} varyant</small></article><article><span>NEGATİF</span><strong>{negative.length}</strong><small>Tedarik gerekli</small></article><article><span>STOK SIFIR</span><strong>{zero.length}</strong><small>Satış politikası kontrolü</small></article><article><span>DÜŞÜK STOK</span><strong>{low.length}</strong><small>1–{lowStockThreshold} adet arası</small></article></section>
    <section className="card" style={{padding:20,marginBottom:20}}><form style={{display:"grid",gridTemplateColumns:"minmax(220px,1fr) 190px auto auto",gap:10,alignItems:"end"}}><label>Stokta ara<input name="q" defaultValue={params.q??""} placeholder="Ürün adı veya SKU" style={{display:"block",width:"100%",padding:12,marginTop:6}}/></label><label>Stok durumu<select name="filter" defaultValue={stockFilter} style={{display:"block",width:"100%",padding:12,marginTop:6}}><option value="all">Tüm varyantlar</option><option value="negative">Negatif stok</option><option value="zero">Stok sıfır</option><option value="low">Düşük stok (1–5)</option><option value="available">Stokta var</option><option value="backorder">Stoksuz satış açık</option></select></label><button type="submit" style={{padding:12}}>Filtrele</button>{(params.q||stockFilter!=="all")&&<a href="/stok" style={{padding:12}}>Temizle</a>}</form></section>
    {(negative.length > 0 || unavailable.length > 0) && <section className="notice"><b>{negative.length + unavailable.length}</b><h3>Stok aksiyonu gerekiyor</h3><p>{negative.length} varyant negatif stokta; {unavailable.length} varyantta stok yok ve stoksuz satış kapalı.</p></section>}

    {canManage && <section className="card" style={{padding:24,marginBottom:24}}><div className="head"><div><small>HAREKET</small><h3>Stok güncelle</h3></div><span>Atomik kayıt</span></div><form action={adjustInventory} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:12,marginTop:18}}>
      <label>Varyant<select name="variant_id" required style={{display:"block",width:"100%",padding:12,marginTop:6}}><option value="">Seçin</option>{(variants ?? []).map((variant)=><option key={variant.id} value={variant.id}>{productName.get(variant.product_id) ?? "Ürün"} · {variant.sku} · stok {variant.stock}{variant.allow_backorder ? " · stoksuz satış açık" : ""}</option>)}</select></label>
      <label>İşlem<select name="direction" defaultValue="in" style={{display:"block",width:"100%",padding:12,marginTop:6}}><option value="in">Stok girişi</option><option value="out">Stok çıkışı</option><option value="adjustment">Pozitif düzeltme</option></select></label>
      <label>Miktar<input name="quantity" type="number" min="1" step="1" required style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label>
      <label style={{gridColumn:"1 / -1"}}>Not<input name="note" maxLength={300} style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label>
      <button type="submit" style={{padding:12}}>Hareketi kaydet</button>
    </form></section>}

    <section className="card table"><div className="head"><div><small>STOK</small><h3>{visibleVariants.length} varyant</h3></div><span>{organization.name}</span></div><div className="row th"><span>ÜRÜN</span><span>SKU</span><span>STOK</span><span>POLİTİKA</span><span>DURUM</span></div>{visibleVariants.map((variant,index)=><div className="row" key={variant.id}><span><i className={`swatch s${index%5}`}>AC</i><b>{productName.get(variant.product_id) ?? "Ürün"}</b></span><span>{variant.sku}</span><span>{variant.stock}</span><span>{variant.allow_backorder ? "Stoksuz satış açık" : "Stok zorunlu"}</span><span><em>{variant.stock < 0 ? "Tedarik gerekli" : variant.stock === 0 ? "Stok sıfır" : "Stokta"}</em></span></div>)}</section>

    <section className="card" style={{padding:24,marginTop:24}}><div className="head"><div><small>HAREKET GEÇMİŞİ</small><h3>Son 20 işlem</h3></div></div>{(movements ?? []).length ? (movements ?? []).map((movement)=>{const variant=variantMap.get(movement.variant_id);return <div className="order" key={movement.id}><i>{movement.quantity > 0 ? "+" : "−"}</i><div><b>{variant?.sku ?? "SKU"} · {movement.kind}</b><small>{movement.note || new Date(movement.created_at).toLocaleString("tr-TR")}</small></div><strong>{movement.quantity > 0 ? "+" : ""}{movement.quantity}</strong></div>}) : <p>Henüz stok hareketi yok.</p>}</section>
  </Shell>;
}
