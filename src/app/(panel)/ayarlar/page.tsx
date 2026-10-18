import { requireTenant } from "@/lib/tenant";
import { DurumSecici } from "@/components/arvo-ui/durum-secici";
import { ALT_ALAN_SONEKI, altAlanAdresi, magazaAdresi } from "@/lib/magaza-adresi";
import { removeBrandAsset,removeWhatsappNumber,saveEmailTemplate,saveStorePage,saveWhatsappNumber,updatePanelDomainSettings,updatePaymentSettings,updateSalesSettings,updateShippingIntegration,updateStorefrontDomainSettings,updateStoreSettings,uploadBrandAsset,verifyPanelDomain,verifyStorefrontDomain,verifyWhatsappNumber } from "./actions";
import { whatsappDurumu,whatsappKapisiVar } from "@/lib/whatsapp-hesap";
import { DEGISKENLER,SABLON_KAYDI,sablonuCoz } from "@/lib/eposta-sablonu";
import { BASLIK_SINIRI,GOVDE_SINIRI,SAYFA_KAYDI } from "@/lib/magaza-sayfasi";
import { baglantiyiSina } from "@/lib/tryoto/ayar";
import Link from "next/link";
// Ayar formlarının iç biçimi (settings-*, payment-*, domain-*) hâlâ eski dosyalarda.
import "../catalog.css";
import "@/components/arvo-ui/kayit-detay.css";
import "./ayarlar.css";

/*
  BÖLÜMLER (16.10.2026, ArvoOS'taki gibi). Ayarlar tek uzun sayfaydı:
  marka, satış, iki alan adı, kargo entegrasyonu ve ödeme yöntemleri alt
  alta, beş ekran boyu. Her bölüm artık ?bolum= ile ayrı açılıyor
  (ikinci dock, Ctrl+K ve sayfanın başındaki süzgeç). Bir getirisi daha:
  tryOTO bağlantı sınaması her açılışta dış istek atıyordu; artık yalnızca
  Kargo bölümünde.
*/
export const AYAR_BOLUMLERI = [
  ["marka", "Marka kimliği"],
  ["satis", "Satış"],
  ["alan-adi", "Alan adları"],
  ["kargo", "Kargo"],
  ["odeme", "Ödeme"],
  ["entegrasyon", "Entegrasyonlar"],
  ["eposta", "E-posta şablonları"],
  ["sayfalar", "Sayfalar"],
] as const;
type AyarBolumu = (typeof AYAR_BOLUMLERI)[number][0];
import { yetkiYok } from "@/lib/yetki-metni";

const statusLabel:Record<string,string>={not_configured:"Bağlı değil",pending_dns:"DNS bekleniyor",verifying:"Doğrulanıyor",active:"Aktif",failed:"Bağlantı hatası"};

/* DNS kaydı henüz yayılmadıysa hata değil, bekleme durumu. */


