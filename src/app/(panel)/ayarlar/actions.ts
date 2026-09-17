"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { ensureVercelProjectDomain,verifyVercelProjectDomain } from "@/lib/vercel-domains";
import { encryptSecret,paymentCredentialsConfigured } from "@/lib/payment-credentials";

const roles=new Set(["owner","admin","manager"]);
const imageTypes:Record<string,string>={"image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/x-icon":"ico","image/vnd.microsoft.icon":"ico"};
const domainPattern=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const subdomainPattern=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/* Alan adı başka bir mağazada kullanılıyorsa veritabanı 23505 döndürür
   (20260917140000: tekil indeksler + sütunlar arası tetikleyici). Kontrol
   uygulamada yapılamıyor: mağaza sahibi başka mağazanın ayar satırını RLS
   yüzünden okuyamaz, yani "bu alan adı başkasında mı" sorusunu soramaz.
   Hata mesajı kimin kullandığını söylemez; mağazalar birbirinin varlığını
   öğrenmemeli. */
function domainErrorCode(error:{code?:string|null;message?:string}){
  if(error.code==="23505")return "domain-in-use";
  return error.code??error.message??"unknown";
}

export async function updateStoreSettings(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))redirect("/ayarlar?error=forbidden");
  const storeName=String(formData.get("store_name")??"").trim();
  const currency=String(formData.get("currency")??"TRY").trim().toUpperCase();
  const locale=String(formData.get("locale")??"tr-TR").trim();
  const threshold=Number(formData.get("low_stock_threshold")??5);
  const primaryColor=String(formData.get("primary_color")??"#002045").trim();
  const accentColor=String(formData.get("accent_color")??"#6f9548").trim();
  if(!storeName||!/^[A-Z]{3}$/.test(currency)||!Number.isInteger(threshold)||threshold<0||threshold>10000||!/^#[0-9A-Fa-f]{6}$/.test(primaryColor)||!/^#[0-9A-Fa-f]{6}$/.test(accentColor))redirect("/ayarlar?error=invalid-settings");

  const {error}=await supabase.from("arc_store_settings").upsert({organization_id:organization.id,store_name:storeName,currency,locale,low_stock_threshold:threshold,primary_color:primaryColor,accent_color:accentColor,updated_at:new Date().toISOString()},{onConflict:"organization_id"});
  if(error)redirect(`/ayarlar?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/ayarlar");revalidatePath("/stok");revalidatePath("/magaza");
  redirect("/ayarlar?saved=general");
}

/*
  Mağazaya özgü satış ayarları. Sütunlar 20260916200000 ve 20260916220000'de
  eklenmişti ama panelde HİÇBİR form onları yazmıyordu: değerler yalnızca
  sipariş hesabında okunuyordu. Sonuç, her yeni mağazanın ArvoCulture
  tarifesiyle satması — 120 TL kargo, 2.000 TL ücretsiz kargo eşiği, her
  havalede %3 indirim ve 'AC' sipariş öneki.

  Kargo ve eşik veritabanında KURUŞ; form ₺ alıyor.
*/
export async function updateSalesSettings(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))redirect("/ayarlar?error=forbidden");

  const prefix=String(formData.get("order_prefix")??"").trim().toUpperCase();
  const shippingFee=Number(formData.get("shipping_fee")??0);
  const freeThreshold=Number(formData.get("free_shipping_threshold")??0);
  const transferDiscount=Number(formData.get("bank_transfer_discount_percent")??0);

  /* Veritabanı kısıtıyla aynı: yalnızca harf, 1-6 karakter. */
  if(!/^[A-Z]{1,6}$/.test(prefix))redirect("/ayarlar?error=invalid-order-prefix");
  if(!Number.isFinite(shippingFee)||shippingFee<0||shippingFee>100000)redirect("/ayarlar?error=invalid-shipping-fee");
  if(!Number.isFinite(freeThreshold)||freeThreshold<0||freeThreshold>1000000)redirect("/ayarlar?error=invalid-free-threshold");
  if(!Number.isFinite(transferDiscount)||transferDiscount<0||transferDiscount>100)redirect("/ayarlar?error=invalid-transfer-discount");

  const {error}=await supabase.from("arc_store_settings").upsert({
    organization_id:organization.id,
    order_prefix:prefix,
    shipping_fee:Math.round(shippingFee*100),
    free_shipping_threshold:Math.round(freeThreshold*100),
    bank_transfer_discount_percent:transferDiscount,
    updated_at:new Date().toISOString(),
  },{onConflict:"organization_id"});
  /* Önek mağaza başına tekil (20260917160000); çakışmada 23505 döner. */
  if(error)redirect(`/ayarlar?error=${encodeURIComponent(error.code==="23505"?"order-prefix-in-use":error.message)}`);

  revalidatePath("/ayarlar");revalidatePath("/magaza");
  redirect("/ayarlar?saved=sales");
}

export async function updatePaymentSettings(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))redirect("/ayarlar?error=forbidden");
  const bankTransferEnabled=formData.get("bank_transfer_enabled")==="on";
  const paytrEnabled=formData.get("paytr_enabled")==="on";
  const bankName=String(formData.get("bank_name")??"").trim();
  const bankAccountHolder=String(formData.get("bank_account_holder")??"").trim();
  const bankIban=String(formData.get("bank_iban")??"").replace(/\s+/g,"").toUpperCase();
  const bankTransferInstructions=String(formData.get("bank_transfer_instructions")??"").trim();
  const paytrMerchantId=String(formData.get("paytr_merchant_id")??"").trim();
  const paytrTestMode=formData.get("paytr_test_mode")==="on";
  const paytrNoInstallment=formData.get("paytr_no_installment")==="on";
  const paytrMaxInstallment=Number(formData.get("paytr_max_installment")??0);
  // Anahtarlar yalnızca yazılır, geri gösterilmez: boş bırakılırsa kayıtlı olan korunur.
  const paytrMerchantKey=String(formData.get("paytr_merchant_key")??"").trim();
  const paytrMerchantSalt=String(formData.get("paytr_merchant_salt")??"").trim();
  const emailFrom=String(formData.get("email_from")??"").trim();
  const emailReplyTo=String(formData.get("email_reply_to")??"").trim();
  if(bankTransferEnabled&&(!bankName||!bankAccountHolder||!/^TR\d{24}$/.test(bankIban)))redirect("/ayarlar?error=invalid-bank-transfer");
  if(paytrEnabled&&!paytrMerchantId)redirect("/ayarlar?error=paytr-merchant-required");
  if(!Number.isInteger(paytrMaxInstallment)||paytrMaxInstallment<0||paytrMaxInstallment>12)redirect("/ayarlar?error=invalid-installment");
  /*
    Mağaza kendi PayTR hesabıyla tahsil eder. Anahtar ve salt şifrelenerek
    saklanır (AES-256-GCM); şifreleme anahtarı yoksa düz yazmak yerine hata
    veririz. Biri girilip diğeri boş bırakılırsa yarım yapılandırma oluşur,
    o yüzden ikisi birlikte istenir.
  */
  if((paytrMerchantKey?1:0)!==(paytrMerchantSalt?1:0))redirect("/ayarlar?error=paytr-key-pair-required");
  /*
    Gönderen adresi doğrudan e-posta başlığına giriyor. Satır sonu ya da
    fazladan alan enjekte edilmesini engellemek için biçim sınırlı tutuluyor:
    ya düz adres ya da "Ad <adres>" kalıbı.
  */
  const adres="[^@\\s<>,;]+@[^@\\s<>,;]+\\.[^@\\s<>,;]{2,}";
  const gonderenGecerli=!emailFrom||new RegExp(`^(${adres}|[^<>\\r\\n]{1,60}<${adres}>)$`).test(emailFrom);
  const yanitGecerli=!emailReplyTo||new RegExp(`^${adres}$`).test(emailReplyTo);
  if(!gonderenGecerli||!yanitGecerli)redirect("/ayarlar?error=invalid-email-sender");
  let paytrSecrets:{paytr_merchant_key_enc:string;paytr_merchant_salt_enc:string}|null=null;
  if(paytrMerchantKey&&paytrMerchantSalt){
    if(!paymentCredentialsConfigured())redirect("/ayarlar?error=paytr-encryption-missing");
    paytrSecrets={paytr_merchant_key_enc:encryptSecret(paytrMerchantKey),paytr_merchant_salt_enc:encryptSecret(paytrMerchantSalt)};
  }
  /* upsert, update DEĞİL. Hiçbir migration varsayılan bir arc_store_settings
     satırı oluşturmuyor; yeni bir mağaza doğrudan Ödeme sekmesine giderse
     update 0 satır günceller, error null döner ve ekranda "kaydedildi"
     çıkar — PayTR anahtarları hiçbir yere yazılmamış olur. */
  const {error}=await supabase.from("arc_store_settings").upsert({
    organization_id:organization.id,
    bank_transfer_enabled:bankTransferEnabled,bank_name:bankName||null,bank_account_holder:bankAccountHolder||null,
    bank_iban:bankIban||null,bank_transfer_instructions:bankTransferInstructions||null,
    paytr_enabled:paytrEnabled,paytr_test_mode:paytrTestMode,paytr_merchant_id:paytrMerchantId||null,
    paytr_no_installment:paytrNoInstallment,paytr_max_installment:paytrMaxInstallment,
    ...(paytrSecrets??{}),
    email_from:emailFrom||null,email_reply_to:emailReplyTo||null,
    updated_at:new Date().toISOString()
  },{onConflict:"organization_id"});
  if(error)redirect(`/ayarlar?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/ayarlar");redirect("/ayarlar?saved=payments");
}

export async function uploadBrandAsset(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))redirect("/ayarlar?error=forbidden");
  const kind=String(formData.get("kind")??"")==="favicon"?"favicon":"logo";
  const file=formData.get("file");
  if(!(file instanceof File)||!file.size)redirect("/ayarlar?error=file-required");
  const extension=imageTypes[file.type.toLowerCase()];
  const limit=kind==="favicon"?1024*1024:4*1024*1024;
  if(!extension||file.size>limit)redirect("/ayarlar?error=invalid-brand-file");

  const column=kind==="favicon"?"favicon_path":"logo_path";
  const {data:current}=await supabase.from("arc_store_settings").select(`${column},store_name`).eq("organization_id",organization.id).maybeSingle();
  if(!current)redirect("/ayarlar?error=settings-required");
  const oldPath=String((current as Record<string,unknown>)[column]??"");
  const path=`${organization.id}/commerce/${kind}-${Date.now()}.${extension}`;
  const {error:uploadError}=await supabase.storage.from("organization-assets").upload(path,await file.arrayBuffer(),{contentType:file.type,cacheControl:"31536000",upsert:false});
  if(uploadError)redirect(`/ayarlar?error=${encodeURIComponent(uploadError.message)}`);
  const {error:updateError}=await supabase.from("arc_store_settings").update({[column]:path,updated_at:new Date().toISOString()}).eq("organization_id",organization.id);
  if(updateError){await supabase.storage.from("organization-assets").remove([path]);redirect(`/ayarlar?error=${encodeURIComponent(updateError.message)}`);}
  /* Eski dosya yalnızca mağazanın kendi klasöründeyse silinir (kaldırma işlemindeki kuralla aynı). */
  if(oldPath&&oldPath.startsWith(`${organization.id}/`))await supabase.storage.from("organization-assets").remove([oldPath]);
  revalidatePath("/ayarlar");redirect(`/ayarlar?saved=${kind}`);
}

