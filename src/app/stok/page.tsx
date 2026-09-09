import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { adjustInventory } from "./actions";
import { inventoryKindLabel } from "@/lib/commerce-labels";

export default async function Stock({ searchParams }: { searchParams: Promise<{ error?: string; updated?: string; q?: string; filter?: string }> }) {
  const params = await searchParams;
  const { supabase, organization, membership } = await requireTenant();
  const canManage = ["owner", "admin", "manager"].includes(membership.role);

  /*
    Filtreleme ve sayım veritabanına taşındı.

    Öncesinde 15.000+ varyantın tamamı çekilip bellekte
    süzülüyordu. Supabase varsayılan olarak en fazla 1000 satır
    döndürdüğü için sayılar sessizce yanlıştı: "toplam adet" ve
    "negatif stok" rakamları kataloğun yalnızca bir kısmını
    yansıtıyordu.
  */
  const {data:settings,error:settingsError}=await supabase.from("arc_store_settings").select("low_stock_threshold").eq("organization_id",organization.id).maybeSingle();
  if(settingsError)throw new Error(settingsError.message);
  const lowStockThreshold=settings?.low_stock_threshold??5;

  const search=(params.q??"").trim();
  const stockFilter=["negative","zero","low","available","backorder"].includes(params.filter??"")?params.filter:"all";

  /** Seçilen filtreyi sorguya uygular. */
  const applyFilter=<T extends {lt:(c:string,v:number)=>T;eq:(c:string,v:unknown)=>T;gt:(c:string,v:number)=>T;lte:(c:string,v:number)=>T}>(query:T):T=>{
    if(stockFilter==="negative")return query.lt("stock",0);
    if(stockFilter==="zero")return query.eq("stock",0);
    if(stockFilter==="low")return query.gt("stock",0).lte("stock",lowStockThreshold);
    if(stockFilter==="available")return query.gt("stock",0);
    if(stockFilter==="backorder")return query.eq("allow_backorder",true);
    return query;
  };

  let listQuery=supabase.from("arc_product_variants").select("id,product_id,sku,stock,allow_backorder").eq("organization_id",organization.id).order("stock",{ascending:true}).limit(100);
  if(search)listQuery=listQuery.ilike("sku",`%${search}%`);
  listQuery=applyFilter(listQuery as never) as typeof listQuery;

  const [
    {data:variants,error:variantsError},
    {data:movements,error:movementsError},
    {count:negativeCount},
    {count:zeroCount},
    {count:lowCount},
    {count:unavailableCount},
    {count:variantCount},
    {data:stockSum},
  ]=await Promise.all([
    listQuery,
    supabase.from("arc_inventory_movements").select("id,variant_id,kind,quantity,note,created_at").eq("organization_id",organization.id).order("created_at",{ascending:false}).limit(20),
    supabase.from("arc_product_variants").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).lt("stock",0),
    supabase.from("arc_product_variants").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).eq("stock",0),
    supabase.from("arc_product_variants").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).gt("stock",0).lte("stock",lowStockThreshold),
    supabase.from("arc_product_variants").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).lte("stock",0).eq("allow_backorder",false),
    supabase.from("arc_product_variants").select("id",{count:"exact",head:true}).eq("organization_id",organization.id),
    /*
      Toplam adet veritabanında toplanıyor. Listelenen 100 kaydı
      toplamak yanlış rakam veriyordu; 15.740 varyantın tamamı
      belleğe alınamaz.
    */
    supabase.rpc("arc_total_stock_units"),
  ]);

  if(variantsError)throw new Error(variantsError.message);
  if(movementsError)throw new Error(movementsError.message);

  const visibleVariants=variants??[];

  /* Yalnızca listelenen varyantların ürün adları çekilir. */
  const productIds=[...new Set([...visibleVariants.map(v=>v.product_id)])];
  const {data:products}=productIds.length
    ?await supabase.from("arc_products").select("id,name,status").in("id",productIds)
    :{data:[]};

  const productName=new Map((products??[]).map(product=>[product.id,product.name]));
  const variantMap=new Map(visibleVariants.map(variant=>[variant.id,variant]));

  /* Sayaçlar veritabanından geliyor; liste yalnızca ilk 100. */
  const negative={length:negativeCount??0};
  const zero={length:zeroCount??0};
  const low={length:lowCount??0};
  const unavailable={length:unavailableCount??0};

  return <Shell active="stock" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small>OPERASYON · CANLI</small><h2>Stok Yönetimi</h2><p>Negatif stok desteklenir. Stoksuz satış açık varyantlar eksi stoka düşebilir; tüm değişiklikler hareket bazında kaydedilir.</p></div><a href="/api/disari-aktar/stok" style={{padding:"12px 16px",background:"var(--ink)",color:"white"}}>CSV indir ↓</a></section>
    {params.updated === "1" && <section className="card" style={{padding:16,marginBottom:20}}><strong>Stok hareketi kaydedildi.</strong></section>}
    {params.error && <section className="card" style={{padding:16,marginBottom:20}}><strong>İşlem tamamlanamadı: {params.error}</strong></section>}
    <section className="metrics"><article><span>TOPLAM STOK</span><strong>{(typeof stockSum==="number"?stockSum:0).toLocaleString("tr-TR")}</strong><small>{(variantCount??0).toLocaleString("tr-TR")} varyant</small></article><article><span>NEGATİF</span><strong>{negative.length}</strong><small>Tedarik gerekli</small></article><article><span>STOK SIFIR</span><strong>{zero.length}</strong><small>Satış politikası kontrolü</small></article><article><span>DÜŞÜK STOK</span><strong>{low.length}</strong><small>1–{lowStockThreshold} adet arası</small></article></section>
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

    <section className="card" style={{padding:24,marginTop:24}}><div className="head"><div><small>HAREKET GEÇMİŞİ</small><h3>Son 20 işlem</h3></div></div>{(movements ?? []).length ? (movements ?? []).map((movement)=>{const variant=variantMap.get(movement.variant_id);return <div className="order" key={movement.id}><i>{movement.quantity > 0 ? "+" : "−"}</i><div><b>{variant?.sku ?? "SKU"} · {inventoryKindLabel(movement.kind)}</b><small>{movement.note || new Date(movement.created_at).toLocaleString("tr-TR")}</small></div><strong>{movement.quantity > 0 ? "+" : ""}{movement.quantity}</strong></div>}) : <p>Henüz stok hareketi yok.</p>}</section>
  </Shell>;
}
