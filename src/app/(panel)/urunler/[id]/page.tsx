import Image from "next/image";
import { DurumSecici } from "@/components/arvo-ui/durum-secici";
import { kimlikMi } from "@/lib/kimlik";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { magazaAdresi } from "@/lib/magaza-adresi";
import { createVariant, kitapliktanGorselEkle, removeProductImage, updateProduct, updateVariant, uploadProductImages, urunuKopyala, varyantMatrisi } from "./actions";
import { createProductImageUrls } from "@/lib/product-images";
import { productStatusLabel, sourceLabel } from "@/lib/commerce-labels";
import { Pencere } from "@/components/os/pencere";
import { rozetTonu } from "@/lib/rozet-tonu";
import { ListeBos, ListeBosEylem } from "@/components/panel/liste-bos";
import { trIsoToLocal } from "@/lib/tr-time";
import { yayinOzeti } from "@/lib/yayin-plani";
import { terimiTemizle } from "@/lib/panel-arama";
import { SeoFields } from "./seo-fields";
import { VaryantFiyatlari, YeniVaryantFiyatlari } from "./fiyat-alanlari";
// Düzenleyicinin iç biçimi (product-*, variant-*, kitaplik) hâlâ orada; kabuk ve başlık ArvoOS.
import "../../catalog.css";
import "@/components/arvo-ui/kayit-detay.css";
import "./urun-detay.css";

const money=new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"});

type Meta={
  images?:string[];image_paths?:string[];vendor?:string;type?:string;tags?:string;
  subtitle?:string;seo_title?:string;seo_description?:string;google_product_category?:string;
  gtin?:string;mpn?:string;condition?:string;material?:string;color?:string;gender?:string;age_group?:string;badge?:string;badge_tone?:string;
  /* İşaretliyken Shopify içe aktarımı bu ürüne dokunmuyor. */
  panelden_yonetiliyor?:boolean;
};


