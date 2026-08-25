import Image from "next/image";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { createProduct } from "./actions";
import { createProductImageUrls } from "@/lib/product-images";

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const errorMessages: Record<string, string> = { forbidden: "Bu hesap ürün oluşturma yetkisine sahip değil.", "invalid-product": "Ürün bilgilerini kontrol edin.", "23505": "Bu SKU zaten kullanılıyor." };

type ProductMeta = { images?: string[]; image_paths?:string[]; vendor?: string; type?: string; tags?: string };

export default async function Products({ searchParams }: { searchParams: Promise<{ error?: string; created?: string }> }) {
  const params = await searchParams;
  const { supabase, organization, membership } = await requireTenant();
  const [{ data: products, error: productsError }, { data: variants, error: variantsError }] = await Promise.all([
    supabase.from("arc_products").select("id,name,description,status,source,metadata,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }),
    supabase.from("arc_product_variants").select("id,product_id,sku,title,price,currency,stock,allow_backorder,attributes").eq("organization_id", organization.id),
  ]);
  if (productsError) throw new Error(productsError.message);
  if (variantsError) throw new Error(variantsError.message);
  const canManage = ["owner", "admin", "manager"].includes(membership.role);
  const productImages=new Map(await Promise.all((products??[]).map(async product=>{
    const meta=(product.metadata??{}) as ProductMeta;
    const signed=await createProductImageUrls(supabase,meta.image_paths??[]);
    return [product.id,signed[0]??meta.images?.[0]] as const;
  })));

  return <Shell active="products" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small>KATALOG · CANLI</small><h2>Ürünler</h2><p>{products?.length ?? 0} aktif katalog ürünü · {variants?.length ?? 0} varyant. Stoksuz satış açık varyantlarda satış stok sıfırın altına inse de devam eder.</p></div></section>
    {params.created === "1" && <section className="card" style={{padding:16,marginBottom:20}}><strong>Ürün başarıyla oluşturuldu.</strong></section>}
    {params.error && <section className="card" style={{padding:16,marginBottom:20}}><strong>{errorMessages[params.error] ?? `Ürün işlemi tamamlanamadı (${params.error}).`}</strong></section>}
    {canManage && <details className="card" style={{padding:24,marginBottom:24}}><summary style={{cursor:"pointer",fontWeight:800}}>+ Yeni ürün oluştur</summary><form action={createProduct} style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:14,marginTop:20}}>
      <label>Ürün adı<input name="name" required maxLength={200} style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label><label>SKU<input name="sku" required maxLength={80} style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label>
      <label>Fiyat (₺)<input name="price" type="number" min="0" step="0.01" required style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label><label>Başlangıç stoku<input name="stock" type="number" step="1" required defaultValue="0" style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label>
      <label>Durum<select name="status" defaultValue="draft" style={{display:"block",width:"100%",padding:12,marginTop:6}}><option value="draft">Taslak</option><option value="active">Aktif</option></select></label><label style={{display:"flex",alignItems:"center",gap:10}}><input name="allow_backorder" type="checkbox" defaultChecked /> Stok yokken satışa devam et</label>
      <label style={{gridColumn:"1 / -1"}}>Açıklama<textarea name="description" rows={4} style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label><button type="submit" style={{padding:12}}>Ürün oluştur</button>
    </form></details>}
    <section className="card table"><div className="head"><div><small>KATALOG</small><h3>{products?.length ?? 0} ürün</h3></div><span>{organization.name}</span></div><div className="row th"><span>ÜRÜN</span><span>VARYANT</span><span>STOK</span><span>FİYAT</span><span>DURUM</span></div>
      {products?.length ? products.map((product)=>{const pv=variants?.filter(item=>item.product_id===product.id)??[];const prices=pv.map(v=>v.price);const totalStock=pv.reduce((sum,v)=>sum+v.stock,0);const backorder=pv.some(v=>v.allow_backorder);const meta=(product.metadata??{}) as ProductMeta;const image=productImages.get(product.id);const priceLabel=prices.length ? (Math.min(...prices)===Math.max(...prices)?money.format(prices[0]/100):`${money.format(Math.min(...prices)/100)} – ${money.format(Math.max(...prices)/100)}`) : "—";return <Link href={`/urunler/${product.id}`} className="row" key={product.id} style={{textDecoration:"none",color:"inherit"}}><span style={{display:"flex",gap:12,alignItems:"center"}}>{image?<Image src={image} alt="" width={52} height={52} sizes="52px" style={{width:52,height:52,objectFit:"cover",borderRadius:10}}/>:<i className="swatch">AC</i>}<span><b style={{display:"block"}}>{product.name}</b><small>{meta.vendor || (product.source==="shopify"?"Shopify aktarımı":"ARVO ARC")}</small></span></span><span><b>{pv.length}</b><small style={{display:"block"}}>{pv[0]?.sku??"SKU yok"}</small></span><span>{totalStock}{backorder?<small style={{display:"block"}}>stoksuz satış açık</small>:null}</span><span>{priceLabel}</span><span><em>{product.status}</em></span></Link>}) : <div style={{padding:24}}><strong>Henüz ürün yok.</strong></div>}
    </section>
  </Shell>;
}
