"use server";

import { revalidatePath } from "next/cache";
import { bildirimliDonus } from "@/lib/panel-bildirim";
import { basariMetni, hataMetni } from "./mesajlar";
import { requireTenant } from "@/lib/tenant";
import { matrisiKur, seceneginDegerleri } from "@/lib/varyant-matrisi";
import { bosSlug, slugla } from "@/lib/slug";
import { trLocalToIso } from "@/lib/tr-time";
import { yayinPlani, type UrunDurumu } from "@/lib/yayin-plani";
import { kopyaAdi, kopyaKodlari, kopyaSlugTabani, skuAdaylari, slugSirasi } from "@/lib/urun-kopyasi";

const allowedRoles = new Set(["owner", "admin", "manager"]);

const field = (formData: FormData, name: string, maxLength: number) =>
  String(formData.get(name) ?? "").trim().slice(0, maxLength);

type EditableProductMetadata = {
  subtitle?: string;
  vendor?: string;
  type?: string;
  tags?: string;
  seo_title?: string;
  seo_description?: string;
  google_product_category?: string;
  gtin?: string;
  mpn?: string;
  condition?: string;
  material?: string;
  color?: string;
  gender?: string;
  age_group?: string;
  badge?: string;
  badge_tone?: string;
  panelden_yonetiliyor?: boolean;
  [key: string]: unknown;
};

