"use server";

import { formTutari } from "@/lib/money";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { bildirimliDonus } from "@/lib/panel-bildirim";
import { basariMetni, hataMetni } from "./mesajlar";
import { requireTenant } from "@/lib/tenant";
import { altAlanAdresi } from "@/lib/magaza-adresi";
import { ensureVercelProjectDomain,verifyVercelProjectDomain } from "@/lib/vercel-domains";
import { encryptSecret,paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { disVitriniDogrula } from "@/lib/dis-vitrin-dogrulama";
import { jetonlariUnut } from "@/lib/tryoto/istemci";
import { whatsappNumarasiniKaldir,whatsappNumarasiniKaydet,whatsappNumarasiniSina } from "@/lib/whatsapp-hesap";
import { SABLON_ANAHTARLARI,taninmayanDegiskenler } from "@/lib/eposta-sablonu";
import { BASLIK_SINIRI,GOVDE_SINIRI,SAYFA_ANAHTARLARI } from "@/lib/magaza-sayfasi";

const roles=new Set(["owner","admin","manager"]);
/*
  Ödemenin gittiği hesap: IBAN, banka, PayTR mağaza numarası ve anahtarları.
  Önceden manager da değiştirebiliyordu; kendi PayTR anahtarlarını ya da
  IBAN'ını yazan biri kartla ve havaleyle gelen bütün tahsilatı kendi
  hesabına yönlendirebilirdi. ArvoOS'ta finans yazma yetkisi de owner/admin.
  Veritabanında aynı kural: private.arc_guard_payment_settings.
*/
const PAYMENT_ROLES=new Set(["owner","admin"]);
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

/*
  arc_store_settings.store_name NOT NULL ve VARSAYILANI YOK; tablodaki öbür
  zorunlu sütunların hepsinde varsayılan var. Ayar satırı hiç oluşmamış bir
  mağazada upsert INSERT'e düşüyor ve "null value in column store_name" ile
  hata veriyor. Canlıda tryOTO anahtarı kaydedilirken çıktı (27.09.2026)
  ama hata ödeme, satış ve alan adı formlarının hepsinde vardı: yeni bir
  mağaza hangi ayar sekmesine ÖNCE girerse orada patlıyordu. Yalnızca
  "Mağaza bilgileri" formu store_name gönderdiği için fark edilmemişti.

  Mevcut satırda ad varsa DOKUNULMUYOR: kullanıcının koyduğu mağaza adını
  başka bir sekmenin kaydı ezmemeli.
*/
async function magazaAdiTabani(
  supabase:Awaited<ReturnType<typeof requireTenant>>["supabase"],
  organizationId:string,
  organizationName:string,
){
  const {data}=await supabase.from("arc_store_settings").select("store_name").eq("organization_id",organizationId).maybeSingle();
  /*
    store_name HER ZAMAN gönderiliyor — satır zaten varken bile.

    "Satır varsa dokunmayalım" denendi ve ÇALIŞMADI (canlıda 27.09.2026).
    Sebebi Postgres'in davranışı: INSERT … ON CONFLICT DO UPDATE önce
    INSERT'i değerlendiriyor ve NOT NULL ihlali, çakışma kontrolünden ÖNCE
    patlıyor. Yani satırın var olması upsert'i kurtarmıyor; gövdede
    store_name yoksa her seferinde "null value in column store_name"
    geliyor. Eksik satırları dolduran iki veri migration'ı bu yüzden
    sorunu çözmedi (ikisi de "No rows returned" dedi: satırlar zaten
    vardı).

    Mevcut ad aynen geri yazılıyor, yani korunuyor. Kurum adı da boşsa
    sabit bir ad kullanılıyor; kullanıcı Mağaza bilgileri sekmesinden
    kendi adını girince üzerine geçiyor.
  */
  return {store_name:data?.store_name?.trim()||organizationName?.trim()||"Mağaza"};
}

export async function updateStoreSettings(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))return await bildirimliDonus("/ayarlar",{hata:hataMetni("forbidden")});
  const storeName=String(formData.get("store_name")??"").trim();
  const currency=String(formData.get("currency")??"TRY").trim().toUpperCase();
  const locale=String(formData.get("locale")??"tr-TR").trim();
  const threshold=Number(formData.get("low_stock_threshold")??5);
  const primaryColor=String(formData.get("primary_color")??"#002045").trim();
  const accentColor=String(formData.get("accent_color")??"#6f9548").trim();
  if(!storeName||!/^[A-Z]{3}$/.test(currency)||!Number.isInteger(threshold)||threshold<0||threshold>10000||!/^#[0-9A-Fa-f]{6}$/.test(primaryColor)||!/^#[0-9A-Fa-f]{6}$/.test(accentColor))return await bildirimliDonus("/ayarlar",{hata:hataMetni("invalid-settings")});

  const {error}=await supabase.from("arc_store_settings").upsert({organization_id:organization.id,store_name:storeName,currency,locale,low_stock_threshold:threshold,primary_color:primaryColor,accent_color:accentColor,updated_at:new Date().toISOString()},{onConflict:"organization_id"});
  if(error)return await bildirimliDonus("/ayarlar",{hata:hataMetni(error.message)});
  revalidatePath("/ayarlar");revalidatePath("/stok");revalidatePath("/magaza");
  return await bildirimliDonus("/ayarlar",{basari:basariMetni("general")});
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
  if(!roles.has(membership.role))return await bildirimliDonus("/ayarlar",{hata:hataMetni("forbidden")});

  const prefix=String(formData.get("order_prefix")??"").trim().toUpperCase();
  /* Tutarlar Türkçe yazımla (lib/money → formTutari): "1.500" bin beş yüz, 1,5 değil. */
  const shippingFee=formTutari(formData.get("shipping_fee"));
  const freeThreshold=formTutari(formData.get("free_shipping_threshold"));
  const transferDiscount=Number(formData.get("bank_transfer_discount_percent")??0);

  /* Veritabanı kısıtıyla aynı: yalnızca harf, 1-6 karakter. */
  if(!/^[A-Z]{1,6}$/.test(prefix))return await bildirimliDonus("/ayarlar",{hata:hataMetni("invalid-order-prefix")});
  if(shippingFee===null||shippingFee>100000_00)return await bildirimliDonus("/ayarlar",{hata:hataMetni("invalid-shipping-fee")});
  if(freeThreshold===null||freeThreshold>1000000_00)return await bildirimliDonus("/ayarlar",{hata:hataMetni("invalid-free-threshold")});
  if(!Number.isFinite(transferDiscount)||transferDiscount<0||transferDiscount>100)return await bildirimliDonus("/ayarlar",{hata:hataMetni("invalid-transfer-discount")});

  const {error}=await supabase.from("arc_store_settings").upsert({
    organization_id:organization.id,
    ...(await magazaAdiTabani(supabase,organization.id,organization.name)),
    order_prefix:prefix,
    shipping_fee:shippingFee,
    free_shipping_threshold:freeThreshold,
    bank_transfer_discount_percent:transferDiscount,
    /* Tarifeyi kiracı SEÇTİ. Sütunlar NOT NULL ve varsayılanları
       ArvoCulture'ın tarifesi olduğu için "seçildi mi" başka türlü
       anlaşılamıyor; rehber bu damgaya bakıyor (20260929081212). */
    sales_configured_at:new Date().toISOString(),
    updated_at:new Date().toISOString(),
  },{onConflict:"organization_id"});
  /* Önek mağaza başına tekil (20260917160000); çakışmada 23505 döner. */
  if(error)return await bildirimliDonus("/ayarlar",{hata:hataMetni(error.code==="23505"?"order-prefix-in-use":error.message)});

  revalidatePath("/ayarlar");revalidatePath("/magaza");
  return await bildirimliDonus("/ayarlar",{basari:basariMetni("sales")});
}