export async function removeBrandAsset(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))redirect("/ayarlar?error=forbidden");
  const kind=String(formData.get("kind")??"")==="favicon"?"favicon":"logo";
  const column=kind==="favicon"?"favicon_path":"logo_path";
  const {data:current}=await supabase.from("arc_store_settings").select(column).eq("organization_id",organization.id).maybeSingle();
  const path=String((current as Record<string,unknown>|null)?.[column]??"");
  if(path&&!path.startsWith(`${organization.id}/`))redirect("/ayarlar?error=invalid-asset");
  const {error}=await supabase.from("arc_store_settings").update({[column]:null,updated_at:new Date().toISOString()}).eq("organization_id",organization.id);
  if(error)redirect(`/ayarlar?error=${encodeURIComponent(error.message)}`);
  if(path)await supabase.storage.from("organization-assets").remove([path]);
  revalidatePath("/ayarlar");redirect(`/ayarlar?saved=${kind}-removed`);
}

export async function updatePanelDomainSettings(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))redirect("/ayarlar?error=forbidden");
  const panelDomain=String(formData.get("panel_custom_domain")??"").trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/.*$/,"").replace(/\.$/,"");
  if(!panelDomain||!domainPattern.test(panelDomain))redirect("/ayarlar?error=invalid-panel-domain");
  const {data:settings}=await supabase.from("arc_store_settings").select("custom_domain").eq("organization_id",organization.id).maybeSingle();
  if(panelDomain===settings?.custom_domain)redirect("/ayarlar?error=panel-storefront-domain-conflict");
  let provision;
  try{provision=await ensureVercelProjectDomain(panelDomain,"panel");}
  catch(error){redirect(`/ayarlar?error=${encodeURIComponent(error instanceof Error?error.message:"Vercel alan adı eklenemedi")}`);}
  const {error}=await supabase.from("arc_store_settings").upsert({
    organization_id:organization.id,
    panel_custom_domain:panelDomain,panel_domain_status:provision.active?"active":"pending_dns",
    panel_domain_verification_token:`arvo-verification=${randomUUID().replace(/-/g,"")}`,
    panel_domain_verified_at:provision.active?new Date().toISOString():null,updated_at:new Date().toISOString()
  },{onConflict:"organization_id"});
  if(error)redirect(`/ayarlar?error=${encodeURIComponent(domainErrorCode(error))}`);
  revalidatePath("/ayarlar");redirect("/ayarlar?saved=panel-domain");
}