export async function updateProduct(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const id = String(formData.get("id") ?? "");
  if (!allowedRoles.has(membership.role)) return await bildirimliDonus(`/urunler/${id}`,{hata:hataMetni("forbidden")});

  const name = field(formData, "name", 200);
  const description = field(formData, "description", 20000);
  const requestedStatus = field(formData, "status", 20);
  const istenenDurum = (["active", "draft", "archived"].includes(requestedStatus) ? requestedStatus : "draft") as UrunDurumu;
  const slug = slugla(field(formData, "slug", 180) || name);
  if (!id || !name || !slug) return await bildirimliDonus(`/urunler/${id}`,{hata:hataMetni("invalid-product")});

  /*
    ZAMANLANMIŞ YAYIN. Alanlar Türkiye saati soruyor, sütunlar an
    tutuyor; çeviri burada. Boş alan "plan yok" demek — tarayıcı boş
    alanı boş gönderir ve "kullanıcı temizledi"den ayrışmaz, o yüzden
    ekran kayıtlı zamanı alana YAZIYOR (trIsoToLocal).
  */
  const yayinAlani = field(formData, "publish_at", 40);
  const bitisAlani = field(formData, "unpublish_at", 40);
  const yayinIso = yayinAlani ? trLocalToIso(yayinAlani) : null;
  const bitisIso = bitisAlani ? trLocalToIso(bitisAlani) : null;
  if ((yayinAlani && !yayinIso) || (bitisAlani && !bitisIso)) return await bildirimliDonus(`/urunler/${id}`,{hata:hataMetni("invalid-date")});
  const plan = yayinPlani({ durum: istenenDurum, publishAt: yayinIso, unpublishAt: bitisIso, simdi: new Date().toISOString() });
  if (plan.hata) return await bildirimliDonus(`/urunler/${id}`,{hata:plan.hata});
  const status = plan.durum;

  const { data: currentProduct, error: currentProductError } = await supabase
    .from("arc_products")
    .select("metadata")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (currentProductError || !currentProduct) return await bildirimliDonus(`/urunler/${id}`,{hata:hataMetni("product-not-found")});
  const currentMetadata = (currentProduct.metadata ?? {}) as EditableProductMetadata;
  const metadata: EditableProductMetadata = {
    ...currentMetadata,
    subtitle: field(formData, "subtitle", 240),
    vendor: field(formData, "vendor", 120),
    type: field(formData, "type", 120),
    tags: field(formData, "tags", 500),
    seo_title: field(formData, "seo_title", 70),
    seo_description: field(formData, "seo_description", 180),
    google_product_category: field(formData, "google_product_category", 240),
    gtin: field(formData, "gtin", 32),
    mpn: field(formData, "mpn", 80),
    condition: field(formData, "condition", 20) || "new",
    material: field(formData, "material", 120),
    color: field(formData, "color", 120),
    gender: field(formData, "gender", 30),
    age_group: field(formData, "age_group", 30),
    badge: field(formData, "badge", 40),
    badge_tone: ["green", "navy", "gold", "red"].includes(field(formData, "badge_tone", 20)) ? field(formData, "badge_tone", 20) : "green",
    /*
      İşaretliyken Shopify CSV içe aktarımı bu ürüne HİÇ dokunmuyor
      (bkz. lib/shopify-varyant.ts: panelYonetiminde). SKU'su CSV'de
      olmayan ürünlerde gerekli: içe aktarım kimliği yeniden üretip
      elle düzeltilmiş kaydın yanına ikinci bir varyant eklerdi.
    */
    panelden_yonetiliyor: formData.get("panelden_yonetiliyor") === "on",
  };

  const { error } = await supabase
    .from("arc_products")
    .update({ name, slug, description, status, metadata, publish_at: plan.publishAt, unpublish_at: plan.unpublishAt, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organization.id);

  if (error) return await bildirimliDonus(`/urunler/${id}`,{hata:hataMetni(error.code ?? error.message)});
  revalidatePath("/");
  revalidatePath("/urunler");
  revalidatePath(`/urunler/${id}`);
  /* Plan sessizce değişmedi: nedeni söyleniyor, yoksa kullanıcı
     kaydettiği zamanlamanın durduğunu sanırdı. */
  return await bildirimliDonus(`/urunler/${id}`, plan.not ? { uyari: `${basariMetni("product")} ${plan.not}` } : { basari: basariMetni("product") });
}

export async function createVariant(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const productId=String(formData.get("product_id")??"");
  if(!allowedRoles.has(membership.role))return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("forbidden")});
  const sku=String(formData.get("sku")??"").trim().toUpperCase();
  /*
    Başlık boşsa SKU yazılıyor, "Default" değil. Aynı üründe birkaç
    "Default" görününce hangi varyantın hangisi olduğu ne ekranda ne
    veride okunabiliyordu (28.09.2026'da canlıda tam bu oldu).
  */
  const title=String(formData.get("title")??"").trim()||sku;
  const priceInput=Number(formData.get("price")??0);
  const compareAtPriceInput=Number(formData.get("compare_at_price")??0);
  const stock=Number(formData.get("stock")??0);
  const allowBackorder=formData.get("allow_backorder")==="on";
  if(!productId||!sku||!Number.isFinite(priceInput)||priceInput<0||!Number.isFinite(compareAtPriceInput)||compareAtPriceInput<0||!Number.isInteger(stock)||stock<0)return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("invalid-variant")});

  const {data:product}=await supabase.from("arc_products").select("id").eq("organization_id",organization.id).eq("id",productId).maybeSingle();
  if(!product)return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("product-not-found")});
  const {error}=await supabase.from("arc_product_variants").insert({organization_id:organization.id,product_id:productId,title,sku,price:Math.round(priceInput*100),compare_at_price:compareAtPriceInput>priceInput?Math.round(compareAtPriceInput*100):null,currency:"TRY",stock,allow_backorder:allowBackorder,attributes:{},external_id:null});
  if(error)return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni(error.code??error.message)});
  revalidatePath("/");revalidatePath("/urunler");revalidatePath(`/urunler/${productId}`);revalidatePath("/stok");
  return await bildirimliDonus(`/urunler/${productId}`,{basari:basariMetni("variant-created")});
}

