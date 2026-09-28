import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { createVariant, removeProductImage, updateProduct, updateVariant, uploadProductImages, urunuKopyala, varyantMatrisi } from "./actions";
import { createProductImageUrls } from "@/lib/product-images";
import { productStatusLabel, sourceLabel } from "@/lib/commerce-labels";
import { Icon } from "@/components/panel/icons";
import { PanelBildirimi } from "@/components/panel/bildirim";
import { ListeBos, ListeBosEylem } from "@/components/panel/liste-bos";
import { trIsoToLocal } from "@/lib/tr-time";
import { yayinOzeti } from "@/lib/yayin-plani";
import { SeoFields } from "./seo-fields";
import "../../catalog.css";

const money=new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"});

type Meta={
  images?:string[];image_paths?:string[];vendor?:string;type?:string;tags?:string;
  subtitle?:string;seo_title?:string;seo_description?:string;google_product_category?:string;
  gtin?:string;mpn?:string;condition?:string;material?:string;color?:string;gender?:string;age_group?:string;badge?:string;badge_tone?:string;
  /* İşaretliyken Shopify içe aktarımı bu ürüne dokunmuyor. */
  panelden_yonetiliyor?:boolean;
};


export default async function ProductDetail({params}:{params:Promise<{id:string}>}){
  const {id}=await params; const {supabase,organization,membership}=await requireTenant();
  const [{data:product,error},{data:variants,error:variantError},{data:settings}]=await Promise.all([
    supabase.from("arc_products").select("id,name,slug,description,status,source,metadata,created_at,publish_at,unpublish_at").eq("organization_id",organization.id).eq("id",id).maybeSingle(),
    supabase.from("arc_product_variants").select("id,sku,title,price,compare_at_price,currency,stock,allow_backorder,attributes,cost_price,image_path").eq("organization_id",organization.id).eq("product_id",id).order("title"),
    supabase.from("arc_store_settings").select("storefront_url").eq("organization_id",organization.id).maybeSingle(),
  ]);
  if(error)throw new Error(error.message);if(variantError)throw new Error(variantError.message);if(!product)notFound();
  const canManage=["owner","admin","manager"].includes(membership.role);
  const meta=(product.metadata??{}) as Meta;
  const variantList=variants??[];

  /*
    Görseller: kendi ürünlerimizde ArvoARC deposundaki yol (imzalı
    bağlantı gerekir), tedarikçi ürünlerinde CDN adresi. Öncesinde
    tedarikçi adresleri de imzalanmaya çalışılıyor, galeri boş
    kalabiliyordu. Yalnızca depodaki görseller silinebilir.
  */
  const isRemote=(path:string)=>path.startsWith("http");
  const imagePaths=meta.image_paths??[];
  const storedPaths=imagePaths.filter(path=>!isRemote(path));
  const signed=await createProductImageUrls(supabase,storedPaths);
  const signedByPath=new Map(storedPaths.map((path,index)=>[path,signed[index]]));
  const imageEntries=(imagePaths.length
    ?imagePaths.map(path=>({url:isRemote(path)?path:signedByPath.get(path),path:isRemote(path)?"":path}))
    :(meta.images??[]).map(url=>({url,path:""}))
  ).filter((image):image is {url:string;path:string}=>Boolean(image.url));

  /*
    Varyantın görseli galeride imzalanmış olanlardan biri. Ayrıca
    imzalanmıyor: aynı nesne için ikinci bir imza turu, sayfayı
    varyant sayısı kadar yavaşlatırdı.
  */
  const gorselAdresi=new Map(imageEntries.map(image=>[image.path,image.url]));
  const varyantGorseli=(yol:string|null)=>{
    const adres=yol?gorselAdresi.get(yol):undefined;
    return adres?<Image className="vl-thumb" src={adres} alt="" width={64} height={64}/>:null;
  };

  const prices=variantList.map(variant=>variant.price);
  const minPrice=prices.length?Math.min(...prices):0;
  const maxPrice=prices.length?Math.max(...prices):0;
  const totalStock=variantList.reduce((sum,variant)=>sum+variant.stock,0);
  const backorderCount=variantList.filter(variant=>variant.allow_backorder).length;

  /* Mağaza bağlantısı yalnızca yayındaki üründe; adres mağaza ayarlarından. */
  let storeHref:string|null=null;
  try{
    const storefront=new URL(settings?.storefront_url??"");
    if(storefront.protocol==="https:"&&product.status==="active"&&product.slug)storeHref=`${storefront.origin}/urun/${product.slug}`;
  }catch{storeHref=null;}

  const statusTone=product.status==="active"?undefined:product.status==="draft"?"warn":"muted";
  const planOzeti=yayinOzeti(product.publish_at,product.unpublish_at);

  return <>
    <section className="ac-bar">
      <div>
        <Link prefetch={false} className="product-back" href="/urunler">← Ürünler</Link>
        <h1>{product.name}</h1>
        <p>{meta.subtitle||[meta.vendor||"ArvoARC",meta.type,sourceLabel(product.source)].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="product-head-actions">
        <em className="ac-tag" data-tone={statusTone}>{productStatusLabel(product.status)}</em>
        {storeHref?<a className="ac-btn" href={storeHref} target="_blank" rel="noreferrer"><Icon name="external" size={15}/>Mağazada gör</a>:null}
        {/*
          Kopyalama ONAY İSTEMİYOR: yeni bir taslak üretiyor, hiçbir
          şeyi bozmuyor ve yanlışlıkla basılırsa kopya arşivlenip
          geçiliyor. ConfirmSubmit geri alınamayan işler için.
        */}
        {canManage?(
          <form action={urunuKopyala}>
            <input type="hidden" name="product_id" value={product.id}/>
            <button className="ac-btn" type="submit" title="Varyantları ve görselleriyle taslak bir kopya oluşturur">Kopyala</button>
          </form>
        ):null}
      </div>
    </section>

    <div className="ac-stack">
      {/* Sonuç ÇEREZDEN geliyor; adres satırındaki ?error= artık
          okunmuyor: dışarıdan gönderilen bağlantı uydurma mesaj
          gösterebiliyordu (lib/panel-bildirim.ts). */}
      <PanelBildirimi />

      <section className="ac-metrics product-facts" aria-label="Ürün özeti">
        <article className="ac-metric"><span>Fiyat</span><strong>{prices.length?(minPrice===maxPrice?money.format(minPrice/100):`${money.format(minPrice/100)} – ${money.format(maxPrice/100)}`):"—"}</strong><small>KDV dâhil satış fiyatı</small></article>
        <article className="ac-metric" data-tone={totalStock<0?"bad":totalStock===0?"warn":undefined}><span>Toplam stok</span><strong>{totalStock.toLocaleString("tr-TR")} adet</strong><small>{backorderCount?`${backorderCount} varyantta stoksuz satış açık`:"Stoksuz satış kapalı"}</small></article>
        <article className="ac-metric"><span>Varyant</span><strong>{variantList.length}</strong><small>Beden, renk ve seçenekler</small></article>
        <article className="ac-metric"><span>Görsel</span><strong>{imageEntries.length} / 8</strong><small>{imageEntries.length?"İlk görsel kapak olarak kullanılır":"Kapak görseli eksik"}</small></article>
        {/*
          Zamanlama kutusu YALNIZCA plan varken. Boşken "—" gösteren
          beşinci bir kutu, bugün bu panelden kaldırdığımız gürültünün
          aynısı olurdu.
        */}
        {planOzeti?<article className="ac-metric" data-tone="warn"><span>Zamanlama</span><strong>{product.status==="draft"?"Yayına girecek":"Yayından çıkacak"}</strong><small>{planOzeti}</small></article>:null}
      </section>

      <div className="product-layout">
        <section className="ac product-media" aria-label="Ürün görselleri">
          {imageEntries.length?(
            <div className="product-gallery">
              {imageEntries.map((image,index)=>(
                <figure key={image.url}>
                  <Image src={image.url} alt={index===0?product.name:""} width={800} height={800} sizes={index===0?"(max-width:1180px) 100vw, 34vw":"(max-width:1180px) 25vw, 12vw"}/>
                  {canManage&&image.path?(
                    <form action={removeProductImage}>
                      <input type="hidden" name="product_id" value={product.id}/>
                      <input type="hidden" name="path" value={image.path}/>
                      <button type="submit" aria-label={`${index+1}. görseli sil`}>Sil</button>
                    </form>
                  ):null}
                </figure>
              ))}
            </div>
          ):<div className="product-gallery-empty">Henüz görsel yok.<br/>Kapak için bir görsel yükleyin.</div>}
          {canManage?(
            <form action={uploadProductImages} className="product-upload">
              <input type="hidden" name="product_id" value={product.id}/>
              <label>Görsel ekle<input name="images" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple required/></label>
              <small>Tek seferde en fazla 5 dosya ve toplam 4 MB; ürün başına 8 görsel.</small>
              <button className="ac-btn" type="submit">Görselleri yükle</button>
            </form>
          ):null}
        </section>

        <section className="ac product-editor">
          <div className="ac-head"><div><h3>Ürün bilgileri</h3><p>İçerik, SEO ve Google Merchant verileri tek kayıtta saklanır.</p></div></div>
          {canManage?<form action={updateProduct} className="product-editor-form"><input type="hidden" name="id" value={product.id}/>
            <section className="product-editor-section">
              <div className="product-editor-heading"><div><small>TEMEL BİLGİLER</small><h4>Ürün içeriği</h4></div><span>Müşterinin göreceği alanlar</span></div>
              <div className="editor-field-grid">
                <label className="full-field">Ürün adı<input name="name" defaultValue={product.name} required maxLength={200}/></label>
                <label className="full-field">Ürün alt başlığı<input name="subtitle" defaultValue={meta.subtitle??""} maxLength={240} placeholder="Ürünün temel faydasını tek cümlede anlatın"/></label>
                <label>Marka<input name="vendor" defaultValue={meta.vendor??""} maxLength={120} placeholder="Örn. ARVOCULTURE"/></label>
                <label>Ürün türü<input name="type" defaultValue={meta.type??""} maxLength={120} placeholder="Örn. Kişisel bakım"/></label>
                <label>Durum<select name="status" defaultValue={product.status}><option value="active">Aktif</option><option value="draft">Taslak</option><option value="archived">Arşivlenmiş</option></select></label>
                {/*
                  Zamanlama Durum'un YANINDA: ikisi aynı soruyu
                  cevaplıyor ("bu ürün ne zaman mağazada olacak") ve
                  ayrı bölümlere konsaydı çelişkili doldurulurdu.
                  Kayıtlı zaman alana yazılıyor — yazılmasaydı forma
                  dokunmadan Kaydet'e basmak planı silerdi.
                */}
                <label>Yayına girme (Türkiye saati)<input name="publish_at" type="datetime-local" defaultValue={trIsoToLocal(product.publish_at)}/><small>Taslak ürün bu anda kendiliğinden yayına girer</small></label>
                <label>Yayından çıkma (Türkiye saati)<input name="unpublish_at" type="datetime-local" defaultValue={trIsoToLocal(product.unpublish_at)}/><small>Kampanya bitince ürün taslağa döner</small></label>
                {/*
                  Shopify CSV'sinde SKU'su olmayan ürünlerde şart: içe
                  aktarım kimliği yeniden üretip elle düzeltilmiş kaydın
                  yanına ikinci bir varyant ekliyordu.
                */}
                <label className="check-inline"><input type="checkbox" name="panelden_yonetiliyor" defaultChecked={meta.panelden_yonetiliyor===true}/> Panelden yönetiliyor <small>Shopify içe aktarımı bu ürüne dokunmaz</small></label>
                <label>Etiketler<input name="tags" defaultValue={meta.tags??""} maxLength={500} placeholder="bakım, premium, yeni"/></label>
                <label>Ürün rozeti<input name="badge" defaultValue={meta.badge??""} maxLength={40} placeholder="Örn. Yeni, Çok Satan, Özel Seri"/></label>
                <label>Rozet rengi<select name="badge_tone" defaultValue={meta.badge_tone??"green"}><option value="green">ARVO Yeşili</option><option value="navy">Lacivert</option><option value="gold">Altın</option><option value="red">Kırmızı</option></select></label>
                <label className="full-field">Ürün açıklaması<textarea name="description" defaultValue={product.description??""} rows={12} maxLength={20000} placeholder="Ürünün özelliklerini, faydalarını ve kullanım bilgisini detaylandırın."/></label>
              </div>
            </section>

            <SeoFields defaultTitle={meta.seo_title??product.name} defaultDescription={meta.seo_description??""} defaultSlug={product.slug??""} productName={product.name}/>

            <section className="product-editor-section">
              <div className="product-editor-heading"><div><small>EK META BİLGİLERİ</small><h4>Google Merchant ve katalog verileri</h4></div><span>İsteğe bağlı</span></div>
              <div className="editor-field-grid">
                <label className="full-field">Google ürün kategorisi<input name="google_product_category" defaultValue={meta.google_product_category??""} maxLength={240} placeholder="Örn. Sağlık ve Güzellik > Kişisel Bakım"/></label>
                <label>GTIN / Barkod<input name="gtin" defaultValue={meta.gtin??""} maxLength={32} inputMode="numeric" placeholder="EAN / UPC / ISBN"/></label>
                <label>MPN / Üretici kodu<input name="mpn" defaultValue={meta.mpn??""} maxLength={80}/></label>
                <label>Ürün durumu<select name="condition" defaultValue={meta.condition??"new"}><option value="new">Yeni</option><option value="refurbished">Yenilenmiş</option><option value="used">Kullanılmış</option></select></label>
                <label>Malzeme<input name="material" defaultValue={meta.material??""} maxLength={120}/></label>
                <label>Renk<input name="color" defaultValue={meta.color??""} maxLength={120}/></label>
                <label>Hedef cinsiyet<select name="gender" defaultValue={meta.gender??""}><option value="">Belirtilmemiş</option><option value="female">Kadın</option><option value="male">Erkek</option><option value="unisex">Unisex</option></select></label>
                <label>Yaş grubu<select name="age_group" defaultValue={meta.age_group??""}><option value="">Belirtilmemiş</option><option value="newborn">Yenidoğan</option><option value="infant">Bebek</option><option value="toddler">Küçük çocuk</option><option value="kids">Çocuk</option><option value="adult">Yetişkin</option></select></label>
              </div>
            </section>
            <div className="product-editor-actions"><span>Değişiklikler ürün ve SEO bilgilerinde birlikte saklanır.</span><button className="ac-btn ac-btn-primary" type="submit">Tüm ürün bilgilerini kaydet</button></div>
          </form>:<div className="product-readonly"><h4>{meta.subtitle||product.name}</h4><div dangerouslySetInnerHTML={{__html:product.description||"Açıklama bulunmuyor."}}/>{meta.tags?<p><b>Etiketler:</b> {meta.tags}</p>:null}</div>}
        </section>
      </div>

      <section className="ac table list-table variant-list" data-manage={canManage?"":undefined}>
        <div className="ac-head ac-pad-sm list-table-head">
          <div><h3>Varyantlar</h3><p>{variantList.length} varyant · stok miktarına tıklayarak Stok Yönetimi’nde giriş veya çıkış yapın</p></div>
        </div>
        {variantList.length?(
          <>
            <div className="list-row th">
              <span className="vl-title">VARYANT</span>
              {canManage?<span className="vl-gorsel">GÖRSEL</span>:null}
              <span className="vl-sku">SKU</span>
              <span className="vl-price">FİYAT ₺</span>
              <span className="vl-compare">KARŞILAŞTIRMA ₺</span>
              <span className="vl-stock">STOK</span>
              {canManage?<><span className="vl-backorder">POLİTİKA</span><span className="vl-save"/></>:null}
            </div>
            {variantList.map(variant=>{
              const stockTone=variant.stock<0?"bad":variant.stock===0?"warn":undefined;
              const stockLink=<Link prefetch={false} className="stock-pill" data-tone={stockTone} href={`/stok?q=${encodeURIComponent(variant.sku??"")}`} title="Stok hareketi için Stok Yönetimi’ne git">{variant.stock.toLocaleString("tr-TR")} adet</Link>;
              return canManage?(
                <form action={updateVariant} className="list-row" key={variant.id}>
                  <input type="hidden" name="product_id" value={product.id}/>
                  <input type="hidden" name="variant_id" value={variant.id}/>
                  <span className="vl-title">{varyantGorseli(variant.image_path)}<span><b>{variant.title||"Default"}</b>{variant.cost_price?<small>Alış {money.format(variant.cost_price/100)}</small>:null}</span></span>
                  {/*
                    GÖRSEL ÜRÜNÜN GALERİSİNDEN SEÇİLİYOR, yüklenmiyor:
                    varyantın kendi deposu olsaydı aynı fotoğraf iki kez
                    durur, biri silinince öteki kalırdı. Galeri boşken
                    seçici de anlamsız, o yüzden ipucu gösteriliyor.
                  */}
                  <label className="vl-gorsel"><span className="vl-label">Görsel</span>
                    {imageEntries.length?(
                      <select name="image_path" defaultValue={variant.image_path??""} aria-label="Varyant görseli">
                        <option value="">Kapak</option>
                        {imageEntries.map((image,index)=>image.path?<option key={image.path} value={image.path}>Görsel {index+1}</option>:null)}
                      </select>
                    ):<small className="vl-gorsel-bos">Galeri boş</small>}
                  </label>
                  <label className="vl-sku"><span className="vl-label">SKU</span><input name="sku" defaultValue={variant.sku??""} required aria-label="SKU"/></label>
                  <label className="vl-price"><span className="vl-label">Fiyat ₺</span><input name="price" type="number" min="0" step="0.01" defaultValue={(variant.price/100).toFixed(2)} required aria-label="Satış fiyatı"/></label>
                  <label className="vl-compare"><span className="vl-label">Karşılaştırma ₺</span><input name="compare_at_price" type="number" min="0" step="0.01" defaultValue={variant.compare_at_price?(variant.compare_at_price/100).toFixed(2):""} placeholder="İndirim yok" aria-label="Karşılaştırma fiyatı"/></label>
                  <span className="vl-stock"><span className="vl-label">Stok</span>{stockLink}</span>
                  <label className="check-inline vl-backorder"><input name="allow_backorder" type="checkbox" defaultChecked={variant.allow_backorder}/> Stoksuz satış</label>
                  <span className="vl-save"><button className="ac-btn" type="submit">Kaydet</button></span>
                </form>
              ):(
                <div className="list-row" key={variant.id}>
                  <span className="vl-title">{varyantGorseli(variant.image_path)}<span><b>{variant.title||"Default"}</b></span></span>
                  <span className="vl-sku">{variant.sku}</span>
                  <span className="vl-price"><b>{money.format(variant.price/100)}</b></span>
                  <span className="vl-compare">{variant.compare_at_price&&variant.compare_at_price>variant.price?<s>{money.format(variant.compare_at_price/100)}</s>:"—"}</span>
                  <span className="vl-stock">{stockLink}</span>
                </div>
              );
            })}
          </>
        ):<ListeBos baslik="Bu ürünün varyantı yok." aciklama="Ürün varyantsız satılamaz: fiyat, stok ve SKU varyantta tutulur. Tek seçenekli üründe bile bir varyant gerekir.">
          {canManage?<ListeBosEylem href="#yeni-varyant" birincil>Varyant ekle</ListeBosEylem>:null}
        </ListeBos>}
        {canManage?(
          <>
          {/*
            MATRİS ÖNCE: dört renk × beş bedenlik bir üründe tek tek
            ekleme yirmi gönderim demekti. Tekil form altında duruyor,
            çünkü artık istisna olan o.
          */}
          <details className="variant-create-wrap" id="varyant-matrisi">
            <summary>Seçeneklerden toplu varyant üret</summary>
            <form action={varyantMatrisi} className="variant-matrix">
              <input type="hidden" name="product_id" value={product.id}/>
              <p className="list-hint">Renk ve beden gibi seçenekleri yazın; her birleşim için bir varyant üretilir. Değerleri virgülle ayırın. Üründe zaten olan birleşimler atlanır.</p>
              <div className="variant-matrix-options">
                {[1,2,3].map(sira=>(
                  <div className="variant-matrix-option" key={sira}>
                    <label>{sira}. seçenek adı<input name={`secenek_ad_${sira}`} maxLength={40} placeholder={sira===1?"Renk":sira===2?"Beden":"İsteğe bağlı"} className="ac-input"/></label>
                    <label>Değerler<input name={`secenek_deger_${sira}`} maxLength={600} placeholder={sira===1?"Siyah, Beyaz, Lacivert":sira===2?"S, M, L, XL":""} className="ac-input"/></label>
                  </div>
                ))}
              </div>
              <div className="variant-matrix-grid">
                <label>SKU öneki<input name="sku_oneki" maxLength={16} defaultValue={variantList[0]?.sku?.split("-")[0]??""} placeholder={product.slug?.slice(0,16)??"Üründen türetilir"} className="ac-input"/></label>
                <label>Satış fiyatı ₺<input name="price" type="number" min="0" step="0.01" required defaultValue={prices.length?(minPrice/100).toFixed(2):""} className="ac-input"/></label>
                <label>Karşılaştırma fiyatı ₺<input name="compare_at_price" type="number" min="0" step="0.01" placeholder="İndirim yoksa boş" className="ac-input"/></label>
                <label>Her varyantın başlangıç stoku<input name="stock" type="number" step="1" min="0" defaultValue="0" required className="ac-input"/></label>
              </div>
              <div className="catalog-form-actions">
                <label className="check-inline"><input name="allow_backorder" type="checkbox" defaultChecked/> Stoksuz satış</label>
                <button className="ac-btn ac-btn-primary" type="submit">Varyantları üret</button>
              </div>
            </form>
          </details>
          <details className="variant-create-wrap" id="yeni-varyant">
            <summary>Tek varyant ekle</summary>
            <form action={createVariant} className="variant-create-grid">
              <input type="hidden" name="product_id" value={product.id}/>
              <label>Varyant adı<input name="title" placeholder="Örn. Siyah / M" required className="ac-input"/></label>
              <label>SKU<input name="sku" required className="ac-input"/></label>
              <label>Satış fiyatı ₺<input name="price" type="number" min="0" step="0.01" required className="ac-input"/></label>
              <label>Karşılaştırma fiyatı ₺<input name="compare_at_price" type="number" min="0" step="0.01" placeholder="İndirim yoksa boş" className="ac-input"/></label>
              <label>Başlangıç stoku<input name="stock" type="number" step="1" defaultValue="0" required className="ac-input"/></label>
              <div className="catalog-form-actions">
                <label className="check-inline"><input name="allow_backorder" type="checkbox" defaultChecked/> Stoksuz satış</label>
                <button className="ac-btn ac-btn-primary" type="submit">Varyant oluştur</button>
              </div>
            </form>
          </details>
          </>
        ):null}
      </section>
    </div>
  </>;
}