export default async function ProductDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{medya?:string;pencere?:string}>}){
  const {id}=await params; const sp=await searchParams; const {medya}=sp; const {supabase,organization,membership}=await requireTenant();
  /* Bozuk/kırpılmış kimlik "kayıt yok"tur: Postgres uuid olmayan değeri
     22P02 ile reddediyor ve sayfa okuma hatasını fırlattığı için çökme
     ekranı çıkıyordu (lib/kimlik). */
  if (!kimlikMi(id)) notFound();
  const [{data:product,error},{data:variants,error:variantError},{data:settings}]=await Promise.all([
    supabase.from("arc_products").select("id,name,slug,description,status,source,metadata,created_at,publish_at,unpublish_at").eq("organization_id",organization.id).eq("id",id).maybeSingle(),
    supabase.from("arc_product_variants").select("id,sku,title,price,compare_at_price,currency,stock,allow_backorder,attributes,cost_price,image_path").eq("organization_id",organization.id).eq("product_id",id).order("title"),
    supabase.from("arc_store_settings").select("storefront_url,custom_domain,domain_verified_at,platform_subdomain").eq("organization_id",organization.id).maybeSingle(),
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
    KİTAPLIK SEÇİCİSİ. Arama adres satırından geliyor (?medya=…), yani
    JavaScript yüklenmeden de çalışıyor ve bağlantısı paylaşılabiliyor.
    Yalnızca terim VARKEN sorgulanıyor: her ürün açılışında 24 imzalı
    adres üretmek, seçiciyi açmayan kullanıcıya bedel yüklerdi.
  */
  const kitaplikTerimi=terimiTemizle(medya);
  const kitaplikAcik=typeof medya==="string";
  type MedyaSatiri={yol:string;urun_id:string;urun_adi:string};
  let kitaplik:{yol:string;adres:string;urun:string}[]=[];
  if(kitaplikAcik){
    const {data,error}=await supabase.rpc("arc_medya_listesi",{
      p_organization_id:organization.id,p_arama:kitaplikTerimi||null,p_limit:24,p_offset:0,
    });
    if(error)throw new Error("Medya kitaplığı okunamadı: "+error.message);
    /* Bu üründe zaten olanlar ve tedarikçi CDN adresleri elenir:
       ikincisi bizim depomuzda değil, kopyalanamaz. */
    const adaylar=((data??[]) as MedyaSatiri[])
      .filter(satir=>!satir.yol.startsWith("http")&&!imagePaths.includes(satir.yol));
    const adresler=await createProductImageUrls(supabase,adaylar.map(satir=>satir.yol));
    kitaplik=adaylar.map((satir,sira)=>({yol:satir.yol,adres:adresler[sira],urun:satir.urun_adi}))
      .filter((satir):satir is {yol:string;adres:string;urun:string}=>Boolean(satir.adres));
  }

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

  /*
    Mağaza bağlantısı yalnızca yayındaki üründe. Adres eskiden yalnızca
    storefront_url'den okunuyordu; tek adresi platform alt alan adı olan
    yeni salonun ürününde bağlantı hiç çıkmıyordu. Artık ortak çözücüden
    (lib/magaza-adresi.ts).
  */
  const magazaKoku=settings?magazaAdresi(settings):null;
  const storeHref=magazaKoku&&product.status==="active"&&product.slug?`${new URL(magazaKoku).origin}/urun/${product.slug}`:null;

  const statusTone=product.status==="active"?undefined:product.status==="draft"?"warn":"muted";
  const planOzeti=yayinOzeti(product.publish_at,product.unpublish_at);

  /*
    PENCERELER (16.10.2026): varyant oluşturma formları (seçeneklerden
    toplu üretim ve tek varyant) varyant listesinin dibinde açılır
    kartlardı. Varyant listesi uzun ürünlerde ekranları aşıyor, formlar
    görünmüyordu. Artık başlıktaki düğmeyle aynı sayfada pencere.
  */
  const urunAdresi=`/urunler/${product.id}`;
  const pencere=canManage&&(sp.pencere==="matris"||sp.pencere==="varyant")?sp.pencere:null;

  return (
    <main className="talep urun-detay">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker"><Link prefetch={false} href="/urunler">Ürünler</Link></small>
          <h1>{product.name} <span className="status-pill" data-tone={rozetTonu(statusTone??"good")}>{productStatusLabel(product.status)}</span></h1>
          <p className="talep-bas-alt">{meta.subtitle||[meta.vendor||"ArvoARC",meta.type,sourceLabel(product.source)].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="talep-bas-eylem">
          {storeHref?<a className="panel-secondary" href={storeHref} target="_blank" rel="noreferrer">Mağazada gör ↗</a>:null}
          {canManage?<Link prefetch={false} scroll={false} className="panel-secondary" href={`${urunAdresi}?pencere=matris`}>Seçeneklerden varyant üret</Link>:null}
          {canManage?<Link prefetch={false} scroll={false} className="panel-secondary" href={`${urunAdresi}?pencere=varyant`}>+ Varyant</Link>:null}
          {/*
            Kopyalama ONAY İSTEMİYOR: yeni bir taslak üretiyor, hiçbir
            şeyi bozmuyor ve yanlışlıkla basılırsa kopya arşivlenip
            geçiliyor. ConfirmSubmit geri alınamayan işler için.
          */}
          {canManage?(
            <form action={urunuKopyala}>
              <input type="hidden" name="product_id" value={product.id}/>
              <button className="panel-secondary" type="submit" title="Varyantları ve görselleriyle taslak bir kopya oluşturur">Kopyala</button>
            </form>
          ):null}
        </div>
      </header>

      <nav className="kayit-serit talep-serit" aria-label="Ürün özeti">
        <dl>
          <div><dt>Fiyat</dt><dd>{prices.length?(minPrice===maxPrice?money.format(minPrice/100):`${money.format(minPrice/100)} – ${money.format(maxPrice/100)}`):"—"}</dd><small>KDV dâhil satış fiyatı</small></div>
          <div className={totalStock<0?"is-tehlike":totalStock===0?"is-uyari":undefined}><dt>Toplam stok</dt><dd>{totalStock.toLocaleString("tr-TR")} adet</dd><small>{backorderCount?`${backorderCount} varyantta stoksuz satış açık`:"stoksuz satış kapalı"}</small></div>
          <div><dt>Varyant</dt><dd>{variantList.length}</dd><small>beden, renk ve seçenekler</small></div>
          <div className={imageEntries.length?undefined:"is-uyari"}><dt>Görsel</dt><dd>{imageEntries.length} / 8</dd><small>{imageEntries.length?"ilk görsel kapak":"kapak görseli eksik"}</small></div>
          {/* Zamanlama YALNIZCA plan varken: boşken "—" gösteren bir sütun gürültü olurdu. */}
          {planOzeti?<div className="is-uyari"><dt>Zamanlama</dt><dd>{product.status==="draft"?"Yayına girecek":"Yayından çıkacak"}</dd><small>{planOzeti}</small></div>:null}
        </dl>
      </nav>

      <div className="product-layout">
        <section className="panel-card product-media" aria-label="Ürün görselleri">
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
          {canManage?(
            <details className="kitaplik" open={kitaplikAcik}>
              <summary className="ac-btn">Kitaplıktan görsel ekle</summary>
              {/* Arama adres satırına yazıyor: form GET, sayfa seçici
                  açık olarak yeniden geliyor. JavaScript gerekmiyor. */}
              <form className="kitaplik-ara" role="search">
                <input name="medya" defaultValue={kitaplikTerimi} placeholder="Ürün adına göre ara" aria-label="Kitaplıkta ara"/>
                <button className="ac-btn" type="submit">Ara</button>
              </form>
              {kitaplikAcik?(kitaplik.length?(
                <form action={kitapliktanGorselEkle} className="kitaplik-form">
                  <input type="hidden" name="product_id" value={product.id}/>
                  <div className="kitaplik-izgara">
                    {kitaplik.map((secenek,sira)=>(
                      <label className="kitaplik-secim" key={secenek.yol}>
                        <input type="radio" name="yol" value={secenek.yol} required defaultChecked={sira===0}/>
                        <Image src={secenek.adres} alt="" width={200} height={200}/>
                        <small>{secenek.urun}</small>
                      </label>
                    ))}
                  </div>
                  {/* Görsel KOPYALANIYOR, paylaşılmıyor: aynı nesneyi iki
                      ürün gösterseydi birinden silmek ötekini boşaltırdı. */}
                  <p className="list-hint">Seçilen görsel bu ürüne kopyalanır; kaynağı silinse de burada kalır.</p>
                  <button className="ac-btn ac-btn-primary" type="submit">Ürüne ekle</button>
                </form>
              ):<p className="list-hint">{kitaplikTerimi?"Bu aramayla eşleşen, bu üründe olmayan görsel yok.":"Kitaplıkta eklenebilecek başka görsel yok."}</p>):null}
            </details>
          ):null}
        </section>

        <section className="panel-card product-editor">
          <div className="ac-head"><div><h3>Ürün bilgileri</h3><p>İçerik, SEO ve Google Merchant verileri tek kayıtta saklanır.</p></div></div>
          {canManage?<form action={updateProduct} className="product-editor-form"><input type="hidden" name="id" value={product.id}/>
            <section className="product-editor-section">
              <div className="product-editor-heading"><div><small>TEMEL BİLGİLER</small><h4>Ürün içeriği</h4></div><span>Müşterinin göreceği alanlar</span></div>
              <div className="editor-field-grid">
                <label className="full-field">Ürün adı<input name="name" defaultValue={product.name} required maxLength={200}/></label>
                <label className="full-field">Ürün alt başlığı<input name="subtitle" defaultValue={meta.subtitle??""} maxLength={240} placeholder="Ürünün temel faydasını tek cümlede anlatın"/></label>
                <label>Marka<input name="vendor" defaultValue={meta.vendor??""} maxLength={120} placeholder="Ürünün markası"/></label>
                <label>Ürün türü<input name="type" defaultValue={meta.type??""} maxLength={120} placeholder="Örn. Kişisel bakım"/></label>
                <label>Durum<DurumSecici name="status" etiket="Durum" bicim="alan" gonder={false} deger={product.status} secenekler={[{deger:"active",etiket:"Aktif"},{deger:"draft",etiket:"Taslak"},{deger:"archived",etiket:"Arşivlenmiş"}]}/></label>
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
                <label>Rozet rengi<DurumSecici name="badge_tone" etiket="Rozet rengi" bicim="alan" gonder={false} deger={meta.badge_tone??"green"} secenekler={[{deger:"green",etiket:"ARVO Yeşili"},{deger:"navy",etiket:"Lacivert"},{deger:"gold",etiket:"Altın"},{deger:"red",etiket:"Kırmızı"}]}/></label>
                <label className="full-field">Ürün açıklaması<textarea name="description" defaultValue={product.description??""} rows={12} maxLength={20000} placeholder="Ürünün özelliklerini, faydalarını ve kullanım bilgisini detaylandırın."/></label>
              </div>
            </section>

            <SeoFields defaultTitle={meta.seo_title??product.name} defaultDescription={meta.seo_description??""} defaultSlug={product.slug??""} productName={product.name} alanAdi={magazaKoku?new URL(magazaKoku).host:null}/>

            <section className="product-editor-section">
              <div className="product-editor-heading"><div><small>EK META BİLGİLERİ</small><h4>Google Merchant ve katalog verileri</h4></div><span>İsteğe bağlı</span></div>
              <div className="editor-field-grid">
                <label className="full-field">Google ürün kategorisi<input name="google_product_category" defaultValue={meta.google_product_category??""} maxLength={240} placeholder="Örn. Sağlık ve Güzellik > Kişisel Bakım"/></label>
                <label>GTIN / Barkod<input name="gtin" defaultValue={meta.gtin??""} maxLength={32} inputMode="numeric" placeholder="EAN / UPC / ISBN"/></label>
                <label>MPN / Üretici kodu<input name="mpn" defaultValue={meta.mpn??""} maxLength={80}/></label>
                <label>Ürün durumu<DurumSecici name="condition" etiket="Ürün durumu" bicim="alan" gonder={false} deger={meta.condition??"new"} secenekler={[{deger:"new",etiket:"Yeni"},{deger:"refurbished",etiket:"Yenilenmiş"},{deger:"used",etiket:"Kullanılmış"}]}/></label>
                <label>Malzeme<input name="material" defaultValue={meta.material??""} maxLength={120}/></label>
                <label>Renk<input name="color" defaultValue={meta.color??""} maxLength={120}/></label>
                <label>Hedef cinsiyet<DurumSecici name="gender" etiket="Hedef cinsiyet" bicim="alan" gonder={false} deger={meta.gender??""} secenekler={[{deger:"",etiket:"Belirtilmemiş"},{deger:"female",etiket:"Kadın"},{deger:"male",etiket:"Erkek"},{deger:"unisex",etiket:"Unisex"}]}/></label>
                <label>Yaş grubu<DurumSecici name="age_group" etiket="Yaş grubu" bicim="alan" gonder={false} deger={meta.age_group??""} secenekler={[{deger:"",etiket:"Belirtilmemiş"},{deger:"newborn",etiket:"Yenidoğan"},{deger:"infant",etiket:"Bebek"},{deger:"toddler",etiket:"Küçük çocuk"},{deger:"kids",etiket:"Çocuk"},{deger:"adult",etiket:"Yetişkin"}]}/></label>
              </div>
            </section>
            <div className="kaydet-serit"><span>Değişiklikler ürün ve SEO bilgilerinde birlikte saklanır.</span><button className="panel-primary" type="submit">Tüm ürün bilgilerini kaydet</button></div>
          </form>:<div className="product-readonly"><h4>{meta.subtitle||product.name}</h4><div dangerouslySetInnerHTML={{__html:product.description||"Açıklama bulunmuyor."}}/>{meta.tags?<p><b>Etiketler:</b> {meta.tags}</p>:null}</div>}
        </section>
      </div>

      <section className="panel-card table list-table variant-list" data-manage={canManage?"":undefined}>
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
              {canManage?<span className="vl-indirim">İNDİRİM %</span>:null}
              <span className="vl-stock">STOK</span>
            </div>
            {variantList.map(variant=>{
              const stockTone=variant.stock<0?"bad":variant.stock===0?"warn":undefined;
              const stockLink=<Link prefetch={false} className="stock-pill" data-tone={stockTone} href={`/stok?q=${encodeURIComponent(variant.sku??"")}`} title="Stok hareketi için Stok Yönetimi’ne git">{variant.stock.toLocaleString("tr-TR")} adet</Link>;
              return canManage?(
                <form action={updateVariant} className="list-row" key={variant.id}>
                  <input type="hidden" name="product_id" value={product.id}/>
                  <input type="hidden" name="variant_id" value={variant.id}/>
                  {/* Alış fiyatı artık kâr şeridinde (satırın ikinci satırı):
                      orada kâr oranlarıyla birlikte duruyor, burada tek
                      başına dururken "bu rakam neye yarıyor" sorusunun
                      ekranda cevabı yoktu. */}
                  <span className="vl-title">{varyantGorseli(variant.image_path)}<span><b>{variant.title||"Default"}</b></span></span>
                  {/*
                    GÖRSEL ÜRÜNÜN GALERİSİNDEN SEÇİLİYOR, yüklenmiyor:
                    varyantın kendi deposu olsaydı aynı fotoğraf iki kez
                    durur, biri silinince öteki kalırdı. Galeri boşken
                    seçici de anlamsız, o yüzden ipucu gösteriliyor.
                  */}
                  <label className="vl-gorsel"><span className="vl-label">Görsel</span>
                    {imageEntries.length?(
                      /* Panelin seçicisi: satırdaki öteki alanlarla aynı
                         boy ve köşe. Sıra numarası GALERİDEKİ sıradır,
                         görseli olmayan satırlar elenmeden önce alınıyor. */
                      <DurumSecici
                        name="image_path"
                        etiket="Varyant görseli"
                        bicim="alan"
                        gonder={false}
                        deger={variant.image_path??""}
                        secenekler={[{deger:"",etiket:"Kapak"},...imageEntries.map((image,index)=>({path:image.path,sira:index+1})).filter((g):g is {path:string;sira:number}=>Boolean(g.path)).map((g)=>({deger:g.path,etiket:`Görsel ${g.sira}`}))]}
                      />
                    ):<small className="vl-gorsel-bos">Galeri boş</small>}
                  </label>
                  <label className="vl-sku"><span className="vl-label">SKU</span><input name="sku" defaultValue={variant.sku??""} required aria-label="SKU"/></label>
                  <VaryantFiyatlari fiyat={(variant.price/100).toFixed(2)} karsilastirma={variant.compare_at_price?(variant.compare_at_price/100).toFixed(2):""} alis={variant.cost_price?variant.cost_price/100:undefined}/>
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
          {canManage?<ListeBosEylem href={`${urunAdresi}?pencere=varyant`} birincil>Varyant ekle</ListeBosEylem>:null}
        </ListeBos>}
      </section>

      {pencere==="matris"?(
        /* MATRİS: dört renk × beş bedenlik bir üründe tek tek ekleme yirmi gönderim demekti. */
        <Pencere key="matris" ust={product.name} baslik="Seçeneklerden varyant üret" kapatAdresi={urunAdresi}>
            <form action={varyantMatrisi} className="variant-matrix">
              <input type="hidden" name="product_id" value={product.id}/>
              <p className="list-hint">Renk ve beden gibi seçenekleri yazın; her birleşim için bir varyant üretilir. Değerleri virgülle ayırın. Üründe zaten olan birleşimler atlanır. <b>Renk seçeneği başa alınır</b> — mağaza varyant başlığının ilk parçasını renk olarak okuyor.</p>
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
                <YeniVaryantFiyatlari fiyat={prices.length?(minPrice/100).toFixed(2):""} karsilastirma=""/>
                <label>Her varyantın başlangıç stoku<input name="stock" type="number" step="1" min="0" defaultValue="0" required className="ac-input"/></label>
              </div>
              <div className="catalog-form-actions">
                <label className="check-inline"><input name="allow_backorder" type="checkbox" defaultChecked/> Stoksuz satış</label>
                <button className="ac-btn ac-btn-primary" type="submit">Varyantları üret</button>
              </div>
            </form>
        </Pencere>
      ):null}

      {pencere==="varyant"?(
        <Pencere key="varyant" ust={product.name} baslik="Tek varyant ekle" kapatAdresi={urunAdresi} genis={false}>
            <form action={createVariant} className="variant-create-grid">
              <input type="hidden" name="product_id" value={product.id}/>
              <label>Varyant adı<input name="title" placeholder="Örn. Siyah / M" required className="ac-input"/></label>
              <label>SKU<input name="sku" required className="ac-input"/></label>
              <YeniVaryantFiyatlari fiyat="" karsilastirma=""/>
              <label>Başlangıç stoku<input name="stock" type="number" step="1" defaultValue="0" required className="ac-input"/></label>
              <div className="catalog-form-actions">
                <label className="check-inline"><input name="allow_backorder" type="checkbox" defaultChecked/> Stoksuz satış</label>
                <button className="ac-btn ac-btn-primary" type="submit">Varyant oluştur</button>
              </div>
            </form>
        </Pencere>
      ):null}
    </main>
  );
}