export async function updateVariant(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const productId = String(formData.get("product_id") ?? "");
  const variantId = String(formData.get("variant_id") ?? "");
  if (!allowedRoles.has(membership.role)) return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("forbidden")});

  const sku = String(formData.get("sku") ?? "").trim().toUpperCase();
  const priceInput = Number(formData.get("price") ?? 0);
  const compareAtPriceInput = Number(formData.get("compare_at_price") ?? 0);
  const allowBackorder = formData.get("allow_backorder") === "on";
  if (!productId || !variantId || !sku || !Number.isFinite(priceInput) || priceInput < 0 || !Number.isFinite(compareAtPriceInput) || compareAtPriceInput < 0) return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("invalid-variant")});

  /*
    VARYANT GÖRSELİ ÜRÜNÜN GALERİSİNDEN SEÇİLİYOR. Serbest metin kabul
    edilseydi galeride olmayan bir yol yazılabilir ve vitrin kırık
    resim gösterirdi; veritabanı kısıtı bunu yakalayamıyor (CHECK alt
    sorgu içeremez), denetim burada.
  */
  const istenenGorsel = String(formData.get("image_path") ?? "").trim();
  let imagePath: string | null = null;
  if (istenenGorsel) {
    const { data: urun, error: urunHatasi } = await supabase
      .from("arc_products").select("metadata").eq("organization_id", organization.id).eq("id", productId).maybeSingle();
    if (urunHatasi || !urun) return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("product-not-found")});
    const yollar = ((urun.metadata ?? {}) as ProductMetadata).image_paths ?? [];
    if (!yollar.includes(istenenGorsel)) return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("image-not-found")});
    imagePath = istenenGorsel;
  }

  const { error } = await supabase
    .from("arc_product_variants")
    .update({ sku, price: Math.round(priceInput * 100), compare_at_price: compareAtPriceInput > priceInput ? Math.round(compareAtPriceInput * 100) : null, allow_backorder: allowBackorder, image_path: imagePath, updated_at: new Date().toISOString() })
    .eq("id", variantId)
    .eq("product_id", productId)
    .eq("organization_id", organization.id);

  if (error) return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni(error.message)});
  revalidatePath("/urunler");
  revalidatePath(`/urunler/${productId}`);
  revalidatePath("/stok");
  return await bildirimliDonus(`/urunler/${productId}`,{basari:basariMetni("variant")});
}


const imageTypes:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif","image/avif":"avif"};
const maxImageBytes=4*1024*1024;
type ProductMetadata={image_paths?:string[];images?:string[];[key:string]:unknown};

export async function uploadProductImages(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const productId=String(formData.get("product_id")??"");
  if(!allowedRoles.has(membership.role))return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("forbidden")});
  const files=formData.getAll("images").filter((value):value is File=>value instanceof File&&value.size>0);
  if(!productId||!files.length||files.length>5)return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("invalid-images")});

  const {data:product,error:productError}=await supabase.from("arc_products").select("metadata").eq("organization_id",organization.id).eq("id",productId).maybeSingle();
  if(productError||!product)return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("product-not-found")});
  const metadata=(product.metadata??{}) as ProductMetadata;
  const existing=metadata.image_paths??[];
  if(existing.length+files.length>8)return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("max-8-images")});

  const uploaded:string[]=[];
  for(const [index,file] of files.entries()){
    const extension=imageTypes[file.type.toLowerCase()];
    if(!extension||file.size>maxImageBytes){
      if(uploaded.length)await supabase.storage.from("arc-product-images").remove(uploaded);
      return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("invalid-image-file")});
    }
    const path=`${organization.id}/${productId}/manual-${Date.now()}-${index+1}.${extension}`;
    const {error}=await supabase.storage.from("arc-product-images").upload(path,await file.arrayBuffer(),{contentType:file.type,cacheControl:"31536000",upsert:false});
    if(error){
      if(uploaded.length)await supabase.storage.from("arc-product-images").remove(uploaded);
      return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni(error.message)});
    }
    uploaded.push(path);
  }

  const {error:updateError}=await supabase.from("arc_products").update({metadata:{...metadata,image_paths:[...existing,...uploaded],images:[]}}).eq("organization_id",organization.id).eq("id",productId);
  if(updateError){
    await supabase.storage.from("arc-product-images").remove(uploaded);
    return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni(updateError.message)});
  }
  revalidatePath("/urunler");revalidatePath(`/urunler/${productId}`);
  return await bildirimliDonus(`/urunler/${productId}`,{basari:basariMetni("images")});
}