export async function updatePaymentSettings(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  if(!PAYMENT_ROLES.has(membership.role))return await bildirimliDonus("/ayarlar",{hata:hataMetni("forbidden")});
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
  /*
    GARANTİ SANAL POS. Tami'nin yerini aldı (07.10.2026). Varsayılan
    hâlâ PayTR: anahtarı girilmemiş bir mağazayı Garanti'ye almak kartla
    ödemeyi durdururdu. Geçiş mağaza başına ve bilinçli.
  */
  const garantiEnabled=formData.get("garanti_enabled")==="on";
  const garantiTestMode=formData.get("garanti_test_mode")==="on";
  const garantiYariGuvenli=formData.get("garanti_yari_guvenli_kabul")==="on";
  const garantiIsyeri=String(formData.get("garanti_isyeri_no")??"").trim();
  const garantiTerminal=String(formData.get("garanti_terminal_no")??"").trim();
  const garantiSurum=String(formData.get("garanti_api_surumu")??"v512")==="v0.01"?"v0.01":"v512";
  const garantiDuzey=String(formData.get("garanti_guvenlik_duzeyi")??"").trim()||"3D_PAY_HOSTING";
  // Sırlar yalnızca yazılır, geri gösterilmez: boş bırakılırsa kayıtlı olan korunur.
  const garantiProvizyon=String(formData.get("garanti_provizyon_sifresi")??"").trim();
  const garantiAnahtar=String(formData.get("garanti_magaza_anahtari")??"").trim();
  const garantiIade=String(formData.get("garanti_iade_sifresi")??"").trim();
  const saglayiciTercihi=String(formData.get("odeme_saglayicisi")??"paytr")==="garanti"?"garanti":"paytr";
  const emailFrom=String(formData.get("email_from")??"").trim();
  const emailReplyTo=String(formData.get("email_reply_to")??"").trim();
  if(bankTransferEnabled&&(!bankName||!bankAccountHolder||!/^TR\d{24}$/.test(bankIban)))return await bildirimliDonus("/ayarlar",{hata:hataMetni("invalid-bank-transfer")});
  if(paytrEnabled&&!paytrMerchantId)return await bildirimliDonus("/ayarlar",{hata:hataMetni("paytr-merchant-required")});
  if(!Number.isInteger(paytrMaxInstallment)||paytrMaxInstallment<0||paytrMaxInstallment>12)return await bildirimliDonus("/ayarlar",{hata:hataMetni("invalid-installment")});
  /*
    Mağaza kendi PayTR hesabıyla tahsil eder. Anahtar ve salt şifrelenerek
    saklanır (AES-256-GCM); şifreleme anahtarı yoksa düz yazmak yerine hata
    veririz. Biri girilip diğeri boş bırakılırsa yarım yapılandırma oluşur,
    o yüzden ikisi birlikte istenir.
  */
  if((paytrMerchantKey?1:0)!==(paytrMerchantSalt?1:0))return await bildirimliDonus("/ayarlar",{hata:hataMetni("paytr-key-pair-required")});
  /*
    Garanti'de iki açık alan (işyeri, terminal) ve iki zorunlu sır var
    (PROVAUT şifresi, 3D anahtarı). Sırlar ikisi birlikte istenir: biri
    girilip öteki boş bırakılınca yarım yapılandırma oluşur ve ödeme
    isteği imza hatasıyla döner.

    PROVRFN (iade) şifresi bu denetime GİRMİYOR: iade ayrı bir yetki ve
    zorunlu tutmak, iadeyi henüz tanımlamamış mağazanın tahsilatını da
    engellerdi.
  */
  if(garantiEnabled&&(!garantiIsyeri||!garantiTerminal))return await bildirimliDonus("/ayarlar",{hata:hataMetni("garanti-merchant-required")});
  if((garantiProvizyon?1:0)!==(garantiAnahtar?1:0))return await bildirimliDonus("/ayarlar",{hata:hataMetni("garanti-key-pair-required")});
  /*
    Gönderen adresi doğrudan e-posta başlığına giriyor. Satır sonu ya da
    fazladan alan enjekte edilmesini engellemek için biçim sınırlı tutuluyor:
    ya düz adres ya da "Ad <adres>" kalıbı.
  */
  const adres="[^@\\s<>,;]+@[^@\\s<>,;]+\\.[^@\\s<>,;]{2,}";
  const gonderenGecerli=!emailFrom||new RegExp(`^(${adres}|[^<>\\r\\n]{1,60}<${adres}>)$`).test(emailFrom);
  const yanitGecerli=!emailReplyTo||new RegExp(`^${adres}$`).test(emailReplyTo);
  if(!gonderenGecerli||!yanitGecerli)return await bildirimliDonus("/ayarlar",{hata:hataMetni("invalid-email-sender")});
  let paytrSecrets:{paytr_merchant_key_enc:string;paytr_merchant_salt_enc:string}|null=null;
  if(paytrMerchantKey&&paytrMerchantSalt){
    if(!paymentCredentialsConfigured())return await bildirimliDonus("/ayarlar",{hata:hataMetni("paytr-encryption-missing")});
    paytrSecrets={paytr_merchant_key_enc:encryptSecret(paytrMerchantKey),paytr_merchant_salt_enc:encryptSecret(paytrMerchantSalt)};
  }
  let garantiSecrets:Record<string,string>|null=null;
  if(garantiProvizyon&&garantiAnahtar){
    if(!paymentCredentialsConfigured())return await bildirimliDonus("/ayarlar",{hata:hataMetni("paytr-encryption-missing")});
    garantiSecrets={garanti_provizyon_sifresi_enc:encryptSecret(garantiProvizyon),garanti_magaza_anahtari_enc:encryptSecret(garantiAnahtar)};
  }
  /* İade şifresi tek başına da güncellenebiliyor: tahsilat kurulduktan
     sonra iade yetkisi ayrıca tanımlanıyor ve o gün diğer iki sırrın
     yeniden yazılmasını istemek, kullanıcıyı onları bir yerden bulmaya
     zorlardı. */
  let garantiIadeSecret:Record<string,string>|null=null;
  if(garantiIade){
    if(!paymentCredentialsConfigured())return await bildirimliDonus("/ayarlar",{hata:hataMetni("paytr-encryption-missing")});
    garantiIadeSecret={garanti_iade_sifresi_enc:encryptSecret(garantiIade)};
  }
  /* upsert, update DEĞİL. Hiçbir migration varsayılan bir arc_store_settings
     satırı oluşturmuyor; yeni bir mağaza doğrudan Ödeme sekmesine giderse
     update 0 satır günceller, error null döner ve ekranda "kaydedildi"
     çıkar — PayTR anahtarları hiçbir yere yazılmamış olur. */
  const {error}=await supabase.from("arc_store_settings").upsert({
    organization_id:organization.id,
    ...(await magazaAdiTabani(supabase,organization.id,organization.name)),
    bank_transfer_enabled:bankTransferEnabled,bank_name:bankName||null,bank_account_holder:bankAccountHolder||null,
    bank_iban:bankIban||null,bank_transfer_instructions:bankTransferInstructions||null,
    paytr_enabled:paytrEnabled,paytr_test_mode:paytrTestMode,paytr_merchant_id:paytrMerchantId||null,
    paytr_no_installment:paytrNoInstallment,paytr_max_installment:paytrMaxInstallment,
    ...(paytrSecrets??{}),
    garanti_enabled:garantiEnabled,garanti_test_mode:garantiTestMode,
    garanti_isyeri_no:garantiIsyeri||null,garanti_terminal_no:garantiTerminal||null,
    garanti_api_surumu:garantiSurum,garanti_guvenlik_duzeyi:garantiDuzey,
    garanti_yari_guvenli_kabul:garantiYariGuvenli,
    ...(garantiSecrets??{}),...(garantiIadeSecret??{}),
    odeme_saglayicisi:saglayiciTercihi,
    email_from:emailFrom||null,email_reply_to:emailReplyTo||null,
    updated_at:new Date().toISOString()
  },{onConflict:"organization_id"});
  if(error)return await bildirimliDonus("/ayarlar",{hata:hataMetni(error.message)});
  revalidatePath("/ayarlar");return await bildirimliDonus("/ayarlar",{basari:basariMetni("payments")});
}

