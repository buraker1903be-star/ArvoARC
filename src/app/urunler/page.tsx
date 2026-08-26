import Image from "next/image";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { createProduct } from "./actions";
import { createProductImageUrls } from "@/lib/product-images";
import { productStatusLabel } from "@/lib/commerce-labels";

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const errorMessages: Record<string, string> = { forbidden: "Bu hesap ürün oluşturma yetkisine sahip değil.", "invalid-product": "Ürün bilgilerini kontrol edin.", "23505": "Bu SKU zaten kullanılıyor." };

type ProductMeta = { images?: string[]; image_paths?:string[]; vendor?: string; type?: string; tags?: string; badge?:string; badge_tone?:string };

export default async function Products({ searchParams }: { searchParams: Promise<{ error?: string; created?: string; q?: string; filter?: string; page?:string }> }) {
  const params = await searchParams;
  const { supabase, organization, membership } = await requireTenant();
  const search=(params.q??"").trim().toLocaleLowerCase("tr-TR");
  const statusFilter:string=["active","draft","archived"].includes(params.filter??"")?(params.filter as string):"all";
  const pageSize=24;
  const currentPage=search?1:Math.max(1,Number.parseInt(params.page??"1",10)||1);
  let productsQuery=supabase.from("arc_products").select("id,name,description,status,source,metadata,created_at",{count:"exact"}).eq("organization_id",organization.id).order("created_at",{ascending:false});
  if(statusFilter!=="all")productsQuery=productsQuery.eq("status",statusFilter);
  if(!search)productsQuery=productsQuery.range((currentPage-1)*pageSize,currentPage*pageSize-1);
  const [{data:products,error:productsError,count:filteredCount},{count:totalProductCount,error:totalCountError},{count:activeProductCount,error:activeCountError},{count:totalVariantCount,error:variantCountError}]=await Promise.all([
    productsQuery,
    supabase.from("arc_products").select("id",{count:"exact",head:true}).eq("organization_id",organization.id),
    supabase.from("arc_products").select("id",{count:"exact",head:true}).eq("organization_id",organization.id).eq("status","active"),
    supabase.from("arc_product_variants").select("id",{count:"exact",head:true}).eq("organization_id",organization.id),
  ]);
  if (productsError) throw new Error(productsError.message);
  if(totalCountError||activeCountError||variantCountError)throw new Error((totalCountError??activeCountError??variantCountError)?.message??"Katalog sayıları okunamadı.");
  const canManage = ["owner", "admin", "manager"].includes(membership.role);
  const visibleProducts=(products??[]).filter(product=>{
    if(!search)return true;
    const meta=(product.metadata??{}) as ProductMeta;
    return [product.name,product.description,meta.vendor,meta.type,meta.tags].some(value=>(value??"").toLocaleLowerCase("tr-TR").includes(search));
  });
  const visibleIds=visibleProducts.map(product=>product.id);
  const {data:variants,error:variantsError}=visibleIds.length?await supabase.from("arc_product_variants").select("id,product_id,sku,title,price,compare_at_price,currency,stock,allow_backorder,attributes").eq("organization_id",organization.id).in("product_id",visibleIds):{data:[],error:null};
  if(variantsError)throw new Error(variantsError.message);
  const totalPages=search?1:Math.max(1,Math.ceil((filteredCount??0)/pageSize));
  const pageHref=(page:number)=>{const query=new URLSearchParams();if(statusFilter!=="all")query.set("filter",statusFilter);query.set("page",String(page));return `/urunler?${query}`};
  const variantsByProduct=new Map<string,typeof variants>();
  for(const variant of variants??[]){
    const list=variantsByProduct.get(variant.product_id)??[];
    list.push(variant);
    variantsByProduct.set(variant.product_id,list);
  }
  const firstImagePaths=visibleProducts.flatMap(product=>{
    const path=((product.metadata??{}) as ProductMeta).image_paths?.[0];
    return path?[path]:[];
  });
  const signedImageUrls=await createProductImageUrls(supabase,firstImagePaths);
  const signedByPath=new Map(firstImagePaths.map((path,index)=>[path,signedImageUrls[index]]));
  const productImages=new Map(visibleProducts.map(product=>{
    const meta=(product.metadata??{}) as ProductMeta;
    const path=meta.image_paths?.[0];
    return [product.id,(path?signedByPath.get(path):undefined)??meta.images?.[0]] as const;
  }));

  return <Shell active="products" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small>KATALOG · CANLI</small><h2>Ürünler</h2><p>{activeProductCount??0} aktif katalog ürünü · {totalProductCount??0} toplam ürün · {totalVariantCount??0} varyant. Stoksuz satış açık varyantlarda satış stok sıfırın altına inse de devam eder.</p></div></section>
    {params.created === "1" && <section className="card" style={{padding:16,marginBottom:20}}><strong>Ürün başarıyla oluşturuldu.</strong></section>}
    {params.error && <section className="card" style={{padding:16,marginBottom:20}}><strong>{errorMessages[params.error] ?? `Ürün işlemi tamamlanamadı (${params.error}).`}</strong></section>}
    <section className="card" style={{padding:20,marginBottom:20}}><form style={{display:"grid",gridTemplateColumns:"minmax(220px,1fr) 180px auto auto",gap:10,alignItems:"end"}}><label>Katalogda ara<input name="q" defaultValue={params.q??""} placeholder="Ürün, marka, tür veya etiket" style={{display:"block",width:"100%",padding:12,marginTop:6}}/></label><label>Durum<select name="filter" defaultValue={statusFilter} style={{display:"block",width:"100%",padding:12,marginTop:6}}><option value="all">Tüm ürünler</option><option value="active">Aktif</option><option value="draft">Taslak</option><option value="archived">Arşivlenmiş</option></select></label><button type="submit" style={{padding:12}}>Filtrele</button>{(params.q||statusFilter!=="all")&&<Link href="/urunler" style={{padding:12}}>Temizle</Link>}</form></section>
    {canManage && <details className="card" style={{padding:24,marginBottom:24}}><summary style={{cursor:"pointer",fontWeight:800}}>+ Yeni ürün oluştur</summary><form action={createProduct} style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:14,marginTop:20}}>
      <label>Ürün adı<input name="name" required maxLength={200} style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label><label>SKU<input name="sku" required maxLength={80} style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label>
      <label>Satış fiyatı (₺)<input name="price" type="number" min="0" step="0.01" required style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label><label>Karşılaştırma fiyatı (₺)<input name="compare_at_price" type="number" min="0" step="0.01" placeholder="İndirim yoksa boş" style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label><label>Başlangıç stoku<input name="stock" type="number" step="1" required defaultValue="0" style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label>
      <label>Durum<select name="status" defaultValue="draft" style={{display:"block",width:"100%",padding:12,marginTop:6}}><option value="draft">Taslak</option><option value="active">Aktif</option></select></label><label style={{display:"flex",alignItems:"center",gap:10}}><input name="allow_backorder" type="checkbox" defaultChecked /> Stok yokken satışa devam et</label>
      <label style={{gridColumn:"1 / -1"}}>Açıklama<textarea name="description" rows={4} style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label><button type="submit" style={{padding:12}}>Ürün oluştur</button>
    </form></details>}
    <section className="product-catalog">
      <div className="product-catalog-head"><div><small>KATALOG</small><h3>{search?visibleProducts.length:(filteredCount??0)} ürün</h3></div><span>{organization.name}</span></div>
      {visibleProducts.length ? <div className="product-card-grid">{visibleProducts.map((product,index)=>{
        const pv=variantsByProduct.get(product.id)??[];
        const prices=pv.map(variant=>variant.price);
        const totalStock=pv.reduce((sum,variant)=>sum+variant.stock,0);
        const backorder=pv.some(variant=>variant.allow_backorder);
        const meta=(product.metadata??{}) as ProductMeta;
        const image=productImages.get(product.id);
        const minPrice=prices.length?Math.min(...prices):0;
        const maxPrice=prices.length?Math.max(...prices):0;
        const discounted=pv.filter(variant=>(variant.compare_at_price??0)>variant.price);
        const maxDiscount=discounted.length?Math.max(...discounted.map(variant=>Math.round((1-variant.price/(variant.compare_at_price??variant.price))*100))):0;
        const comparePrices=discounted.map(variant=>variant.compare_at_price??0);
        const compareLabel=comparePrices.length?money.format(Math.max(...comparePrices)/100):"";
        const priceLabel=prices.length?(minPrice===maxPrice?money.format(minPrice/100):`${money.format(minPrice/100)} – ${money.format(maxPrice/100)}`):"Fiyat girilmemiş";
        const stockTone=totalStock<0?"danger":totalStock<=5?"low":"healthy";
        return <Link prefetch={false} href={`/urunler/${product.id}`} className="product-card" key={product.id}>
          <div className="product-card-media">
            {image?<Image src={image} alt={product.name} width={720} height={720} sizes="(max-width:640px) 100vw, (max-width:1100px) 50vw, 25vw" priority={index<4} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<div className="product-card-placeholder"><span>ARVO ARC</span><b>{product.name.slice(0,2).toUpperCase()}</b></div>}
            <em className={`product-status ${product.status}`}>{productStatusLabel(product.status)}</em>
            {maxDiscount>0?<span className="discount-badge">-%{maxDiscount}</span>:meta.badge?<span className={`catalog-badge ${meta.badge_tone??"green"}`}>{meta.badge}</span>:null}
            <span className="product-source">{meta.vendor||(product.source==="shopify"?"Shopify arşivi":"ARVO ARC")}</span>
          </div>
          <div className="product-card-body">
            <div className="product-card-title"><small>{meta.type||"Katalog ürünü"}</small><h3>{product.name}</h3></div>
            <div className="product-card-price"><strong>{priceLabel}</strong><span>{compareLabel?<><s>{compareLabel}</s> · </>:null}{pv.length} varyant</span></div>
            <div className="product-card-stats">
              <span><small>SKU</small><b>{pv[0]?.sku??"—"}</b></span>
              <span><small>TOPLAM STOK</small><b className={stockTone}>{totalStock}</b></span>
            </div>
            <div className="product-card-footer"><span>{backorder?"Stoksuz satış açık":"Stok kontrollü"}</span><b>Düzenle →</b></div>
          </div>
        </Link>;
      })}</div> : <div className="card product-empty"><strong>Arama kriterine uygun ürün bulunamadı.</strong><p>Filtreleri temizleyerek tüm kataloğu görüntüleyebilirsiniz.</p></div>}
      {!search&&totalPages>1&&<nav className="catalog-pagination" aria-label="Ürün sayfaları"><span>{currentPage}. sayfa / {totalPages}</span><div>{currentPage>1&&<Link prefetch={false} href={pageHref(currentPage-1)}>← Önceki</Link>}{currentPage<totalPages&&<Link prefetch={false} href={pageHref(currentPage+1)}>Sonraki →</Link>}</div></nav>}
    </section>
  </Shell>;
}