export async function updateStorefrontDomainSettings(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))redirect("/ayarlar?error=forbidden");
  const customDomain=String(formData.get("storefront_custom_domain")??"").trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/.*$/,"").replace(/\.$/,"");
  const platformSubdomain=String(formData.get("storefront_subdomain")??"").trim().toLowerCase();
  if(customDomain&&!domainPattern.test(customDomain))redirect("/ayarlar?error=invalid-domain");
  if(platformSubdomain&&!subdomainPattern.test(platformSubdomain))redirect("/ayarlar?error=invalid-subdomain");
  if(!customDomain&&!platformSubdomain)redirect("/ayarlar?error=domain-required");

  const token=`arvo-verification=${randomUUID().replace(/-/g,"")}`;
  const {data:settings}=await supabase.from("arc_store_settings").select("panel_custom_domain").eq("organization_id",organization.id).maybeSingle();
  if(customDomain&&customDomain===settings?.panel_custom_domain)redirect("/ayarlar?error=panel-storefront-domain-conflict");
  let provision=null;
  if(customDomain){
    try{provision=await ensureVercelProjectDomain(customDomain,"storefront");}
    catch(error){redirect(`/ayarlar?error=${encodeURIComponent(error instanceof Error?error.message:"Vercel alan adı eklenemedi")}`);}
  }
  const storefrontUrl=customDomain?`https://${customDomain}`:`https://${platformSubdomain}.shop.arvo-os.com`;
  const {error}=await supabase.from("arc_store_settings").upsert({
    organization_id:organization.id,
    custom_domain:customDomain||null,platform_subdomain:platformSubdomain||null,
    domain_status:customDomain?(provision?.active?"active":"pending_dns"):"active",domain_verification_token:customDomain?token:null,
    domain_verified_at:customDomain&&provision?.active?new Date().toISOString():customDomain?null:new Date().toISOString(),storefront_url:storefrontUrl,updated_at:new Date().toISOString()
  },{onConflict:"organization_id"});
  if(error)redirect(`/ayarlar?error=${encodeURIComponent(domainErrorCode(error))}`);
  revalidatePath("/ayarlar");revalidatePath("/magaza");redirect("/ayarlar?saved=domain");
}