/*
  MARKA GÖRSELİ DEĞİŞİNCE VİTRİN DE GÖRSÜN (18.10.2026).

  Vitrin logoyu `arc_store_themes` (mode='published') içindeki
  `config.logo_url`'den okuyor. Burası ise `arc_store_settings`'teki
  `logo_path`'i yazıyor ve ESKİ DOSYAYI SİLİYOR. İkisi arasında bağ
  yoktu: yayındaki tema yalnızca Tema → Yayınla ile yeniden
  kuruluyordu.

  Sonuç canlıda görüldü: ArvoCulture Ayarlar'dan logosunu
  değiştirdi, eski dosya silindi, vitrin eski adresi göstermeye
  devam etti ve her sayfanın başında 404 veren bir görsel kaldı.
  Tarayıcı önbelleği olan biz fark etmedik; yeni ziyaretçi kırık
  simge görüyordu.

  Logosunu değiştiren HER kiracı bunu yaşardı. Bu yüzden görsel
  değişikliği yayındaki temaya da yansıtılıyor.

  Yalnızca bu iki alan yazılıyor: taslakta bekleyen başka
  değişiklikler YAYINA ÇIKMAMALI — kiracı onları henüz
  yayınlamamış olabilir.

  Yayında tema satırı yoksa sessizce geçiliyor: mağaza henüz
  temasını yayınlamamış demektir ve ilk yayında değer zaten
  ayarlardan kuruluyor (tema/actions → publishDraft).
*/
async function markaGorselleriniYayinaYansit(
  supabase: Awaited<ReturnType<typeof requireTenant>>["supabase"],
  organizationId: string,
) {
  const [{ data: settings }, { data: published }] = await Promise.all([
    supabase
      .from("arc_store_settings")
      .select("logo_path,favicon_path")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("arc_store_themes")
      .select("config")
      .eq("organization_id", organizationId)
      .eq("mode", "published")
      .maybeSingle(),
  ]);

  if (!published) return;

  const adres = (yol: string | null | undefined) =>
    yol
      ? supabase.storage.from("organization-assets").getPublicUrl(yol).data
          .publicUrl
      : undefined;

  const config = {
    ...((published.config ?? {}) as Record<string, unknown>),
    logo_url: adres(settings?.logo_path),
    favicon_url: adres(settings?.favicon_path),
  };

  const { error } = await supabase
    .from("arc_store_themes")
    .update({ config, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("mode", "published");

  /* Yazılamazsa akış durdurulmuyor: dosya yüklendi ve ayar
     kaydedildi, yayına yansımaması ikincil bir kusur. Ama sessiz
     de kalmıyor. */
  if (error) {
    console.error("Marka görseli yayına yansıtılamadı:", error.message);
  }
}

export async function uploadBrandAsset(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))return await bildirimliDonus("/ayarlar",{hata:hataMetni("forbidden")});
  const kind=String(formData.get("kind")??"")==="favicon"?"favicon":"logo";
  const file=formData.get("file");
  if(!(file instanceof File)||!file.size)return await bildirimliDonus("/ayarlar",{hata:hataMetni("file-required")});
  const extension=imageTypes[file.type.toLowerCase()];
  const limit=kind==="favicon"?1024*1024:4*1024*1024;
  if(!extension||file.size>limit)return await bildirimliDonus("/ayarlar",{hata:hataMetni("invalid-brand-file")});

  const column=kind==="favicon"?"favicon_path":"logo_path";
  const {data:current}=await supabase.from("arc_store_settings").select(`${column},store_name`).eq("organization_id",organization.id).maybeSingle();
  if(!current)return await bildirimliDonus("/ayarlar",{hata:hataMetni("settings-required")});
  const oldPath=String((current as Record<string,unknown>)[column]??"");
  const path=`${organization.id}/commerce/${kind}-${Date.now()}.${extension}`;
  const {error:uploadError}=await supabase.storage.from("organization-assets").upload(path,await file.arrayBuffer(),{contentType:file.type,cacheControl:"31536000",upsert:false});
  if(uploadError)return await bildirimliDonus("/ayarlar",{hata:hataMetni(uploadError.message)});
  const {error:updateError}=await supabase.from("arc_store_settings").update({[column]:path,updated_at:new Date().toISOString()}).eq("organization_id",organization.id);
  if(updateError){await supabase.storage.from("organization-assets").remove([path]);return await bildirimliDonus("/ayarlar",{hata:hataMetni(updateError.message)});}
  /* Eski dosya yalnızca mağazanın kendi klasöründeyse silinir (kaldırma işlemindeki kuralla aynı). */
  if(oldPath&&oldPath.startsWith(`${organization.id}/`))await supabase.storage.from("organization-assets").remove([oldPath]);
  await markaGorselleriniYayinaYansit(supabase,organization.id);
  revalidatePath("/ayarlar");return await bildirimliDonus("/ayarlar",{basari:basariMetni(kind)});
}