export async function removeProductImage(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const productId=String(formData.get("product_id")??"");
  const path=String(formData.get("path")??"");
  if(!allowedRoles.has(membership.role))return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("forbidden")});
  const prefix=`${organization.id}/${productId}/`;
  if(!productId||!path.startsWith(prefix))return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("invalid-image-path")});

  const {data:product,error:productError}=await supabase.from("arc_products").select("metadata").eq("organization_id",organization.id).eq("id",productId).maybeSingle();
  if(productError||!product)return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("product-not-found")});
  const metadata=(product.metadata??{}) as ProductMetadata;
  const paths=metadata.image_paths??[];
  if(!paths.includes(path))return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni("image-not-found")});

  const {error:storageError}=await supabase.storage.from("arc-product-images").remove([path]);
  if(storageError)return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni(storageError.message)});
  const {error:updateError}=await supabase.from("arc_products").update({metadata:{...metadata,image_paths:paths.filter(item=>item!==path)}}).eq("organization_id",organization.id).eq("id",productId);
  if(updateError)return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni(updateError.message)});

  /*
    BU GÖRSELE BAĞLI VARYANTLAR ÇÖZÜLÜYOR. Bırakılsaydı varyant artık
    var olmayan bir nesneyi gösterirdi; vitrin fonksiyonu galeride
    olmayan yolu zaten eliyor ama kayıt ekranda "görseli var" gibi
    durur ve kimse neden çalışmadığını anlamazdı.
  */
  const {error:varyantHatasi}=await supabase.from("arc_product_variants")
    .update({image_path:null}).eq("organization_id",organization.id).eq("product_id",productId).eq("image_path",path);
  if(varyantHatasi)return await bildirimliDonus(`/urunler/${productId}`,{hata:hataMetni(varyantHatasi.message)});

  revalidatePath("/urunler");revalidatePath(`/urunler/${productId}`);
  return await bildirimliDonus(`/urunler/${productId}`,{basari:basariMetni("image-removed")});
}

/*
  VARYANT MATRİSİ — seçeneklerin çarpımından toplu ekleme.

  Varyant tek tek ekleniyordu ve her biri tam bir gezinme: dört renk ×
  beş bedenlik bir tişört yirmi gönderim demekti. Matris aynı işi tek
  gönderimde yapıyor.

  TEK INSERT. Satır satır yazmak, ortada düşen bir kayıttan sonra
  ürünü yarım bırakırdı; tek çağrı ya hepsini yazıyor ya hiçbirini.
  Çakışmalar zaten önceden çözülüyor (lib/varyant-matrisi.ts), yani
  23505 buraya gelmiyor — gelirse gerçekten beklenmedik bir şey var.
*/
export async function varyantMatrisi(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const productId = String(formData.get("product_id") ?? "");
  const donus = `/urunler/${productId}`;
  if (!allowedRoles.has(membership.role)) return await bildirimliDonus(donus, { hata: hataMetni("forbidden") });

  const priceInput = Number(formData.get("price") ?? 0);
  const compareInput = Number(formData.get("compare_at_price") ?? 0);
  const stock = Number(formData.get("stock") ?? 0);
  const allowBackorder = formData.get("allow_backorder") === "on";
  if (!productId || !Number.isFinite(priceInput) || priceInput <= 0 || !Number.isFinite(compareInput) || compareInput < 0 || !Number.isInteger(stock) || stock < 0) {
    return await bildirimliDonus(donus, { hata: hataMetni("invalid-variant") });
  }

  const { data: product, error: productError } = await supabase
    .from("arc_products").select("id,name,slug").eq("organization_id", organization.id).eq("id", productId).maybeSingle();
  if (productError || !product) return await bildirimliDonus(donus, { hata: hataMetni("product-not-found") });

  /*
    Var olan varyantlar çakışma denetimi için okunuyor. Hata
    YUTULMUYOR: boş liste saymak, üründe zaten duran bir birleşimi
    ikinci kez eklemeye çalışmak demekti.
  */
  const { data: mevcut, error: mevcutHatasi } = await supabase
    .from("arc_product_variants").select("sku,title").eq("organization_id", organization.id).eq("product_id", productId);
  if (mevcutHatasi) return await bildirimliDonus(donus, { hata: hataMetni(mevcutHatasi.message) });
  const mevcutVaryantlar = mevcut ?? [];

  const secenekler = [1, 2, 3].map((sira) => ({
    ad: field(formData, `secenek_ad_${sira}`, 40),
    degerler: seceneginDegerleri(field(formData, `secenek_deger_${sira}`, 600)),
  }));

  /* Önek boşsa üründen türüyor: kullanıcı kod düşünmek zorunda kalmasın. */
  const onek = field(formData, "sku_oneki", 16) || product.slug || product.name;
  const { satirlar, atlanan, hata, not } = matrisiKur(secenekler, {
    skuOneki: onek,
    mevcutSkular: mevcutVaryantlar.map((varyant) => String(varyant.sku ?? "")),
    mevcutBasliklar: mevcutVaryantlar.map((varyant) => String(varyant.title ?? "")),
  });
  if (hata) return await bildirimliDonus(donus, { hata });

  const compareAt = compareInput > priceInput ? Math.round(compareInput * 100) : null;
  const { error } = await supabase.from("arc_product_variants").insert(
    satirlar.map((satir) => ({
      organization_id: organization.id,
      product_id: productId,
      title: satir.baslik,
      sku: satir.sku,
      price: Math.round(priceInput * 100),
      compare_at_price: compareAt,
      currency: "TRY",
      stock,
      allow_backorder: allowBackorder,
      attributes: satir.nitelikler,
      external_id: null,
    })),
  );
  if (error) return await bildirimliDonus(donus, { hata: hataMetni(error.code ?? error.message) });

  revalidatePath("/");
  revalidatePath("/urunler");
  revalidatePath(donus);
  revalidatePath("/stok");
  /* Atlananlar SAYILIYOR: "12 eklendi" deyip 3'ünü sessizce düşürmek,
     kullanıcıya eksik bir kataloğu tam gibi gösterirdi. Seçenek sırası
     değiştiyse o da söyleniyor (uyarı tonuyla): sessiz bir yeniden
     sıralama, SKU'ların neden o biçimde çıktığını açıklamaz. */
  const ozet = `${satirlar.length} varyant eklendi${atlanan ? `; ${atlanan} birleşim üründe zaten vardı` : ""}.`;
  return await bildirimliDonus(donus, not ? { uyari: `${ozet} ${not}` } : { basari: ozet });
}