export async function verifyPanelDomain(){
  const {supabase,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))redirect("/ayarlar?error=forbidden");
  const {data}=await supabase.from("arc_store_settings").select("panel_custom_domain").eq("organization_id",organization.id).maybeSingle();
  if(!data?.panel_custom_domain)redirect("/ayarlar?error=panel-domain-required");
  let result;
  try{result=await verifyVercelProjectDomain(data.panel_custom_domain,"panel");}
  catch(error){redirect(`/ayarlar?error=${encodeURIComponent(error instanceof Error?error.message:"Vercel doğrulaması başarısız")}`);}
  await supabase.from("arc_store_settings").update({panel_domain_status:result.active?"active":"pending_dns",panel_domain_verified_at:result.active?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq("organization_id",organization.id);
  revalidatePath("/ayarlar");redirect(result.active?"/ayarlar?saved=panel-domain-verified":"/ayarlar?error=panel-dns-not-ready");
}

export async function verifyStorefrontDomain(){
  const {supabase,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))redirect("/ayarlar?error=forbidden");
  const {data}=await supabase.from("arc_store_settings").select("custom_domain").eq("organization_id",organization.id).maybeSingle();
  if(!data?.custom_domain)redirect("/ayarlar?error=domain-required");
  let result;
  try{result=await verifyVercelProjectDomain(data.custom_domain,"storefront");}
  catch(error){redirect(`/ayarlar?error=${encodeURIComponent(error instanceof Error?error.message:"Vercel doğrulaması başarısız")}`);}
  await supabase.from("arc_store_settings").update({domain_status:result.active?"active":"pending_dns",domain_verified_at:result.active?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq("organization_id",organization.id);
  revalidatePath("/ayarlar");revalidatePath("/magaza");redirect(result.active?"/ayarlar?saved=storefront-domain-verified":"/ayarlar?error=storefront-dns-not-ready");
}