export async function removeBrandAsset(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))return await bildirimliDonus("/ayarlar",{hata:hataMetni("forbidden")});
  const kind=String(formData.get("kind")??"")==="favicon"?"favicon":"logo";
  const column=kind==="favicon"?"favicon_path":"logo_path";
  const {data:current}=await supabase.from("arc_store_settings").select(column).eq("organization_id",organization.id).maybeSingle();
  const path=String((current as Record<string,unknown>|null)?.[column]??"");
  if(path&&!path.startsWith(`${organization.id}/`))return await bildirimliDonus("/ayarlar",{hata:hataMetni("invalid-asset")});
  const {error}=await supabase.from("arc_store_settings").update({[column]:null,updated_at:new Date().toISOString()}).eq("organization_id",organization.id);
  if(error)return await bildirimliDonus("/ayarlar",{hata:hataMetni(error.message)});
  if(path)await supabase.storage.from("organization-assets").remove([path]);
  /* Kaldırma da yayına yansıyor: yoksa vitrin silinmiş dosyayı
     göstermeye devam eder — yükleme hatasının aynısı. */
  await markaGorselleriniYayinaYansit(supabase,organization.id);
  revalidatePath("/ayarlar");return await bildirimliDonus("/ayarlar",{basari:basariMetni(`${kind}-removed`)});
}

export async function updatePanelDomainSettings(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))return await bildirimliDonus("/ayarlar",{hata:hataMetni("forbidden")});
  const panelDomain=String(formData.get("panel_custom_domain")??"").trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/.*$/,"").replace(/\.$/,"");
  if(!panelDomain||!domainPattern.test(panelDomain))return await bildirimliDonus("/ayarlar",{hata:hataMetni("invalid-panel-domain")});
  const {data:settings}=await supabase.from("arc_store_settings").select("custom_domain").eq("organization_id",organization.id).maybeSingle();
  if(panelDomain===settings?.custom_domain)return await bildirimliDonus("/ayarlar",{hata:hataMetni("panel-storefront-domain-conflict")});
  let provision;
  try{provision=await ensureVercelProjectDomain(panelDomain,"panel");}
  catch(error){return await bildirimliDonus("/ayarlar",{hata:hataMetni(error instanceof Error?error.message:"Vercel alan adı eklenemedi")});}
  const {error}=await supabase.from("arc_store_settings").upsert({
    organization_id:organization.id,
    ...(await magazaAdiTabani(supabase,organization.id,organization.name)),
    panel_custom_domain:panelDomain,panel_domain_status:provision.active?"active":"pending_dns",
    panel_domain_verification_token:`arvo-verification=${randomUUID().replace(/-/g,"")}`,
    panel_domain_verified_at:provision.active?new Date().toISOString():null,updated_at:new Date().toISOString()
  },{onConflict:"organization_id"});
  if(error)return await bildirimliDonus("/ayarlar",{hata:hataMetni(domainErrorCode(error))});
  revalidatePath("/ayarlar");return await bildirimliDonus("/ayarlar",{basari:basariMetni("panel-domain")});
}