/*
  ÜRÜN KOPYALAMA.

  Benzer ürün eklemenin en kısa yolu var olanı çoğaltmak: on beş alanı
  (marka, tür, SEO, Merchant bilgileri) yeniden doldurmak yerine
  değişen ikisini düzeltmek.

  KOPYA HER ZAMAN TASLAK. Kaynak yayındaysa kopyası da yayına girerdi
  ve mağazada bir anda ikinci, yarım düzenlenmiş bir ürün belirirdi.

  SKU'LAR YENİDEN ÜRETİLİYOR. SKU salon genelinde kimlik gibi
  kullanılıyor (stok/actions.ts .eq("sku", …).maybeSingle(), fiyat
  aktarımı yazmayı .eq("sku", …) ile yapıyor), yani kaynağın kodlarını
  taşımak kopyayı oluşturur oluşturmaz stok ekranını bozardı.

  GÖRSELLER DEPODA ÇOĞALTILIYOR, yol paylaşılmıyor. Aynı nesneyi iki
  ürün gösterseydi birinden görseli silmek ötekinin galerisini de
  boşaltırdı (removeProductImage nesneyi depodan siliyor).
*/
export async function urunuKopyala(formData: FormData) {
  const { supabase, user, organization, membership } = await requireTenant();
  const kaynakId = String(formData.get("product_id") ?? "");
  const donus = `/urunler/${kaynakId}`;
  if (!allowedRoles.has(membership.role)) return await bildirimliDonus(donus, { hata: hataMetni("forbidden") });
  if (!kaynakId) return await bildirimliDonus("/urunler", { hata: hataMetni("product-not-found") });

  const [{ data: kaynak, error: kaynakHatasi }, { data: kaynakVaryantlar, error: varyantHatasi }] = await Promise.all([
    supabase.from("arc_products").select("id,name,slug,description,metadata,source,supplier,supplier_product_code,tax_rate").eq("organization_id", organization.id).eq("id", kaynakId).maybeSingle(),
    supabase.from("arc_product_variants").select("sku,title,price,compare_at_price,currency,stock,allow_backorder,attributes,cost_price,supplier,supplier_sku,image_path").eq("organization_id", organization.id).eq("product_id", kaynakId),
  ]);
  if (kaynakHatasi || !kaynak) return await bildirimliDonus(donus, { hata: hataMetni("product-not-found") });
  if (varyantHatasi) return await bildirimliDonus(donus, { hata: hataMetni(varyantHatasi.message) });
  const varyantlar = kaynakVaryantlar ?? [];

  /* Boş adres: kopyanın adresi kaynağınkinden türüyor, "…-kopya-2" gibi. */
  const slugTabani = kopyaSlugTabani(kaynak.name, kaynak.slug);
  const { data: benzerSluglar, error: slugHatasi } = await supabase
    .from("arc_products").select("slug").eq("organization_id", organization.id).ilike("slug", `${slugTabani}%`).limit(300);
  /* Hata YUTULMUYOR: boş liste saymak "…-kopya" adresini serbest
     sanıp tekil kısıta çarpmak demekti (organization_id, slug). */
  if (slugHatasi) return await bildirimliDonus(donus, { hata: hataMetni(slugHatasi.message) });
  const alinmisSluglar = (benzerSluglar ?? []).map((satir) => String(satir.slug ?? ""));
  const yeniSlug = bosSlug(slugTabani, alinmisSluglar);
  if (!yeniSlug) return await bildirimliDonus(donus, { hata: hataMetni("copy-slug-full") });
  const yeniAd = kopyaAdi(kaynak.name, slugSirasi(slugTabani, yeniSlug) || 1);

  /*
    Kod adayları TEK sorguda denetleniyor: varyant başına bir sorgu,
    yirmi varyantlı üründe yirmi tur demekti.
  */
  const tumAdaylar = [...new Set(varyantlar.flatMap((varyant) => skuAdaylari(String(varyant.sku ?? ""))))];
  let alinmisKodlar: string[] = [];
  if (tumAdaylar.length) {
    const { data: doluKodlar, error: kodHatasi } = await supabase
      .from("arc_product_variants").select("sku").eq("organization_id", organization.id).in("sku", tumAdaylar);
    if (kodHatasi) return await bildirimliDonus(donus, { hata: hataMetni(kodHatasi.message) });
    alinmisKodlar = (doluKodlar ?? []).map((satir) => String(satir.sku ?? ""));
  }
  const { esleme, cozulemeyen } = kopyaKodlari(varyantlar.map((varyant) => String(varyant.sku ?? "")), alinmisKodlar);
  if (cozulemeyen.length) return await bildirimliDonus(donus, { hata: hataMetni("copy-sku-full") });

  const meta = (kaynak.metadata ?? {}) as ProductMetadata;
  /* Görsel yolları kopyada YENİ: depodaki nesneler aşağıda çoğaltılıyor. */
  const { data: yeniUrun, error: urunHatasi } = await supabase.from("arc_products").insert({
    organization_id: organization.id,
    name: yeniAd,
    slug: yeniSlug,
    description: kaynak.description,
    status: "draft",
    source: kaynak.source,
    supplier: kaynak.supplier,
    supplier_product_code: kaynak.supplier_product_code,
    tax_rate: kaynak.tax_rate,
    metadata: { ...meta, image_paths: [] },
    /* Plan KOPYALANMIYOR: kaynağın kampanya saati geldiğinde yarım
       düzenlenmiş kopya da mağazaya çıkardı. */
    publish_at: null,
    unpublish_at: null,
    created_by: user.id,
  }).select("id").single();
  if (urunHatasi || !yeniUrun) return await bildirimliDonus(donus, { hata: hataMetni(urunHatasi?.code ?? urunHatasi?.message ?? "product-create") });

  /*
    GÖRSELLER VARYANTLARDAN ÖNCE. Varyantın image_path'i kopyanın
    yeni yoluna çevrilmek zorunda; sıra ters olsaydı çeviri için
    ikinci bir güncelleme turu gerekirdi.

    Depodaki nesneler kopyanın klasörüne çoğaltılıyor.
    Tedarikçi CDN adresleri (http…) olduğu gibi taşınıyor, onlar bizim
    deponuzda değil. Çoğaltma düşerse ürün KALIYOR ve uyarı veriliyor:
    on beş alanı doldurulmuş bir kopyayı görsel yüzünden silmek,
    kullanıcıyı işin başına döndürürdü.
  */
  const kaynakYollari = (meta.image_paths ?? []).slice(0, 8);
  const yeniYollar: string[] = [];
  /* Eski yol → yeni yol: varyant görselleri aşağıda bununla çevriliyor. */
  const gorselEslemesi = new Map<string, string>();
  let gorselUyarisi = "";
  for (const [sira, yol] of kaynakYollari.entries()) {
    if (yol.startsWith("http")) { yeniYollar.push(yol); gorselEslemesi.set(yol, yol); continue; }
    const uzanti = yol.split(".").pop() ?? "jpg";
    const hedef = `${organization.id}/${yeniUrun.id}/kopya-${Date.now()}-${sira + 1}.${uzanti}`;
    const { error } = await supabase.storage.from("arc-product-images").copy(yol, hedef);
    if (error) { gorselUyarisi = "Görseller kopyalanamadı; ürüne elle yükleyin."; break; }
    yeniYollar.push(hedef);
    gorselEslemesi.set(yol, hedef);
  }
  if (yeniYollar.length) {
    const { error } = await supabase.from("arc_products").update({ metadata: { ...meta, image_paths: yeniYollar, images: [] } }).eq("organization_id", organization.id).eq("id", yeniUrun.id);
    if (error) gorselUyarisi = "Görseller kopyalandı ama ürüne bağlanamadı; elle yükleyin.";
  }

  if (varyantlar.length) {
    const { error } = await supabase.from("arc_product_variants").insert(
      varyantlar.map((varyant) => ({
        organization_id: organization.id,
        product_id: yeniUrun.id,
        title: varyant.title,
        sku: esleme.get(String(varyant.sku ?? "").trim().toUpperCase()) ?? String(varyant.sku ?? ""),
        /* Görsel yolu KOPYANINKİNE çevriliyor: kaynağın yolunu
           taşımak, kaynaktan o görsel silindiğinde kopyayı da
           kırardı ve iki ürün aynı nesneyi gösterirdi. */
        image_path: varyant.image_path ? (gorselEslemesi.get(varyant.image_path) ?? null) : null,
        price: varyant.price,
        compare_at_price: varyant.compare_at_price,
        currency: varyant.currency ?? "TRY",
        /* Stok TAŞINMIYOR: depoda ikinci bir ürün belirdi diye mal
           çoğalmıyor. Kopya sıfırdan sayılıyor. */
        stock: 0,
        allow_backorder: varyant.allow_backorder,
        attributes: varyant.attributes ?? {},
        cost_price: varyant.cost_price,
        supplier: varyant.supplier,
        supplier_sku: varyant.supplier_sku,
        external_id: null,
      })),
    );
    /*
      Varyantsız bir ürün satılamaz (fiyat ve stok varyantta). Yarım
      kopya bırakmaktansa ürün satırı geri alınıyor — çoğaltılmış
      görsel nesneleri de, yoksa depoda kimsenin göremediği dosyalar
      birikirdi.
    */
    if (error) {
      const cop = yeniYollar.filter((yol) => !yol.startsWith("http"));
      if (cop.length) await supabase.storage.from("arc-product-images").remove(cop);
      await supabase.from("arc_products").delete().eq("organization_id", organization.id).eq("id", yeniUrun.id);
      return await bildirimliDonus(donus, { hata: hataMetni(error.code ?? error.message) });
    }
  }

  revalidatePath("/");
  revalidatePath("/urunler");
  revalidatePath("/stok");
  const sonuc = `“${yeniAd}” taslak olarak oluşturuldu${varyantlar.length ? `; ${varyantlar.length} varyant yeni SKU ile kopyalandı` : ""}.`;
  /* Kopyanın kendi sayfasına gidiliyor: kopyalamanın ardından gelen
     iş her zaman onu düzenlemek. */
  return await bildirimliDonus(`/urunler/${yeniUrun.id}`, gorselUyarisi ? { uyari: `${sonuc} ${gorselUyarisi}` } : { basari: sonuc });
}