export default async function Settings({searchParams}:{searchParams:Promise<{bolum?:string}>}){
  const {bolum:bolumParametresi}=await searchParams;
  const bolum:AyarBolumu=AYAR_BOLUMLERI.some(([k])=>k===bolumParametresi)?(bolumParametresi as AyarBolumu):"marka";
  const {supabase,organization,membership,user}=await requireTenant();
  const {data:settings,error}=await supabase.from("arc_store_settings").select("store_name,storefront_url,currency,locale,low_stock_threshold,logo_path,favicon_path,primary_color,accent_color,custom_domain,platform_subdomain,domain_status,domain_verified_at,panel_custom_domain,panel_domain_status,panel_domain_verified_at,storefront_mode,domain_verification_token,bank_transfer_enabled,bank_name,bank_account_holder,bank_iban,bank_transfer_instructions,paytr_enabled,paytr_test_mode,paytr_merchant_id,paytr_no_installment,paytr_max_installment,paytr_merchant_key_enc,garanti_enabled,garanti_test_mode,garanti_isyeri_no,garanti_terminal_no,garanti_api_surumu,garanti_guvenlik_duzeyi,garanti_yari_guvenli_kabul,garanti_provizyon_sifresi_enc,garanti_magaza_anahtari_enc,garanti_iade_sifresi_enc,odeme_saglayicisi,email_from,email_reply_to,order_prefix,shipping_fee,free_shipping_threshold,bank_transfer_discount_percent,tryoto_enabled,tryoto_test_mode,tryoto_pickup_location_code,tryoto_refresh_token_enc,legal_name,contact_phone,contact_email,address_line,address_district,address_city,address_country").eq("organization_id",organization.id).maybeSingle();
  if(error)throw new Error(error.message);
  const disVitrin=settings?.storefront_mode==="external";
  const canManage=["owner","admin","manager"].includes(membership.role);
  /* Ödemenin gittiği hesap (IBAN, PayTR) yalnızca owner/admin: bkz. actions.ts PAYMENT_ROLES. */
  const canManagePayments=["owner","admin"].includes(membership.role);
  // Anahtarın kendisi hiç okunmaz; yalnızca kayıtlı olup olmadığı gösterilir.
  const keysStored=Boolean(settings?.paytr_merchant_key_enc);
  const garantiKeysStored=Boolean(settings?.garanti_provizyon_sifresi_enc&&settings?.garanti_magaza_anahtari_enc);
  /* Bağlantı yalnızca yetkiliye sınanıyor: OTO'ya gereksiz istek atmamak
     ve firma listesini görmeye yetkisi olmayana göstermemek için. */
  /* Durum yalnızca Entegrasyonlar açıkken sorulur: her ayar açılışında
     ArvoOS'a istek atmak gereksiz. Okunamazsa bölüm sebebini gösterir,
     sayfa düşmez. */
  const whatsapp=canManagePayments&&bolum==="entegrasyon"&&whatsappKapisiVar()
    ?await whatsappDurumu(organization.id,user.id)
    :null;
  /* Şablonlar yalnızca o bölüm açıkken okunur. */
  const sablonSatirlari=bolum==="eposta"
    ?(await supabase.from("arc_email_templates").select("template_key,subject,body").eq("organization_id",organization.id)).data??[]
    :[];
  /* Sayfalar yalnızca o bölüm açıkken okunur. */
  const sayfaSatirlari=bolum==="sayfalar"
    ?(await supabase.from("arc_store_pages").select("page_key,title,body").eq("organization_id",organization.id)).data??[]
    :[];
  const sayfaKayitlari=new Map(sayfaSatirlari.map((s)=>[s.page_key as string,{baslik:s.title as string,govde:s.body as string}]));
  const sablonKayitlari=new Map(sablonSatirlari.map((s)=>[s.template_key as string,{baslik:s.subject as string,govde:s.body as string}]));
  const kargoBaglantisi=canManagePayments&&bolum==="kargo"
    ?await baglantiyiSina(organization.id,settings)
    :{durum:"kapali" as const};
  const logoUrl=settings?.logo_path?supabase.storage.from("organization-assets").getPublicUrl(settings.logo_path).data.publicUrl:"";
  const faviconUrl=settings?.favicon_path?supabase.storage.from("organization-assets").getPublicUrl(settings.favicon_path).data.publicUrl:"";
  const domainStatus=settings?.domain_status??"not_configured";
  const panelDomainStatus=settings?.panel_domain_status??"not_configured";
  /*
    PayTR bildirim adresi PANEL alan adındadır, vitrininki değil: bu uç
    (api/storefront/paytr-bildirim) panel projesinde yayınlanıyor, vitrin
    ayrı bir Vercel projesi. Ekranda vitrin adresi yazıyordu; o adres 404
    döndüğü için bildirim hiç ulaşmıyordu.
  */
  /*
    "Doğru ayrım" notu ÖRNEK değil, kiracının GERÇEK iki adresini
    gösteriyor. Örnekler önce ArvoCulture'ınkilerdi; onları kiracının
    alan adından türetince bu sefer olmayan bir adres uyduruyordu
    ("panel.salon-beta.shop.arvo-os.com"). Panelin adresi zaten
    callbackHost'ta duruyor ve hemen yukarıdaki kutuda yazıyor.
  */
  const vitrinAdresi=magazaAdresi(settings)?.replace(/^https:\/\//,"")??null;
  const callbackHost=panelDomainStatus==="verified"&&settings?.panel_custom_domain?settings.panel_custom_domain:"arc.arvo-os.com";
  const bolumAdi=AYAR_BOLUMLERI.find(([k])=>k===bolum)![1];
  return <main className="talep ayarlar-sayfasi">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">Mağaza ayarları</small>
        <h1>{bolumAdi}</h1>
      </div>
    </header>
    <nav className="ekip-suzgec talep-suzgec ayarlar-bolumleri" aria-label="Ayar bölümleri">
      {AYAR_BOLUMLERI.map(([k,ad])=>(
        <Link key={k} prefetch={false} href={k==="marka"?"/ayarlar":`/ayarlar?bolum=${k}`} className={bolum===k?"is-active":undefined} aria-current={bolum===k?"page":undefined}>{ad}</Link>
      ))}
      <Link prefetch={false} href="/tema">Vitrin teması</Link>
    </nav>

    <div className="ac-stack">

    <div className="settings-layout">
    {bolum==="marka"?<>
      <section className="panel-card settings-section" id="marka-kimligi">
        <div className="head"><div><small>MARKA KİMLİĞİ</small><h3>Logo ve görünüm</h3></div><span>{organization.plan_code}</span></div>
        <div className="brand-assets-grid">
          <article className="brand-asset">
            <div className="brand-preview logo-preview" role="img" aria-label="Mağaza logosu" style={logoUrl?{backgroundImage:`url("${logoUrl}")`}:undefined}>{!logoUrl&&<b>LOGO</b>}</div>
            <div><strong>Mağaza logosu</strong><small>PNG, JPG veya WEBP · en fazla 4 MB</small></div>
            {canManage&&<><form action={uploadBrandAsset}><input type="hidden" name="kind" value="logo"/><input name="file" type="file" accept="image/png,image/jpeg,image/webp" required/><button className="panel-primary" type="submit">Logo yükle</button></form>{logoUrl&&<form action={removeBrandAsset}><input type="hidden" name="kind" value="logo"/><button className="danger-button" type="submit">Logoyu kaldır</button></form>}</>}
          </article>
          <article className="brand-asset">
            <div className="brand-preview favicon-preview" role="img" aria-label="Mağaza faviconu" style={faviconUrl?{backgroundImage:`url("${faviconUrl}")`}:undefined}>{!faviconUrl&&<b>F</b>}</div>
            <div><strong>Favicon</strong><small>PNG, WEBP veya ICO · en fazla 1 MB</small></div>
            {canManage&&<><form action={uploadBrandAsset}><input type="hidden" name="kind" value="favicon"/><input name="file" type="file" accept="image/png,image/webp,image/x-icon,image/vnd.microsoft.icon" required/><button className="panel-primary" type="submit">Favicon yükle</button></form>{faviconUrl&&<form action={removeBrandAsset}><input type="hidden" name="kind" value="favicon"/><button className="danger-button" type="submit">Faviconu kaldır</button></form>}</>}
          </article>
        </div>

        {canManage?<form action={updateStoreSettings} className="settings-form">
          <label>Mağaza adı<input name="store_name" defaultValue={settings?.store_name??organization.name} required maxLength={160}/></label>
          {/*
            AYNI SAYFA İKİ FARKLI CEVAP VERİYORDU. Burası yalnızca
            storefront_url'e bakıyordu; kiracı açılışının verdiği alt
            alan adı o sütuna yazılmıyor. Yeni bir salon burada "Henüz
            tanımlanmadı" okuyor, 1000 piksel aşağıda aynı sayfada
            "MAĞAZA ADRESİ: salon-beta.shop.arvo-os.com · Aktif"
            görüyordu. Adres artık ortak çözücüden (lib/magaza-adresi.ts),
            yani alan adı bölümüyle aynı kaynaktan.
          */}
          <label>Yayınlanan mağaza<span className="readonly-field">{magazaAdresi(settings)??"Henüz tanımlanmadı"}</span></label>
          <label>Ana marka rengi<span className="color-input"><input name="primary_color" type="color" defaultValue={settings?.primary_color??"#002045"}/><input value={settings?.primary_color??"#002045"} readOnly aria-label="Ana marka rengi kodu"/></span></label>
          <label>Vurgu rengi<span className="color-input"><input name="accent_color" type="color" defaultValue={settings?.accent_color??"#6f9548"}/><input value={settings?.accent_color??"#6f9548"} readOnly aria-label="Vurgu rengi kodu"/></span></label>
          <label>Para birimi<DurumSecici name="currency" etiket="Para birimi" bicim="alan" gonder={false} deger={String(settings?.currency??"TRY")} secenekler={[{deger:"TRY",etiket:"TRY · Türk Lirası"},{deger:"USD",etiket:"USD · ABD Doları"},{deger:"EUR",etiket:"EUR · Euro"}]}/></label>
          <label>Dil / bölge<DurumSecici name="locale" etiket="Dil / bölge" bicim="alan" gonder={false} deger={String(settings?.locale??"tr-TR")} secenekler={[{deger:"tr-TR",etiket:"Türkçe · Türkiye"},{deger:"en-US",etiket:"English · United States"}]}/></label>
          <label>Düşük stok eşiği<input name="low_stock_threshold" type="number" min="0" max="10000" step="1" defaultValue={settings?.low_stock_threshold??5} required/></label>
          <button className="panel-primary" type="submit">Marka ayarlarını kaydet</button>
        </form>:<p className="list-hint">{yetkiYok("mağaza ayarları")}</p>}
      </section>

      {/* Satış ayarları: sütunlar vardı ama hiçbir form onları yazmıyordu,
          yani her mağaza ArvoCulture tarifesiyle satıyordu. */}
    </>:null}
    {bolum==="satis"?<>
      <section className="panel-card settings-section" id="satis-ayarlari">
        <header><h2>Satış ayarları</h2><p>Kargo, ücretsiz kargo eşiği, havale indirimi ve sipariş numarası öneki.</p></header>
        {canManage?<form action={updateSalesSettings} className="settings-form">
          <label>Kargo ücreti (₺)<input name="shipping_fee" type="text" inputMode="decimal" autoComplete="off" defaultValue={((settings?.shipping_fee??12000)/100).toFixed(2)} required/></label>
          <label>Ücretsiz kargo eşiği (₺)<input name="free_shipping_threshold" type="text" inputMode="decimal" autoComplete="off" defaultValue={((settings?.free_shipping_threshold??200000)/100).toFixed(2)} required/></label>
          <label>Havale indirimi (%)<input name="bank_transfer_discount_percent" type="number" min="0" max="100" step="0.1" defaultValue={settings?.bank_transfer_discount_percent??3} required/></label>
          <label>Sipariş numarası öneki<input name="order_prefix" maxLength={6} pattern="[A-Za-z]{1,6}" defaultValue={settings?.order_prefix??"AC"} required/></label>
          <p className="list-hint">Sepet tutarı eşiği geçerse kargo alınmaz. Eşik, indirim uygulanmadan önceki ara toplamla karşılaştırılır. Önek her mağazada farklı olmalı: sipariş numaraları çakışırsa ödeme bildirimleri yanlış siparişe düşebilir.</p>
          <button className="panel-primary" type="submit">Satış ayarlarını kaydet</button>
        </form>:<p className="list-hint">{yetkiYok("mağaza ayarları")}</p>}
      </section>

    </>:null}
    {bolum==="alan-adi"?<>
      <section className="domain-stack">
        <section className="panel-card settings-section domain-section">
          <div className="head"><div><small>YÖNETİM PANELİ</small><h3>Panel alan adı</h3></div><em className={panelDomainStatus}>{statusLabel[panelDomainStatus]??panelDomainStatus}</em></div>
          <p className="domain-explainer"><b>ArvoARC paneli</b> · Sipariş, ürün, stok ve mağaza yönetimi için kullanılır. Müşteriler bu adresi görmez.</p>
          <div className="domain-current"><small>MARKALI PANEL ADRESİ</small><strong>{settings?.panel_custom_domain??"Henüz tanımlanmadı"}</strong><span>{settings?.panel_domain_verified_at?"SSL ve alan adı doğrulandı":"DNS bağlantısı bekleniyor"}</span></div>
          <div className="domain-platform"><small>ArvoARC ana paneli</small><strong>arc.arvo-os.com</strong></div>
          {canManage&&<form action={updatePanelDomainSettings} className="domain-form">
            <label>Müşteriye özel panel alan adı<input name="panel_custom_domain" defaultValue={settings?.panel_custom_domain??""} placeholder="app.markaniz.com" required/></label>
            <button className="panel-primary" type="submit">Panel alan adını kaydet</button>
          </form>}
          {settings?.panel_custom_domain&&panelDomainStatus!=="active"&&<div className="dns-guide">
            <div><span>1</span><p><b>CNAME kaydı</b><code>{settings.panel_custom_domain} → 78128f864bd971a1.vercel-dns-017.com</code></p></div>
            <div><span>2</span><p><b>Vercel doğrulaması</b><small>Alan adı ArvoARC projesine eklenir ve DNS kaydı kontrol edilir.</small></p></div>
            <div><span>3</span><p><b>Otomatik SSL</b><small>DNS doğrulandıktan sonra güvenli panel bağlantısı etkinleşir.</small></p></div>
            {canManage&&<form action={verifyPanelDomain}><button className="panel-primary" type="submit">DNS bağlantısını doğrula</button></form>}
          </div>}
        </section>

        <section className="panel-card settings-section domain-section" id="magaza-alan-adi">
          <div className="head"><div><small>E-TİCARET MAĞAZASI</small><h3>Mağaza alan adı</h3></div><em className={domainStatus}>{statusLabel[domainStatus]??domainStatus}</em></div>
          <p className="domain-explainer"><b>Herkese açık mağaza</b> · Ürünlerin, koleksiyonların ve ödeme akışının yayınlandığı müşteri adresidir.</p>
          <div className="domain-current storefront"><small>MAĞAZA ADRESİ</small><strong>{settings?.custom_domain??(settings?.platform_subdomain?altAlanAdresi(settings.platform_subdomain):"Henüz tanımlanmadı")}</strong><span>{settings?.domain_verified_at?"SSL ve alan adı doğrulandı":"DNS bağlantısı bekleniyor"}</span></div>
          {canManage&&<form action={updateStorefrontDomainSettings} className="domain-form">
            {/*
              VİTRİN KİMDE? Bu seçim DNS yönergesini de doğrulamayı da
              değiştiriyor. Müşteri sitesini kendi yaptığında alan adını
              bizim Vercel projemize eklemek yanlış: DNS başka yere
              yöneliyor ve kayıt sonsuza kadar "DNS bekleniyor"da
              kalıyor, kullanıcı var olmayan bir sorunu çözmeye
              çalışıyor.
            */}
            <fieldset className="vitrin-kipi">
              <legend>Vitrin nerede?</legend>
              <label className="check-inline">
                <input type="radio" name="storefront_mode" value="hosted" defaultChecked={disVitrin!==true}/>
                <span><b>ArvoARC&apos;ta</b> — mağazayı biz barındırıyoruz</span>
              </label>
              <label className="check-inline">
                <input type="radio" name="storefront_mode" value="external" defaultChecked={disVitrin===true}/>
                <span><b>Kendi sitemde</b> — ürünleri ve siparişleri panelden yönetirim</span>
              </label>
            </fieldset>
            {!disVitrin&&<label>ARVO mağaza alt alan adı<div className="domain-input"><input name="storefront_subdomain" defaultValue={settings?.platform_subdomain??""} placeholder="magazaadi" pattern="[a-z0-9-]+"/><span>.{ALT_ALAN_SONEKI}</span></div></label>}
            {!disVitrin&&<div className="domain-divider"><span>veya özel alan adı</span></div>}
            <label>{disVitrin?"Sitenizin alan adı":"Mağaza alan adı"}<input name="storefront_custom_domain" defaultValue={settings?.custom_domain??""} placeholder="markaniz.com"/></label>
            {disVitrin&&<p className="list-hint">Bu adres yalnızca <b>tanıma</b> için kaydedilir: siparişin hangi mağazaya yazılacağını ve API&apos;mizin hangi siteye açılacağını belirler. DNS&apos;inize dokunulmaz.</p>}
            <button className="panel-primary" type="submit">Mağaza alan adını kaydet</button>
          </form>}
          {settings?.custom_domain&&domainStatus!=="active"&&(disVitrin
            ?/*
                DIŞ VİTRİNDE KANIT TXT KAYDI. DNS bize yönelmediği
                için "alan adı bize mi geliyor" diye soramıyoruz;
                sorduğumuz soru "bu alan adı gerçekten senin mi" ve
                yanıtı yalnızca DNS'ine erişen biri verebilir.
              */
              <div className="dns-guide">
                <div><span>1</span><p><b>TXT kaydı ekleyin</b><small>DNS sağlayıcınızda, kökte ya da <code>_arvo</code> adında bir TXT kaydı:</small><code>{settings.domain_verification_token??"Kaydı oluşturmak için alan adını kaydedin"}</code></p></div>
                <div><span>2</span><p><b>Doğrulayın</b><small>Kayıt yayıldıktan sonra aşağıdaki düğmeye basın; birkaç dakika sürebilir.</small></p></div>
                <div><span>3</span><p><b>Sipariş akışı açılır</b><small>Doğrulandıktan sonra siteniz ödeme ve veri uçlarımızı çağırabilir.</small></p></div>
                {canManage&&<form action={verifyStorefrontDomain}><button className="panel-primary" type="submit">TXT kaydını doğrula</button></form>}
              </div>
            :<div className="dns-guide">
              <div><span>1</span><p><b>Vercel DNS kaydı</b><small>Vercel’in mağaza projesinde göstereceği CNAME veya A kaydını DNS sağlayıcınıza ekleyin.</small></p></div>
              <div><span>2</span><p><b>Mağaza yayını</b><code>https://{settings.custom_domain}</code></p></div>
              <div><span>3</span><p><b>Otomatik SSL</b><small>DNS doğrulandıktan sonra güvenli mağaza bağlantısı etkinleşir.</small></p></div>
              {canManage&&<form action={verifyStorefrontDomain}><button className="panel-primary" type="submit">DNS bağlantısını doğrula</button></form>}
            </div>)}
          <div className="domain-note"><b>Doğru ayrım</b><p><strong>{callbackHost}</strong> yönetim panelidir; {vitrinAdresi?<><strong>{vitrinAdresi}</strong> ise müşterilerin alışveriş yaptığı mağazadır.</>:"mağaza adresi ise müşterilerin alışveriş yaptığı yerdir ve yukarıdan bağlanır."}</p></div>
        </section>
      </section>
    </>:null}
    </div>
    {bolum==="kargo"?<>
    {/*
      KARGO ENTEGRASYONU. Bağlantı sayfa açılırken sınanıyor: hesapta
      hangi kargo firmalarının açık olduğunu panelden görmenin başka yolu
      yok ve bu bilgi olmadan gönderi ekranında firma seçilemez. Hata
      sayfayı düşürmüyor (baglantiyiSina yakalıyor), yoksa yanlış yazılmış
      bir anahtar bütün ayar ekranını erişilemez yapardı.
    */}
    <section className="panel-card settings-section payment-section">
      <div className="head"><div><small>KARGO ALTYAPISI</small><h3>tryOTO entegrasyonu</h3><p>Bir siparişin kalemleri farklı kargo firmalarına bölünerek gönderilebilir; her parçanın kendi takip numarası olur.</p></div><span>MAĞAZAYA ÖZEL</span></div>
      {canManagePayments?<>
        <form action={updateShippingIntegration} className="payment-form">
          <article className="payment-method">
            <div className="payment-title"><div><small>GÖNDERİ SAĞLAYICISI</small><h4>tryOTO</h4></div><label className="check-inline"><input type="checkbox" name="tryoto_enabled" defaultChecked={settings?.tryoto_enabled??false}/><span>Etkin</span></label></div>
            <p>Yenileme anahtarını OTO panelinde <b>Ayarlar → API Entegrasyonları</b> bölümünden “Connect” ile üretirsiniz. Gönderi oluşturmak OTO cüzdanınızdaki bakiyeyi harcar.</p>
            <div className="payment-fields">
              <label className="wide">Yenileme anahtarı (refresh token)<input name="tryoto_refresh_token" type="password" placeholder={settings?.tryoto_refresh_token_enc?"Kayıtlı · değiştirmek için yazın":"OTO refresh token"} autoComplete="new-password"/></label>
              <label className="wide">Gönderici konum kodu (pickup location)
                {/* Kayıtlı konum varsa listeden seçiliyor: kodu OTO panelinde
                    arayıp elle kopyalamak gereksiz bir adımdı ve yanlış
                    yazılan kod ancak ilk gönderi denemesinde hata veriyordu.
                    Liste çekilemediyse alan serbest metin olarak kalıyor —
                    kod elle de girilebilmeli. */}
                {kargoBaglantisi.durum==="basarili"&&kargoBaglantisi.konumlar.length
                  ?/* Pasif konumlar da listede: gizlemek, kullanıcının OTO
                      panelinde gördüğü konumu burada bulamamasına yol
                      açıyordu. Pasif olduğu yazıyor, seçimi kullanıcının.
                      Liste uzayabildiği için seçici ARANABİLİR. */
                    <DurumSecici
                      name="tryoto_pickup_location_code"
                      etiket="Gönderici konumu"
                      bicim="alan"
                      aranabilir
                      gonder={false}
                      deger={settings?.tryoto_pickup_location_code??""}
                      secenekler={[
                        {deger:"",etiket:"Kullanma · adresi her gönderide yaz"},
                        ...kargoBaglantisi.konumlar.map((konum)=>({
                          deger:konum.kod,
                          etiket:`${konum.ad} · ${konum.kod}${konum.sehir?` · ${konum.sehir}`:""} (${konum.tur==="depo"?"depo":"şube"}${konum.aktif?"":" · PASİF"})`,
                        })),
                      ]}
                    />
                  :<input name="tryoto_pickup_location_code" defaultValue={settings?.tryoto_pickup_location_code??""} placeholder="OTO'da tanımlı konumun kodu (isteğe bağlı)" autoComplete="off"/>}
              </label>
              <div className="check-stack"><label className="check-inline"><input type="checkbox" name="tryoto_test_mode" defaultChecked={settings?.tryoto_test_mode??true}/> Test (sandbox) hesabı</label></div>
            </div>
            {/* ÇIKIŞ ADRESİ. OTO'ya gönderici ya tanımlı bir konumun
                koduyla ya adresin tek tek yazılmasıyla veriliyor; ikinci
                yol için bu alanlar gerekiyordu ve girilebilecekleri hiçbir
                ekran yoktu — etiket üretimi "gönderici bilgisi yok" diyip
                duruyordu. Ad olarak YASAL UNVAN isteniyor: etikette
                müşterinin gördüğü gönderici bu. */}
            <h5 className="payment-subtitle">Çıkış (gönderici) adresi</h5>
            <p>Yukarıda bir gönderici konumu seçtiyseniz bu alanlar kullanılmaz; OTO&apos;da tanımlı konum yoksa etiket bu adresle üretilir.</p>
            <div className="payment-fields">
              <label className="wide">Gönderici unvanı<input name="legal_name" defaultValue={settings?.legal_name??""} placeholder="Etikette görünecek yasal unvan" autoComplete="off"/></label>
              <label>Telefon<input name="contact_phone" defaultValue={settings?.contact_phone??""} placeholder="5xx xxx xx xx" autoComplete="off"/></label>
              <label>E-posta<input name="contact_email" type="email" defaultValue={settings?.contact_email??""} placeholder="kargo@magaza.com" autoComplete="off"/></label>
              <label className="wide">Adres<input name="address_line" defaultValue={settings?.address_line??""} placeholder="Mahalle, cadde, no" autoComplete="off"/></label>
              <label>İlçe<input name="address_district" defaultValue={settings?.address_district??""} autoComplete="off"/></label>
              <label>Şehir<input name="address_city" defaultValue={settings?.address_city??""} autoComplete="off"/></label>
              <label>Ülke<input name="address_country" defaultValue={settings?.address_country??"TR"} placeholder="TR" autoComplete="off"/></label>
            </div>
            <div className="security-note"><b>{settings?.tryoto_refresh_token_enc?"Anahtarınız kayıtlı.":"Anahtar henüz girilmedi."}</b><p>Anahtar şifrelenerek saklanır ve hiçbir ekranda geri gösterilmez. Değiştirmek için yeniden yazın; boş bırakırsanız kayıtlı olan korunur.</p><p>Gönderici konumu <b>seçilmeli</b>: OTO gönderiyi kayıtlı bir konum olmadan oluşturmuyor — sipariş açılıyor, gönderi ve etiket üretilmiyor (27.09.2026). Aşağıdaki çıkış adresi yalnızca konum seçilmediğinde gönderilen yedek bilgidir.</p></div>
          </article>
          <button className="panel-primary payment-save" type="submit">Kargo ayarlarını kaydet</button>
        </form>
        <article className="payment-method">
          <div className="payment-title"><div><small>BAĞLANTI DURUMU</small><h4>OTO&apos;nun desteklediği kargo firmaları</h4></div></div>
          {kargoBaglantisi.durum==="kapali"?<p className="list-hint">Entegrasyon kapalı. Etkinleştirip kaydedince firmalar burada listelenir.</p>
          :kargoBaglantisi.durum==="anahtar-yok"?<p className="list-hint">Yenileme anahtarı girilmemiş; bağlantı sınanamıyor.</p>
          :kargoBaglantisi.durum==="hata"?<div className="security-note"><b>Bağlantı kurulamadı.</b><p>{kargoBaglantisi.mesaj}</p>{kargoBaglantisi.ham||kargoBaglantisi.durumKodu?<code>OTO yanıtı{kargoBaglantisi.durumKodu?` (HTTP ${kargoBaglantisi.durumKodu})`:""}: {kargoBaglantisi.ham??"gövdede mesaj yok"}</code>:null}</div>
          :<>
            {/* Bağlantının dayanağı accountInfo: anahtarı doğruluyor ve
                bakiyeyi söylüyor. Bakiye gönderi oluşturmanın ön şartı —
                OTO cüzdanından düşüyor, bitince etiket üretilemiyor. */}
            <ul className="tryoto-carriers">
              <li><b>{kargoBaglantisi.hesap?.ad??"Hesap"}</b><small>{kargoBaglantisi.hesap?.eposta??"bağlı"}</small></li>
              {kargoBaglantisi.hesap?.paket?<li><b>{kargoBaglantisi.hesap.paket}</b><small>paket</small></li>:null}
              {kargoBaglantisi.hesap?.bakiye!==null&&kargoBaglantisi.hesap?.bakiye!==undefined?<li><b>{kargoBaglantisi.hesap.bakiye}</b><small>kalan bakiye</small>{kargoBaglantisi.hesap.bakiye<=0?<span>yetersiz</span>:null}</li>:null}
            </ul>
            {kargoBaglantisi.hesap?.bakiye!==null&&kargoBaglantisi.hesap?.bakiye!==undefined&&kargoBaglantisi.hesap.bakiye<=0
              ?<div className="security-note"><b>OTO bakiyeniz yok.</b><p>Gönderi oluşturmak cüzdandan düşüyor; bakiye yüklenmeden etiket üretilemez. Tedarikçinin kendi gönderdiği siparişlerde bakiye gerekmez, orada yalnızca takip numarası girilir.</p></div>
              :null}
            {kargoBaglantisi.firmalar.length?<>
              <ul className="tryoto-carriers">
                {kargoBaglantisi.firmalar.map(firma=><li key={firma.kod}><b>{firma.ad}</b><small>{firma.kod}</small>{firma.etkin===false?<span>kapalı</span>:null}</li>)}
              </ul>
              <p className="list-hint">OTO {kargoBaglantisi.firmalar.length} kargo firmasını destekliyor. Gönderi oluştururken hangilerinin fiyat verdiği adrese ve pakete göre belirleniyor.</p>
            </>:<p className="list-hint">{kargoBaglantisi.firmaHatasi?`Desteklenen firma listesi alınamadı: ${kargoBaglantisi.firmaHatasi} Bu, gönderi oluşturmayı engellemez — kullanılabilir firmalar adrese ve pakete göre fiyat sorulurken belirleniyor.`:"Desteklenen firma listesi boş döndü. Gönderi oluştururken kullanılabilir firmalar yine de fiyat sorgusuyla belirleniyor."}</p>}
            {/* Konum listesinin HATASI ayrı gösteriliyor. Boş liste "konum
                tanımlı değil" diye okunuyordu ve kullanıcının OTO panelinde
                dört konumu varken ekran bunu söylüyordu; gönderiler kayıtlı
                konum olmadan oluşturulup etiketsiz kaldı (27.09.2026). */}
            {kargoBaglantisi.konumHatasi
              ?<div className="security-note"><b>Gönderici konumları alınamadı.</b><p>{kargoBaglantisi.konumHatasi}</p><p>Kodu OTO panelindeki konum kaydından alıp yukarıdaki alana elle yazabilirsiniz.</p></div>
              :<p className="list-hint">{kargoBaglantisi.konumlar.length
                  ?`${kargoBaglantisi.konumlar.length} gönderici konumu bulundu${kargoBaglantisi.konumlar.some(k=>k.aktif)?"":" (hepsi pasif)"}. Etiket üretilebilmesi için burada bir konum SEÇİLMELİ: OTO gönderiyi kayıtlı konum olmadan oluşturmuyor.`
                  :"Gönderici konumu bulunamadı. OTO panelinde Ayarlar → Gönderici Konumları bölümünden tanımlayın."}</p>}
          </>}
        </article>
      </>:<p className="list-hint">{yetkiYok("kargo entegrasyonu", "sahiplik")}</p>}
    </section>

    </>:null}
    {bolum==="odeme"?<>
    <section className="panel-card settings-section payment-section" id="odeme-yontemleri">
      <div className="head"><div><small>ÖDEME ALTYAPISI</small><h3>Ödeme yöntemleri</h3><p>Her mağaza kendi havale hesabını ve PayTR mağaza numarasını yönetir.</p></div><span>GÜVENLİ YAPILANDIRMA</span></div>
      {canManagePayments?<form action={updatePaymentSettings} className="payment-form">
        <article className="payment-method">
          <div className="payment-title"><div><small>MANUEL ÖDEME</small><h4>Havale / EFT</h4></div><label className="check-inline"><input type="checkbox" name="bank_transfer_enabled" defaultChecked={settings?.bank_transfer_enabled}/><span>Etkin</span></label></div>
          <p>Sipariş sonrası müşteriye banka bilgilerini ve ödeme açıklamasını gösterir. Bu bilgiler havale siparişinde “Siparişiniz alındı” e-postasıyla da gönderilir; mağaza sayfasındaki IBAN ile aynı olmalı.</p>
          <div className="payment-fields">
            <label>Banka adı<input name="bank_name" defaultValue={settings?.bank_name??""} placeholder="Banka adı"/></label>
            <label>Hesap sahibi<input name="bank_account_holder" defaultValue={settings?.bank_account_holder??""} placeholder="Şirket veya kişi adı"/></label>
            <label className="wide">IBAN<input name="bank_iban" defaultValue={settings?.bank_iban??""} placeholder="TR00 0000 0000 0000 0000 0000 00" maxLength={32}/></label>
            <label className="wide">Müşteriye gösterilecek açıklama<textarea name="bank_transfer_instructions" defaultValue={settings?.bank_transfer_instructions??""} placeholder="Sipariş numaranızı havale açıklamasına yazınız." rows={3}/></label>
          </div>
        </article>
        <article className="payment-method paytr-method">
          <div className="payment-title"><div><small>KARTLA ÖDEME</small><h4>PayTR iFrame API</h4></div><label className="check-inline"><input type="checkbox" name="paytr_enabled" defaultChecked={settings?.paytr_enabled}/><span>Etkin</span></label></div>
          <p>Kart bilgileri ArvoARC sunucularına gelmeden PayTR’ın güvenli ödeme ekranında işlenir.</p>
          <div className="payment-fields">
            <label className="wide">Mağaza numarası<input name="paytr_merchant_id" defaultValue={settings?.paytr_merchant_id??""} placeholder="PayTR merchant_id" autoComplete="off"/></label>
            <label>En yüksek taksit<DurumSecici name="paytr_max_installment" etiket="En yüksek taksit" bicim="alan" gonder={false} deger={String(settings?.paytr_max_installment??0)} secenekler={[{deger:"0",etiket:"PayTR belirlesin"},...[1,2,3,4,5,6,9,12].map((value)=>({deger:String(value),etiket:`${value} taksit`}))]}/></label>
            <label>Mağaza anahtarı (merchant_key)<input name="paytr_merchant_key" type="password" placeholder={keysStored?"Kayıtlı · değiştirmek için yazın":"PayTR merchant_key"} autoComplete="new-password"/></label>
            <label>Mağaza salt (merchant_salt)<input name="paytr_merchant_salt" type="password" placeholder={keysStored?"Kayıtlı · değiştirmek için yazın":"PayTR merchant_salt"} autoComplete="new-password"/></label>
            <div className="check-stack"><label className="check-inline"><input type="checkbox" name="paytr_test_mode" defaultChecked={settings?.paytr_test_mode??true}/> Test modu</label><label className="check-inline"><input type="checkbox" name="paytr_no_installment" defaultChecked={settings?.paytr_no_installment}/> Taksiti kapat</label></div>
          </div>
          <div className="security-note"><b>{keysStored?"Anahtarlarınız kayıtlı.":"Tahsilat kendi PayTR hesabınıza yapılır."}</b><p>Anahtar ve salt şifrelenerek saklanır, hiçbir ekranda geri gösterilmez. Değiştirmek için yeniden yazmanız yeterli; boş bırakırsanız kayıtlı olan korunur.</p><code>{`https://${callbackHost}/api/storefront/paytr-bildirim`}</code></div>
        </article>
        {/*
          TAMİ ORTAK ÖDEME SAYFASI. Kart yine bizim sunucumuza uğramıyor:
          müşteri Tami'nin sayfasında ödüyor, Masterpass da orada.
          Doğrudan 3D API'si kart verisini bizim isteğimizde taşıyordu ve
          bilerek seçilmedi.
        */}
        <article className="payment-method">
          <div className="payment-title"><div><small>KARTLA ÖDEME</small><h4>Garanti BBVA Sanal POS</h4></div><label className="check-inline"><input type="checkbox" name="garanti_enabled" defaultChecked={settings?.garanti_enabled}/><span>Etkin</span></label></div>
          <p>Kart bilgileri ArvoARC sunucularına gelmeden bankanın 3D ödeme sayfasında işlenir (3D Pay Hosting).</p>
          <div className="payment-fields">
            <label>İşyeri (firma) kodu<input name="garanti_isyeri_no" inputMode="numeric" defaultValue={settings?.garanti_isyeri_no??""} placeholder="bankanın verdiği firma kodu" autoComplete="off"/></label>
            <label>Terminal numarası<input name="garanti_terminal_no" inputMode="numeric" defaultValue={settings?.garanti_terminal_no??""} placeholder="ör. 30691297" autoComplete="off"/></label>
            {/*
              PROVAUT tahsilat, PROVRFN iptal/iade kullanıcısı. İade
              şifresi ZORUNLU DEĞİL: girilmezse tahsilat çalışır,
              yalnızca panelden iade yapılamaz. Zorunlu tutmak, iadeyi
              henüz tanımlamamış bir mağazanın kartlı ödemesini hiç
              açmamak olurdu.
            */}
            <label>PROVAUT şifresi<input name="garanti_provizyon_sifresi" type="password" placeholder={garantiKeysStored?"Kayıtlı · değiştirmek için yazın":"tahsilat kullanıcısının şifresi"} autoComplete="new-password"/></label>
            <label>3D anahtarı (StoreKey)<input name="garanti_magaza_anahtari" type="password" placeholder={garantiKeysStored?"Kayıtlı · değiştirmek için yazın":"banka panelinden"} autoComplete="new-password"/></label>
            <label>PROVRFN şifresi <small>(iade için)</small><input name="garanti_iade_sifresi" type="password" placeholder={settings?.garanti_iade_sifresi_enc?"Kayıtlı · değiştirmek için yazın":"girilmezse panelden iade yapılamaz"} autoComplete="new-password"/></label>
            {/*
              HASH SÜRÜMÜ TAHMİN EDİLMİYOR. Üye işyeri hesabına göre
              değişiyor ve yanlış seçim HER ödemenin "hash hatalı" ile
              dönmesi demek; banka hangi alanın uymadığını söylemiyor.
              Doğru değer bankanın entegrasyon belgesinde yazıyor.
            */}
            <label>Hash sürümü
              <DurumSecici name="garanti_api_surumu" etiket="Hash sürümü" bicim="alan" gonder={false} deger={settings?.garanti_api_surumu??"v512"} secenekler={[{deger:"v512",etiket:"512 — SHA512 (yeni hesaplar)"},{deger:"v0.01",etiket:"v0.01 — SHA1 (eski hesaplar)"}]}/>
            </label>
            <label>Güvenlik düzeyi<input name="garanti_guvenlik_duzeyi" defaultValue={settings?.garanti_guvenlik_duzeyi??"3D_PAY_HOSTING"} placeholder="3D_PAY_HOSTING" autoComplete="off"/></label>
            <div className="check-stack">
              <label className="check-inline"><input type="checkbox" name="garanti_test_mode" defaultChecked={settings?.garanti_test_mode??true}/> Test modu (sandbox)</label>
              {/*
                Kart ya da banka 3D'ye kayıtlı değilse doğrulama "yarı
                güvenli" bitiyor ama provizyon yine yapılıyor.
                Reddetmek, parası çekilmiş müşterinin siparişini
                açmamak; kabul etmek ters ibraz riskini işyerine almak.
                Karar mağazanın.
              */}
              <label className="check-inline"><input type="checkbox" name="garanti_yari_guvenli_kabul" defaultChecked={settings?.garanti_yari_guvenli_kabul??false}/> 3D’ye kayıtlı olmayan kartları da kabul et (ters ibraz riski işyerinde)</label>
            </div>
          </div>
          {/*
            HANGİSİ ÖNCE. Yedeğe düşme yalnızca ödeme oturumu açılırken
            geçerli: müşteri ödeme sayfasına düştükten sonra ikinci bir
            sağlayıcıda oturum açılmaz, yoksa çift çekim riski doğar.
          */}
          <div className="payment-fields">
            <label className="wide">Kartla ödemede önce hangisi denensin
              <DurumSecici name="odeme_saglayicisi" etiket="Kartla ödemede önce hangisi denensin" bicim="alan" gonder={false} deger={settings?.odeme_saglayicisi??"paytr"} secenekler={[{deger:"paytr",etiket:"PayTR (Garanti yedek)"},{deger:"garanti",etiket:"Garanti Sanal POS (PayTR yedek)"}]}/>
            </label>
          </div>
          <div className="security-note"><b>{garantiKeysStored?"Anahtarlarınız kayıtlı.":"Tahsilat kendi Garanti üye işyerinize yapılır."}</b><p>PROVAUT/PROVRFN şifreleri ve 3D anahtarı şifrelenerek saklanır, hiçbir ekranda geri gösterilmez. Değiştirmek için yeniden yazmanız yeterli; boş bırakırsanız kayıtlı olan korunur. Seçilen sağlayıcı hazır değilse ödeme öteki sağlayıcıyla açılır.</p></div>
        </article>
        <article className="payment-method">
          <div className="payment-title"><div><small>MÜŞTERİ E-POSTALARI</small><h4>Gönderen adresi</h4></div></div>
          <p>Sipariş onayı, kargo bildirimi ve şifre sıfırlama e-postaları bu adresten gider. Boş bırakılırsa platformun varsayılan adresi kullanılır.</p>
          <div className="payment-fields">
            <label className="wide">Gönderen<input name="email_from" defaultValue={settings?.email_from??""} placeholder="Mağaza Adı &lt;siparis@alanadiniz.com&gt;" autoComplete="off"/></label>
            <label className="wide">Yanıt adresi<input name="email_reply_to" type="email" defaultValue={settings?.email_reply_to??""} placeholder="info@alanadiniz.com" autoComplete="off"/></label>
          </div>
          <div className="security-note"><b>Önce alan adınızı doğrulatın.</b><p>E-posta sağlayıcısı, sahipliğini kanıtlamadığınız bir alan adından gönderim yapmaz. Doğrulama tamamlanmadan bu alanı doldurursanız e-postalar gönderilemez ve müşterileriniz sipariş onayı alamaz. Alan adı doğrulaması için bizimle iletişime geçin.</p></div>
        </article>
        <button className="panel-primary payment-save" type="submit">Ödeme ayarlarını kaydet</button>
      </form>:<p className="list-hint">{yetkiYok("ödeme hesapları (IBAN, PayTR)", "sahiplik")}</p>}
    </section>
    </>:null}

    {bolum==="entegrasyon"?<>
    {/*
      ENTEGRASYONLAR — WHATSAPP NUMARASI.

      Numara kaydı ArvoOS'ta duruyor (gönderim kapısı onu oradan
      buluyor, erişim anahtarı ArvoOS'un şifreleme anahtarıyla
      saklanıyor) ama bağlama ekranı BURADA olmak zorunda: ArvoARC
      hizmeti alan müşterinin ArvoOS paneli olmayabilir ve o müşteri
      numarasını hiçbir yerden bağlayamıyordu — sipariş bildirimleri
      kendisine kapalı kalıyordu (17.10.2026).

      Erişim anahtarı hiçbir yerde gösterilmiyor; kayıtlı olup
      olmadığı bile yalnızca "bağlı" bilgisinden anlaşılıyor.
    */}
    <section className="panel-card settings-section payment-section">
      <div className="head"><div><small>MESAJLAŞMA</small><h3>WhatsApp numarası</h3><p>Sipariş durumu bildirimleri bu numaradan gider. Müşteri mesajı mağazanızın adıyla alır.</p></div><span>MAĞAZAYA ÖZEL</span></div>
      {!canManagePayments
        ?<p className="list-hint">{yetkiYok("WhatsApp numarası", "sahiplik")}</p>
        :!whatsappKapisiVar()
          ?<p className="list-hint">ArvoOS köprüsü bu kurulumda tanımlı değil (<code>ARVOOS_BRIDGE_URL</code>, <code>PRODUCT_BRIDGE_SECRET</code>). Bölüm bağlanamaz.</p>
          :whatsapp&&!whatsapp.tamam
            ?<p className="list-hint">Durum okunamadı: {whatsapp.hata}</p>
            :<>
              {whatsapp?.tamam&&whatsapp.durum?.connected
                ?<article className="payment-method">
                  <div className="payment-title"><div><small>BAĞLI NUMARA</small><h4>{whatsapp.durum.displayPhone??"—"}</h4></div><span className="list-hint">{whatsapp.durum.verifiedName??""}</span></div>
                  <p>
                    Durum: <b>{whatsapp.durum.status==="connected"?"Bağlı":whatsapp.durum.status==="disabled"?"Devre dışı":"Doğrulanmadı"}</b>
                    {whatsapp.durum.lastError?<> · Son hata: {whatsapp.durum.lastError}</>:null}
                  </p>
                  {/* İki ayrı form: "sına" ve "kaldır" aynı formda olsaydı
                      Enter tuşu hangisini çalıştıracağı belirsiz kalırdı. */}
                  <div className="payment-fields">
                    <form action={verifyWhatsappNumber}><button className="panel-secondary" type="submit">Bağlantıyı sına</button></form>
                    <form action={removeWhatsappNumber}><button className="panel-secondary" type="submit">Bağlantıyı kaldır</button></form>
                  </div>
                </article>
                :<p className="list-hint">Numara bağlı değil. Bildirimler gönderilmiyor.</p>}

              <form action={saveWhatsappNumber} className="payment-form">
                <article className="payment-method">
                  <div className="payment-title"><div><small>META BİLGİLERİ</small><h4>{whatsapp?.tamam&&whatsapp.durum?.connected?"Numarayı değiştir":"Numarayı bağla"}</h4></div></div>
                  <p>Değerleri Meta for Developers → WhatsApp → <b>API Setup</b> ekranından alırsınız. Erişim anahtarı kaydedilirken Meta’ya doğrulatılır; yanlışsa kaydedilmez.</p>
                  <div className="payment-fields">
                    <label>WhatsApp İşletme Hesabı kimliği (WABA ID)<input name="waba_id" inputMode="numeric" placeholder="1627688618463162" defaultValue={whatsapp?.tamam?whatsapp.durum?.wabaId??"":""}/></label>
                    <label>Telefon numarası kimliği (Phone number ID)<input name="phone_number_id" inputMode="numeric" placeholder="1177709272083942" defaultValue={whatsapp?.tamam?whatsapp.durum?.phoneNumberId??"":""}/></label>
                    <label className="wide">Kalıcı erişim anahtarı
                      {/* Kayıtlı anahtar GÖSTERİLMİYOR, yalnızca yeniden
                          yazılabiliyor: ArvoOS onu şifreli saklıyor ve
                          hiçbir yanıtta döndürmüyor. */}
                      <input name="access_token" type="password" autoComplete="new-password" placeholder={whatsapp?.tamam&&whatsapp.durum?.connected?"Kayıtlı · değiştirmek için yazın":"System User ile üretilen kalıcı token"}/>
                    </label>
                  </div>
                  <p className="list-hint">Anahtar yalnızca ArvoOS’ta şifreli saklanır; bu panelde ve günlüklerde hiçbir zaman görünmez.</p>
                </article>
                <button className="panel-primary payment-save" type="submit">WhatsApp numarasını kaydet</button>
              </form>
            </>}
    </section>
    </>:null}

    {bolum==="eposta"?<>
    {/*
      E-POSTA ŞABLONLARI.

      Metinler kodda sabitti; çok kiracılı bir sistemde bu yetmiyor —
      bir mağaza "Siparişiniz kargoya verildi" derken öteki kendi ses
      tonunu kurmak istiyor ve bunun için dağıtım gerekiyordu.

      KİRACI METNİ DÜZENLER, HTML'İ DÜZENLEMEZ: zarf (logo, renk,
      buton, altbilgi) kodda kalıyor, buradan gelen metin kaçırılarak
      basılıyor. Serbest HTML bir yazım hatasıyla postayı bozar ve
      müşteriye giden bir yüzeye kod enjekte etme kapısı açardı.

      BOŞ BIRAKMAK = VARSAYILAN. Kutular boşken koddaki metin gidiyor;
      tablo boş olan her mağaza bugünkü postaları almaya devam ediyor.
    */}
    <section className="panel-card settings-section">
      <div className="head"><div><small>MÜŞTERİ POSTALARI</small><h3>E-posta şablonları</h3><p>Boş bıraktığınız alanlarda varsayılan metin kullanılır. Logo, renk ve buton gibi görsel düzen değişmez.</p></div><span>MAĞAZAYA ÖZEL</span></div>
      {canManage?<>
        <p className="list-hint">
          Kullanabileceğiniz değişkenler:{" "}
          {Object.entries(DEGISKENLER).map(([ad,aciklama],i)=>
            <span key={ad}>{i>0?" · ":""}<code>{`{${ad}}`}</code> {aciklama}</span>)}
        </p>
        {Object.entries(SABLON_KAYDI).map(([anahtar,tanim])=>{
          const kayit=sablonKayitlari.get(anahtar)??null;
          /* Önizleme: kiracının yazdığı metin yoksa varsayılan görünür,
             böylece "ne gidecek" sorusu kutular boşken de yanıtlı. */
          const etkin=sablonuCoz(anahtar,kayit)!;
          const ozel=Boolean((kayit?.baslik??"").trim()||(kayit?.govde??"").trim());
          return <form key={anahtar} action={saveEmailTemplate} className="settings-form eposta-sablon">
            <input type="hidden" name="template_key" value={anahtar}/>
            <div className="eposta-sablon-bas">
              <div><h4>{tanim.ad}</h4><p className="list-hint">{tanim.aciklama}</p></div>
              <span className="list-hint">{ozel?"Özel metin":"Varsayılan"}</span>
            </div>
            <label>Konu<input name="subject" defaultValue={kayit?.baslik??""} placeholder={tanim.varsayilan.baslik} maxLength={200}/></label>
            <label>Gövde<textarea name="body" rows={3} defaultValue={kayit?.govde??""} placeholder={tanim.varsayilan.govde} maxLength={2000}/></label>
            <p className="list-hint eposta-onizleme"><b>{etkin.baslik}</b><br/>{etkin.govde}</p>
            <div className="eposta-sablon-eylem">
              <button className="panel-primary" type="submit">Kaydet</button>
              {/* Boş kaydetmek varsayılana döndürüyor; ayrı bir "sıfırla"
                  düğmesi yerine kutuları boşaltmak yeterli ve açık. */}
              <span className="list-hint">Varsayılana dönmek için alanları boşaltıp kaydedin.</span>
            </div>
          </form>;
        })}
      </>:<p className="list-hint">{yetkiYok("e-posta şablonları", "yonetim")}</p>}
    </section>
    </>:null}

    {bolum==="sayfalar"?<>
    {/*
      TANITIM SAYFALARI.

      Metinler kodda sabitti ve ArvoCulture'ın kendi anlatısıydı.
      İkinci bir kiracı o sayfalarla yayına GİREMEZ: müşterisine
      başka bir markanın hikâyesini gösterir.

      VARSAYILAN METİN BURADA GÖSTERİLMİYOR, çünkü elimizde değil —
      sayfaları çizen yer vitrin ve varsayılan orada duruyor.
      Buraya kopyalasaydık ikisi ayrışır, paneldeki önizleme ile
      müşterinin gördüğü sayfa farklı olurdu.
    */}
    <section className="panel-card settings-section">
      <div className="head"><div><small>MAĞAZA VİTRİNİ</small><h3>Sayfalar</h3><p>Hakkımızda, SSS ve iletişim sayfalarının metni. Boş bıraktığınız sayfada genel bir metin görünür.</p></div><span>MAĞAZAYA ÖZEL</span></div>
      {canManage?<>
        <p className="list-hint">Sayfanın düzeni, başlıkları ve bağlantıları değişmez; yalnızca metin sizindir. Biçimlendirme etiketi yazmayın, olduğu gibi görünür.</p>
        {Object.entries(SAYFA_KAYDI).map(([anahtar,tanim])=>{
          const kayit=sayfaKayitlari.get(anahtar)??null;
          const ozel=Boolean((kayit?.baslik??"").trim()||(kayit?.govde??"").trim());
          return <form key={anahtar} action={saveStorePage} className="settings-form eposta-sablon">
            <input type="hidden" name="page_key" value={anahtar}/>
            <div className="eposta-sablon-bas">
              <div><h4>{tanim.ad}</h4><p className="list-hint">{tanim.aciklama}</p></div>
              <span className="list-hint">{ozel?"Özel metin":"Varsayılan"}</span>
            </div>
            <label>Sayfa başlığı<input name="title" defaultValue={kayit?.baslik??""} placeholder={tanim.ad} maxLength={BASLIK_SINIRI}/></label>
            <label>Metin<textarea name="body" rows={tanim.satir} defaultValue={kayit?.govde??""} maxLength={GOVDE_SINIRI}/></label>
            {tanim.ipucu&&<p className="list-hint">{tanim.ipucu}</p>}
            <div className="eposta-sablon-eylem">
              <button className="panel-primary" type="submit">Kaydet</button>
              <span className="list-hint">Varsayılana dönmek için alanları boşaltıp kaydedin.</span>
            </div>
          </form>;
        })}
      </>:<p className="list-hint">{yetkiYok("mağaza sayfaları", "yonetim")}</p>}
    </section>
    </>:null}
    </div>
  </main>;
}