export async function updateStorefrontDomainSettings(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))return await bildirimliDonus("/ayarlar",{hata:hataMetni("forbidden")});
  const customDomain=String(formData.get("storefront_custom_domain")??"").trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/.*$/,"").replace(/\.$/,"");
  const platformSubdomain=String(formData.get("storefront_subdomain")??"").trim().toLowerCase();
  if(customDomain&&!domainPattern.test(customDomain))return await bildirimliDonus("/ayarlar",{hata:hataMetni("invalid-domain")});
  if(platformSubdomain&&!subdomainPattern.test(platformSubdomain))return await bildirimliDonus("/ayarlar",{hata:hataMetni("invalid-subdomain")});
  if(!customDomain&&!platformSubdomain)return await bildirimliDonus("/ayarlar",{hata:hataMetni("domain-required")});

  const token=`arvo-verification=${randomUUID().replace(/-/g,"")}`;
  /*
    VİTRİN KİPİ. "external" = müşteri sitesini kendi yapıyor; alan
    adı bizim Vercel projemize EKLENMEZ (DNS zaten başka yere
    yöneliyor, kayıt sonsuza kadar "DNS bekleniyor"da kalırdı).
    Kayıt yine gerekli: mağazayı Origin'den çözen her şey ve CORS
    ona bakıyor.
  */
  const disVitrin=String(formData.get("storefront_mode")??"hosted")==="external";
  const {data:settings}=await supabase.from("arc_store_settings").select("panel_custom_domain,custom_domain,domain_status,domain_verified_at,domain_verification_token").eq("organization_id",organization.id).maybeSingle();
  if(customDomain&&customDomain===settings?.panel_custom_domain)return await bildirimliDonus("/ayarlar",{hata:hataMetni("panel-storefront-domain-conflict")});

  /*
    DEĞİŞMEMİŞ VE ZATEN AKTİF ALAN ADI YENİDEN SAĞLANMIYOR.

    Form her kaydedildiğinde Vercel'e gidiliyordu. Alan adı yıllardır
    aynıysa bu çağrının kazandırdığı bir şey yok, ama kaybettirdiği
    var: Vercel tarafındaki bir arıza (yanlış proje kimliği, kapsamı
    değişmiş anahtar) ALAKASIZ bir ayarı — alt alan adını —
    kaydetmeyi de engelliyordu. 17.10.2026'da tam bu oldu: kimlikler
    Hobby hesabındaki ölü projeyi gösteriyordu ve kullanıcı yalnızca
    platform alt alan adı eklemek istiyordu.

    Alan adı DEĞİŞTİYSE ya da henüz aktif değilse yine sağlanıyor;
    asıl iş orada.
  */
  const alanAdiAyni=customDomain&&customDomain===settings?.custom_domain;
  const zatenAktif=settings?.domain_status==="active"&&Boolean(settings?.domain_verified_at);
  let provision=null;
  if(customDomain&&!disVitrin&&!(alanAdiAyni&&zatenAktif)){
    try{provision=await ensureVercelProjectDomain(customDomain,"storefront");}
    catch(error){return await bildirimliDonus("/ayarlar",{hata:hataMetni(error instanceof Error?error.message:"Vercel alan adı eklenemedi")});}
  }

  /*
    PLATFORM ALT ALAN ADI DA VERCEL'E EKLENİYOR.

    DNS tarafı joker bir CNAME ile çözülüyor (*.shop.arvo-os.com →
    Vercel), yani yeni mağaza için DNS'e dokunmak gerekmiyor. Ama
    SERTİFİKA joker kayıtla gelmiyor: Vercel joker sertifikayı
    yalnızca kendi ad sunucularını kullanan alan adlarına veriyor
    (dns_pretest_cns_not_using_vercel_ns_error) ve arvo-os.com'un
    DNS'i dışarıda — taşımak ise bütün bölgeyi, posta kayıtları
    dahil, yeniden kurmak demek.

    Çözüm: adres joker kayıtla ÇÖZÜLÜYOR, sertifika ise somut alt
    alan adı projeye eklendiği için çıkıyor. Müşteri açısından fark
    yok; DNS'e yine dokunulmuyor.

    Hata burada akışı DURDURMUYOR: alt alan adı kaydı yine yazılsın,
    mağaza panelden yönetilebilsin. Sertifika çıkmadıysa adres
    açılmaz ama bunun sebebi ayrı bir sorun ve ayarın kendisini
    kaydetmemek onu çözmüyor.
  */
  let altAlanHatasi:string|null=null;
  if(platformSubdomain&&!disVitrin){
    try{await ensureVercelProjectDomain(altAlanAdresi(platformSubdomain),"storefront");}
    catch(error){
      altAlanHatasi=error instanceof Error?error.message:"Alt alan adı Vercel'e eklenemedi";
      console.error("[alan-adi] alt alan adı eklenemedi:",altAlanHatasi);
    }
  }
  const storefrontUrl=customDomain?`https://${customDomain}`:`https://${altAlanAdresi(platformSubdomain)}`;
  const {error}=await supabase.from("arc_store_settings").upsert({
    organization_id:organization.id,
    ...(await magazaAdiTabani(supabase,organization.id,organization.name)),
    custom_domain:customDomain||null,platform_subdomain:platformSubdomain||null,
    storefront_mode:disVitrin?"external":"hosted",
    /* Sağlama atlandıysa (alan adı aynı ve aktif) mevcut durum korunur;
       yoksa kaydetme işlemi aktif bir alan adını "DNS bekleniyor"a
       düşürür ve kullanıcı var olmayan bir sorunu çözmeye çalışırdı. */
    /*
      Dış vitrinde doğrulama TXT kaydıyla ve AYRI bir adımda
      yapılıyor (verifyStorefrontDomain): kaydeder kaydetmez
      "doğrulandı" demek, sahibi olmadığı bir alan adını iddia eden
      bir kiracıya o adresten gelen siparişleri yazmak olurdu.
    */
    domain_status:customDomain
      ?(disVitrin?(alanAdiAyni&&zatenAktif?"active":"pending_dns"):alanAdiAyni&&zatenAktif?"active":provision?.active?"active":"pending_dns")
      :"active",
    domain_verification_token:customDomain?(alanAdiAyni&&settings?.domain_verification_token?settings.domain_verification_token:token):null,
    domain_verified_at:customDomain
      ?(alanAdiAyni&&zatenAktif?settings?.domain_verified_at:(!disVitrin&&provision?.active)?new Date().toISOString():null)
      :new Date().toISOString(),
    storefront_url:storefrontUrl,updated_at:new Date().toISOString()
  },{onConflict:"organization_id"});
  if(error)return await bildirimliDonus("/ayarlar",{hata:hataMetni(domainErrorCode(error))});
  revalidatePath("/ayarlar");revalidatePath("/magaza");
  return await bildirimliDonus("/ayarlar",
    altAlanHatasi?{uyari:`Ayarlar kaydedildi ama alt alan adı yayına alınamadı: ${altAlanHatasi}`}:{basari:basariMetni("domain")});
}

export async function verifyPanelDomain(){
  const {supabase,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))return await bildirimliDonus("/ayarlar",{hata:hataMetni("forbidden")});
  const {data}=await supabase.from("arc_store_settings").select("panel_custom_domain").eq("organization_id",organization.id).maybeSingle();
  if(!data?.panel_custom_domain)return await bildirimliDonus("/ayarlar",{hata:hataMetni("panel-domain-required")});
  let result;
  try{result=await verifyVercelProjectDomain(data.panel_custom_domain,"panel");}
  catch(error){return await bildirimliDonus("/ayarlar",{hata:hataMetni(error instanceof Error?error.message:"Vercel doğrulaması başarısız")});}
  await supabase.from("arc_store_settings").update({panel_domain_status:result.active?"active":"pending_dns",panel_domain_verified_at:result.active?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq("organization_id",organization.id);
  revalidatePath("/ayarlar");return await bildirimliDonus("/ayarlar", result.active
    ? {basari:basariMetni("panel-domain-verified")}
    /* DNS beklemesi HATA DEĞİL: kırmızı göstermek kullanıcıyı ayarları
       düzeltmeye, yani yanlış yere yönlendiriyordu. */
    : {uyari:hataMetni("panel-dns-not-ready")});
}

export async function verifyStorefrontDomain(){
  const {supabase,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))return await bildirimliDonus("/ayarlar",{hata:hataMetni("forbidden")});
  const {data}=await supabase.from("arc_store_settings").select("custom_domain,storefront_mode,domain_verification_token").eq("organization_id",organization.id).maybeSingle();
  if(!data?.custom_domain)return await bildirimliDonus("/ayarlar",{hata:hataMetni("domain-required")});

  /*
    KİP DOĞRULAMANIN YOLUNU DEĞİŞTİRİYOR. Vitrin bizdeyse soru
    "alan adı bize mi yöneliyor" ve yanıtı Vercel veriyor. Vitrin
    müşterideyse DNS zaten başka yere yöneliyor; sorulacak soru
    "bu alan adı gerçekten senin mi" ve yanıtı TXT kaydı veriyor.
  */
  let result:{active:boolean;sebep?:string};
  if(data.storefront_mode==="external"){
    const sonuc=await disVitriniDogrula(data.custom_domain,String(data.domain_verification_token??""));
    result=sonuc.dogrulandi?{active:true}:{active:false,sebep:sonuc.sebep};
  }else{
    try{result=await verifyVercelProjectDomain(data.custom_domain,"storefront");}
    catch(error){return await bildirimliDonus("/ayarlar",{hata:hataMetni(error instanceof Error?error.message:"Vercel doğrulaması başarısız")});}
  }
  await supabase.from("arc_store_settings").update({domain_status:result.active?"active":"pending_dns",domain_verified_at:result.active?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq("organization_id",organization.id);
  revalidatePath("/ayarlar");revalidatePath("/magaza");return await bildirimliDonus("/ayarlar", result.active
    ? {basari:basariMetni("storefront-domain-verified")}
    /* DNS beklemesi hata değil; sebebi varsa olduğu gibi gösteriliyor. */
    : {uyari:result.sebep??hataMetni("storefront-dns-not-ready")});
}

/*
  KARGO ENTEGRASYONU (tryOTO).

  Yetki ödeme ayarlarıyla AYNI (owner/admin): gönderi oluşturmak OTO
  cüzdanındaki bakiyeyi harcıyor, yani bu anahtar para harcatan bir yetki.
  Manager'ın erişmesi, ödeme anahtarlarına erişmesinden farksız olurdu.

  Yenileme anahtarı PayTR anahtarlarıyla aynı yöntemle şifreleniyor ve
  hiçbir ekranda geri gösterilmiyor; boş bırakılırsa kayıtlı olan korunuyor.
*/
export async function updateShippingIntegration(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  if(!PAYMENT_ROLES.has(membership.role))return await bildirimliDonus("/ayarlar",{hata:hataMetni("forbidden")});
  const etkin=formData.get("tryoto_enabled")==="on";
  const testModu=formData.get("tryoto_test_mode")==="on";
  const gondericiKodu=String(formData.get("tryoto_pickup_location_code")??"").trim();
  /* Çıkış adresi: konum kodu yoksa etiket bununla üretiliyor. Boş alan
     null yazılıyor, boş metin değil — gondericiCoz her ikisini de eksik
     sayıyor ama null, "hiç girilmedi"yi ekranda da doğru gösteriyor. */
  const adresAlani=(ad:string)=>String(formData.get(ad)??"").trim()||null;
  const yenilemeAnahtari=String(formData.get("tryoto_refresh_token")??"").trim();

  /* Kayıtlı anahtar var mı: "etkin ama anahtarsız" bir yapılandırma
     kaydedilirse gönderi ekranı her denemede yetki hatası verir ve sebebi
     ayar ekranında görünmez. */
  const {data:mevcut}=await supabase.from("arc_store_settings")
    .select("tryoto_refresh_token_enc").eq("organization_id",organization.id).maybeSingle();
  const anahtarVar=Boolean(mevcut?.tryoto_refresh_token_enc)||Boolean(yenilemeAnahtari);
  if(etkin&&!anahtarVar)return await bildirimliDonus("/ayarlar",{hata:hataMetni("tryoto-key-required")});

  let sifreli:{tryoto_refresh_token_enc:string}|null=null;
  if(yenilemeAnahtari){
    if(!paymentCredentialsConfigured())return await bildirimliDonus("/ayarlar",{hata:hataMetni("paytr-encryption-missing")});
    sifreli={tryoto_refresh_token_enc:encryptSecret(yenilemeAnahtari)};
  }

  /* upsert, update DEĞİL: hiçbir migration varsayılan bir ayar satırı
     oluşturmuyor ve yeni mağazada update 0 satır günceller, hata dönmez —
     ekranda "kaydedildi" yazar, anahtar hiçbir yere yazılmamış olur. */
  const {error}=await supabase.from("arc_store_settings").upsert({
    organization_id:organization.id,
    ...(await magazaAdiTabani(supabase,organization.id,organization.name)),
    tryoto_enabled:etkin,tryoto_test_mode:testModu,
    tryoto_pickup_location_code:gondericiKodu||null,
    legal_name:adresAlani("legal_name"),
    contact_phone:adresAlani("contact_phone"),
    contact_email:adresAlani("contact_email"),
    address_line:adresAlani("address_line"),
    address_district:adresAlani("address_district"),
    address_city:adresAlani("address_city"),
    address_country:adresAlani("address_country"),
    ...(sifreli??{}),
    updated_at:new Date().toISOString()
  },{onConflict:"organization_id"});
  if(error)return await bildirimliDonus("/ayarlar",{hata:hataMetni(error.message)});

  /* Anahtar değiştiyse bellekteki erişim jetonu artık eski hesaba ait:
     unutulmazsa sonraki gönderi yanlış hesapta açılırdı. */
  if(yenilemeAnahtari)jetonlariUnut(organization.id);
  revalidatePath("/ayarlar");return await bildirimliDonus("/ayarlar",{basari:basariMetni("shipping")});
}

/*
  WHATSAPP NUMARASI (Entegrasyonlar bölümü).

  Kayıt ArvoOS'ta; buradan köprüye yazılıyor (lib/whatsapp-hesap).
  Yetki iki kademeli: burada rol denetleniyor, ArvoOS'ta da aynı
  kişinin o kurumda gerçekten yetkili olduğu yeniden denetleniyor —
  ürünün sözüne güvenmek, ürün sırrı sızdığında herkesin numarasını
  değiştirebilmesi demekti.

  ERİŞİM ANAHTARI HİÇ KAYDEDİLMİYOR BURADA: forma yazılan değer
  doğrudan köprüye gidiyor, ArvoARC'ın veritabanına ya da günlüğüne
  düşmüyor.
*/
export async function saveWhatsappNumber(formData:FormData){
  const {organization,membership,user}=await requireTenant();
  if(!PAYMENT_ROLES.has(membership.role))return await bildirimliDonus("/ayarlar?bolum=entegrasyon",{hata:hataMetni("forbidden")});

  const wabaId=String(formData.get("waba_id")??"").replace(/\s/g,"");
  const phoneNumberId=String(formData.get("phone_number_id")??"").replace(/\s/g,"");
  const accessToken=String(formData.get("access_token")??"").trim();
  if(!wabaId||!phoneNumberId||!accessToken){
    return await bildirimliDonus("/ayarlar?bolum=entegrasyon",{hata:"WABA kimliği, numara kimliği ve erişim anahtarının üçü de gerekli."});
  }

  const sonuc=await whatsappNumarasiniKaydet(organization.id,user.id,{wabaId,phoneNumberId,accessToken});
  revalidatePath("/ayarlar");
  return await bildirimliDonus("/ayarlar?bolum=entegrasyon",
    sonuc.tamam?{basari:"WhatsApp numarası bağlandı."}:{hata:sonuc.hata});
}

export async function verifyWhatsappNumber(){
  const {organization,membership,user}=await requireTenant();
  if(!PAYMENT_ROLES.has(membership.role))return await bildirimliDonus("/ayarlar?bolum=entegrasyon",{hata:hataMetni("forbidden")});
  const sonuc=await whatsappNumarasiniSina(organization.id,user.id);
  revalidatePath("/ayarlar");
  if(!sonuc.tamam)return await bildirimliDonus("/ayarlar?bolum=entegrasyon",{hata:sonuc.hata});
  /* Doğrulanamadı da bir yanıt: durum kaydedildi, sebebi gösteriliyor. */
  return await bildirimliDonus("/ayarlar?bolum=entegrasyon",
    sonuc.dogrulandi?{basari:"Numara Meta tarafından doğrulandı."}:{hata:`Numara doğrulanamadı: ${sonuc.ayrinti??"sebep bildirilmedi"}`});
}

export async function removeWhatsappNumber(){
  const {organization,membership,user}=await requireTenant();
  if(!PAYMENT_ROLES.has(membership.role))return await bildirimliDonus("/ayarlar?bolum=entegrasyon",{hata:hataMetni("forbidden")});
  const sonuc=await whatsappNumarasiniKaldir(organization.id,user.id);
  revalidatePath("/ayarlar");
  return await bildirimliDonus("/ayarlar?bolum=entegrasyon",
    sonuc.tamam?{basari:"WhatsApp bağlantısı kaldırıldı."}:{hata:sonuc.hata});
}

/*
  E-POSTA ŞABLONLARI.

  Kiracı METNİ düzenler, HTML'i düzenlemez: zarf (logo, renk, buton,
  altbilgi) kodda kalıyor ve buradan gelen metin kaçırılarak basılıyor.
  Serbest HTML bir yazım hatasıyla postayı bozar ve müşteriye giden bir
  yüzeye kod enjekte etme kapısı açardı.

  BOŞ KAYDETMEK = VARSAYILANA DÖNMEK. Satır silinmiyor, boş yazılıyor
  ve sablonuCoz boş alanı varsayılanla dolduruyor; böylece "bir şey
  yazmıştım, sildim" ile "hiç yazmadım" aynı sonucu veriyor.
*/
export async function saveEmailTemplate(formData:FormData){
  const {supabase,organization,membership,user}=await requireTenant();
  if(!roles.has(membership.role))return await bildirimliDonus("/ayarlar?bolum=eposta",{hata:hataMetni("forbidden")});

  const anahtar=String(formData.get("template_key")??"");
  if(!SABLON_ANAHTARLARI.includes(anahtar)){
    return await bildirimliDonus("/ayarlar?bolum=eposta",{hata:"Tanınmayan şablon."});
  }

  const baslik=String(formData.get("subject")??"").trim().slice(0,200);
  const govde=String(formData.get("body")??"").trim().slice(0,2000);

  /*
    Tanınmayan değişken SESSİZCE GEÇMİYOR: {musteri_adi} yazan kiracı
    müşteriye o metni olduğu gibi gönderir ve sebebini anlamaz.
  */
  const taninmayan=taninmayanDegiskenler(anahtar,{baslik,govde});
  if(taninmayan.length){
    return await bildirimliDonus("/ayarlar?bolum=eposta",
      {hata:`Tanınmayan değişken: ${taninmayan.map((d)=>`{${d}}`).join(", ")}`});
  }

  const {error}=await supabase.from("arc_email_templates").upsert({
    organization_id:organization.id,
    template_key:anahtar,
    subject:baslik,
    body:govde,
    updated_by:user.id,
    updated_at:new Date().toISOString(),
  },{onConflict:"organization_id,template_key"});
  if(error)return await bildirimliDonus("/ayarlar?bolum=eposta",{hata:error.message});

  revalidatePath("/ayarlar");
  const bos=!baslik&&!govde;
  return await bildirimliDonus("/ayarlar?bolum=eposta",
    {basari:bos?"Şablon varsayılana döndürüldü.":"Şablon kaydedildi."});
}

/*
  TANITIM SAYFALARI (Sayfalar bölümü).

  E-posta şablonlarıyla aynı tasarım: kiracı METNİ yazar, sayfanın
  düzeni kodda kalır ve metin kaçırılarak basılır. Serbest HTML bir
  yazım hatasıyla sayfayı bozar ve müşteriye giden bir yüzeye kod
  enjekte etme kapısı açardı.

  BOŞ KAYDETMEK = VARSAYILANA DÖNMEK. Satır siliniyor; vitrin satır
  bulamayınca kendi varsayılan metnini çiziyor. Boş satır bırakmak da
  aynı sonucu verirdi ama silmek daha dürüst: "bu mağazanın kendi
  metni yok" demek.
*/
export async function saveStorePage(formData:FormData){
  const {supabase,organization,membership,user}=await requireTenant();
  if(!roles.has(membership.role))return await bildirimliDonus("/ayarlar?bolum=sayfalar",{hata:hataMetni("forbidden")});

  const anahtar=String(formData.get("page_key")??"");
  if(!(SAYFA_ANAHTARLARI as string[]).includes(anahtar)){
    return await bildirimliDonus("/ayarlar?bolum=sayfalar",{hata:"Tanınmayan sayfa."});
  }

  const baslik=String(formData.get("title")??"").trim().slice(0,BASLIK_SINIRI);
  const govde=String(formData.get("body")??"").trim().slice(0,GOVDE_SINIRI);
  /* İngilizce metin SEÇMELİ: boşsa vitrin kendi yansız İngilizce
     varsayılanını çiziyor. Türkçe metni İngilizce sayfaya koymak
     bilerek yapılmıyor — çevirinin yarıda kaldığını gösterir. */
  const baslikEn=String(formData.get("title_en")??"").trim().slice(0,BASLIK_SINIRI);
  const govdeEn=String(formData.get("body_en")??"").trim().slice(0,GOVDE_SINIRI);

  /* DÖRT ALANIN DÖRDÜ de boşsa satır siliniyor. Önceden yalnızca
     Türkçe ikisine bakıyordu: yalnızca İngilizcesini yazan kiracının
     kaydı siliniyordu ve hiçbir yerde hata görünmüyordu. */
  if(!baslik&&!govde&&!baslikEn&&!govdeEn){
    const {error}=await supabase.from("arc_store_pages").delete()
      .eq("organization_id",organization.id).eq("page_key",anahtar);
    if(error)return await bildirimliDonus("/ayarlar?bolum=sayfalar",{hata:error.message});
    revalidatePath("/ayarlar");
    return await bildirimliDonus("/ayarlar?bolum=sayfalar",{basari:"Sayfa varsayılana döndürüldü."});
  }

  const {error}=await supabase.from("arc_store_pages").upsert({
    organization_id:organization.id,
    page_key:anahtar,
    title:baslik,
    body:govde,
    title_en:baslikEn||null,
    body_en:govdeEn||null,
    updated_by:user.id,
    updated_at:new Date().toISOString(),
  },{onConflict:"organization_id,page_key"});
  if(error)return await bildirimliDonus("/ayarlar?bolum=sayfalar",{hata:error.message});

  revalidatePath("/ayarlar");
  return await bildirimliDonus("/ayarlar?bolum=sayfalar",{basari:"Sayfa kaydedildi."});
}


/*
  YURTDIŞI SATIŞ AYARLARI (19.10.2026)

  Kur ve kâr payı PANELDEN; canlı kur servisi yok. Servis düştüğü
  gün fiyatın ne olacağı sorusu yanıtsız kalıyordu: yedek kura
  düşmek sessizce yanlış fiyat, satışı durdurmak ciro kaybı.

  MOD AÇILMADAN ÖNCE KUR ŞART. Kuru olmayan bir yurtdışı vitrini
  fiyat gösteremez; "açık ama fiyatsız" bir mağaza, kapalı
  mağazadan kötüdür.
*/
export async function updateInternationalSettings(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  if (!roles.has(membership.role)) {
    return await bildirimliDonus("/ayarlar?bolum=yurtdisi", {
      hata: hataMetni("forbidden"),
    });
  }

  const acik = formData.get("international_enabled") === "on";
  const otomatik = formData.get("usd_rate_auto") === "on";
  /* Kur ondalıklı ve Türkçe yazımla girilebiliyor: "42,50". */
  const kurHam = String(formData.get("usd_rate") ?? "").trim().replace(",", ".");
  const kur = kurHam ? Number(kurHam) : 0;
  const karHam = String(formData.get("usd_margin_percent") ?? "0").trim().replace(",", ".");
  const kar = Number(karHam);

  if (kurHam && (!Number.isFinite(kur) || kur <= 0 || kur > 10000)) {
    return await bildirimliDonus("/ayarlar?bolum=yurtdisi", {
      hata: hataMetni("invalid-usd-rate"),
    });
  }
  if (!Number.isFinite(kar) || kar < 0 || kar > 500) {
    return await bildirimliDonus("/ayarlar?bolum=yurtdisi", {
      hata: hataMetni("invalid-usd-margin"),
    });
  }
  /* Kursuz açılamıyor: fiyat gösteremeyen bir vitrin açmak,
     müşteriye boş bir mağaza göstermek olurdu. */
  if (acik && (!kur || kur <= 0)) {
    return await bildirimliDonus("/ayarlar?bolum=yurtdisi", {
      hata: hataMetni("usd-rate-required"),
    });
  }

  /*
    KURUN DAMGASI YALNIZCA DEĞER DEĞİŞTİYSE yenileniyor.

    Her kaydetmede `now()` yazmak, kâr payını değiştirmek için formu
    açıp kaydeden kişinin BİR HAFTALIK kurunu "bugün güncellendi"
    diye göstermesi olurdu — ve öz denetim o yüzden bayatlığı hiç
    görmezdi. Bayatlık ölçüsü ancak gerçekten yazılan değerle
    anlamlı.

    Kaynak da buna bağlı: elle girilen yeni bir kur "manuel" oluyor
    ve otomatik iş onu bir sonraki turda TCMB kuruyla değiştiriyor
    (otomatik kip açıksa). Kip kapalıysa kur olduğu gibi kalıyor.
  */
  const oncekiKur = Number(
    (
      await supabase
        .from("arc_store_settings")
        .select("usd_rate")
        .eq("organization_id", organization.id)
        .maybeSingle()
    ).data?.usd_rate ?? 0,
  );
  const yeniKur = kur > 0 ? kur : null;
  const kurDegisti = (yeniKur ?? 0) !== oncekiKur;

  const { error } = await supabase.from("arc_store_settings").upsert({
    organization_id: organization.id,
    ...(await magazaAdiTabani(supabase, organization.id, organization.name)),
    international_enabled: acik,
    usd_rate: yeniKur,
    usd_margin_percent: kar,
    usd_rate_auto: otomatik,
    ...(kurDegisti
      ? { usd_rate_updated_at: new Date().toISOString(), usd_rate_source: "manuel" }
      : {}),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return await bildirimliDonus("/ayarlar?bolum=yurtdisi", {
      hata: hataMetni(error.code ?? error.message),
    });
  }
  revalidatePath("/ayarlar");
  return await bildirimliDonus("/ayarlar?bolum=yurtdisi", {
    basari: basariMetni("saved"),
  });
}

/*
  KARGO BÖLGESİ EKLEME / GÜNCELLEME.

  Ülke kodları serbest metin olarak giriliyor ("DE, FR, NL") ve
  burada ayrıştırılıyor: panelde dizi alanı tutmak, iki yüz ülkelik
  bir seçici çizmek demekti. BOŞ BIRAKILAN liste "öteki her yer"
  anlamına geliyor ve bu bilerek: tarifesiz kalan ülkeye satış
  yapılamıyor, yani genel bir bölge olmadan yurtdışı satışı eksik
  kalır.
*/
export async function saveShippingZone(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  if (!roles.has(membership.role)) {
    return await bildirimliDonus("/ayarlar?bolum=yurtdisi", {
      hata: hataMetni("forbidden"),
    });
  }

  const id = String(formData.get("id") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim().slice(0, 80);
  /* Dolar sent: yurtdışı fiyatları dolar (lib/kargo-bolgesi). */
  const ucret = Math.round(Number(String(formData.get("fee") ?? "0").replace(",", ".")) * 100);
  const esik = Math.round(Number(String(formData.get("free_over") ?? "0").replace(",", ".")) * 100);
  const ulkeler = String(formData.get("countries") ?? "")
    .split(/[,\s]+/)
    .map((k) => k.trim().toUpperCase())
    .filter((k) => /^[A-Z]{2}$/.test(k));

  if (!label || !Number.isFinite(ucret) || ucret < 0 || !Number.isFinite(esik) || esik < 0) {
    return await bildirimliDonus("/ayarlar?bolum=yurtdisi", {
      hata: hataMetni("invalid-zone"),
    });
  }

  const satir = {
    organization_id: organization.id,
    label,
    countries: ulkeler,
    fee_cents: ucret,
    free_over_cents: esik,
    updated_at: new Date().toISOString(),
  };

  /* Mağaza kapsamı güncellemede de KOŞULDA: id tahmin edilerek
     başka mağazanın tarifesi değiştirilemesin. */
  const { error } = id
    ? await supabase
        .from("arc_shipping_zones")
        .update(satir)
        .eq("id", id)
        .eq("organization_id", organization.id)
    : await supabase.from("arc_shipping_zones").insert(satir);

  if (error) {
    return await bildirimliDonus("/ayarlar?bolum=yurtdisi", {
      hata: hataMetni(error.code ?? error.message),
    });
  }
  revalidatePath("/ayarlar");
  return await bildirimliDonus("/ayarlar?bolum=yurtdisi", {
    basari: basariMetni("saved"),
  });
}

export async function deleteShippingZone(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  if (!roles.has(membership.role)) {
    return await bildirimliDonus("/ayarlar?bolum=yurtdisi", {
      hata: hataMetni("forbidden"),
    });
  }
  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return await bildirimliDonus("/ayarlar?bolum=yurtdisi", {
      hata: hataMetni("invalid-zone"),
    });
  }

  const { error } = await supabase
    .from("arc_shipping_zones")
    .delete()
    .eq("id", id)
    .eq("organization_id", organization.id);

  if (error) {
    return await bildirimliDonus("/ayarlar?bolum=yurtdisi", {
      hata: hataMetni(error.code ?? error.message),
    });
  }
  revalidatePath("/ayarlar");
  return await bildirimliDonus("/ayarlar?bolum=yurtdisi", {
    basari: basariMetni("deleted"),
  });
}
