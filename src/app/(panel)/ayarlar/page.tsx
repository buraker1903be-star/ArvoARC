import { requireTenant } from "@/lib/tenant";
import { Notice } from "@/components/panel/notice";
import { removeBrandAsset,updatePanelDomainSettings,updatePaymentSettings,updateSalesSettings,updateStorefrontDomainSettings,updateStoreSettings,uploadBrandAsset,verifyPanelDomain,verifyStorefrontDomain } from "./actions";
import "../catalog.css";

const statusLabel:Record<string,string>={not_configured:"Bağlı değil",pending_dns:"DNS bekleniyor",verifying:"Doğrulanıyor",active:"Aktif",failed:"Bağlantı hatası"};

const SAVED:Record<string,string>={
  general:"Marka ayarları kaydedildi.",
  sales:"Satış ayarları kaydedildi.",
  payments:"Ödeme ayarları kaydedildi.",
  logo:"Logo yüklendi.",
  favicon:"Favicon yüklendi.",
  "logo-removed":"Logo kaldırıldı.",
  "favicon-removed":"Favicon kaldırıldı.",
  "panel-domain":"Panel alan adı kaydedildi. DNS kaydını ekleyip doğrulayın.",
  domain:"Mağaza alan adı kaydedildi.",
  "panel-domain-verified":"Panel alan adı doğrulandı; güvenli bağlantı etkin.",
  "storefront-domain-verified":"Mağaza alan adı doğrulandı; güvenli bağlantı etkin.",
};
const ERRORS:Record<string,string>={
  forbidden:"Bu ayarları değiştirmek için yönetici yetkisi gerekir.",
  "invalid-bank-transfer":"Havale için banka adı, hesap sahibi ve TR ile başlayan 26 haneli IBAN gerekli.",
  "paytr-merchant-required":"PayTR’ı açmak için mağaza numarası gerekli.",
  "invalid-installment":"Taksit sayısı 0 ile 12 arasında olmalı.",
  "invalid-email-sender":"Gönderen adresi geçersiz. Ya düz adres yazın (siparis@alanadiniz.com) ya da \"Mağaza Adı <siparis@alanadiniz.com>\" biçiminde.",
  "file-required":"Bir dosya seçin.",
  "invalid-brand-file":"Dosya türü veya boyutu uygun değil.",
  "settings-required":"Önce marka ayarlarını kaydedin.",
  "invalid-asset":"Geçersiz dosya.",
  "invalid-panel-domain":"Geçerli bir alan adı girin (örn. app.markaniz.com).",
  "panel-storefront-domain-conflict":"Panel ve mağaza aynı alan adını kullanamaz.",
  "invalid-domain":"Geçerli bir alan adı girin (örn. markaniz.com).",
  "invalid-subdomain":"Alt alan adı yalnızca küçük harf, rakam ve tire içerebilir.",
  "domain-required":"Alt alan adı veya özel alan adı girin.",
  "panel-domain-required":"Önce panel alan adını kaydedin.",
  /* Kimin kullandığı söylenmez: mağazalar birbirinin varlığını öğrenmemeli. */
  "domain-in-use":"Bu alan adı başka bir mağazada kullanılıyor. Size ait olduğunu düşünüyorsanız bize bildirin.",
  "invalid-order-prefix":"Sipariş öneki 1-6 harf olmalı (rakam ve işaret olmaz). Örnek: AC.",
  "invalid-shipping-fee":"Kargo ücreti 0 ile 100.000 ₺ arasında olmalı.",
  "invalid-free-threshold":"Ücretsiz kargo eşiği 0 ile 1.000.000 ₺ arasında olmalı.",
  "invalid-transfer-discount":"Havale indirimi %0 ile %100 arasında olmalı.",
  "order-prefix-in-use":"Bu sipariş öneki başka bir mağazada kullanılıyor. Sipariş numaraları çakışmasın diye önek mağazaya özel olmalı.",
};
/* DNS kaydı henüz yayılmadıysa hata değil, bekleme durumu. */
const PENDING:Record<string,string>={
  "panel-dns-not-ready":"Panel DNS kaydı henüz görünmüyor. Kaydın yayılması birkaç dakika sürebilir; sonra tekrar doğrulayın.",
  "storefront-dns-not-ready":"Mağaza DNS kaydı henüz görünmüyor. Kaydın yayılması birkaç dakika sürebilir; sonra tekrar doğrulayın.",
};

export default async function Settings({searchParams}:{searchParams:Promise<{saved?:string;error?:string}>}){
  const query=await searchParams;const {supabase,organization,membership}=await requireTenant();
  const {data:settings,error}=await supabase.from("arc_store_settings").select("store_name,storefront_url,currency,locale,low_stock_threshold,logo_path,favicon_path,primary_color,accent_color,custom_domain,platform_subdomain,domain_status,domain_verified_at,panel_custom_domain,panel_domain_status,panel_domain_verified_at,bank_transfer_enabled,bank_name,bank_account_holder,bank_iban,bank_transfer_instructions,paytr_enabled,paytr_test_mode,paytr_merchant_id,paytr_no_installment,paytr_max_installment,paytr_merchant_key_enc,email_from,email_reply_to,order_prefix,shipping_fee,free_shipping_threshold,bank_transfer_discount_percent").eq("organization_id",organization.id).maybeSingle();
  if(error)throw new Error(error.message);
  const canManage=["owner","admin","manager"].includes(membership.role);
  // Anahtarın kendisi hiç okunmaz; yalnızca kayıtlı olup olmadığı gösterilir.
  const keysStored=Boolean(settings?.paytr_merchant_key_enc);
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
  const callbackHost=panelDomainStatus==="verified"&&settings?.panel_custom_domain?settings.panel_custom_domain:"arc.arvo-os.com";
  return <>
    <section className="ac-bar"><div><h1>Mağaza Ayarları</h1><p>Marka kimliği, alan adları ve ödeme yöntemleri.</p></div></section>

    <div className="ac-stack">
    {query.saved?<Notice title={SAVED[query.saved]??"Mağaza ayarları kaydedildi."}/>:null}
    {query.error&&PENDING[query.error]?<Notice tone="warn" title="DNS doğrulaması bekliyor">{PENDING[query.error]}</Notice>:null}
    {query.error&&!PENDING[query.error]?<Notice tone="error" title="Ayarlar kaydedilemedi">{ERRORS[query.error]??query.error}</Notice>:null}

    <div className="settings-layout">
      <section className="card settings-section">
        <div className="head"><div><small>MARKA KİMLİĞİ</small><h3>Logo ve görünüm</h3></div><span>{organization.plan_code}</span></div>
        <div className="brand-assets-grid">
          <article className="brand-asset">
            <div className="brand-preview logo-preview" role="img" aria-label="Mağaza logosu" style={logoUrl?{backgroundImage:`url("${logoUrl}")`}:undefined}>{!logoUrl&&<b>LOGO</b>}</div>
            <div><strong>Mağaza logosu</strong><small>PNG, JPG veya WEBP · en fazla 4 MB</small></div>
            {canManage&&<><form action={uploadBrandAsset}><input type="hidden" name="kind" value="logo"/><input name="file" type="file" accept="image/png,image/jpeg,image/webp" required/><button type="submit">Logo yükle</button></form>{logoUrl&&<form action={removeBrandAsset}><input type="hidden" name="kind" value="logo"/><button className="danger-button" type="submit">Logoyu kaldır</button></form>}</>}
          </article>
          <article className="brand-asset">
            <div className="brand-preview favicon-preview" role="img" aria-label="Mağaza faviconu" style={faviconUrl?{backgroundImage:`url("${faviconUrl}")`}:undefined}>{!faviconUrl&&<b>F</b>}</div>
            <div><strong>Favicon</strong><small>PNG, WEBP veya ICO · en fazla 1 MB</small></div>
            {canManage&&<><form action={uploadBrandAsset}><input type="hidden" name="kind" value="favicon"/><input name="file" type="file" accept="image/png,image/webp,image/x-icon,image/vnd.microsoft.icon" required/><button type="submit">Favicon yükle</button></form>{faviconUrl&&<form action={removeBrandAsset}><input type="hidden" name="kind" value="favicon"/><button className="danger-button" type="submit">Faviconu kaldır</button></form>}</>}
          </article>
        </div>

        {canManage?<form action={updateStoreSettings} className="settings-form">
          <label>Mağaza adı<input name="store_name" defaultValue={settings?.store_name??organization.name} required maxLength={160}/></label>
          <label>Yayınlanan mağaza<span className="readonly-field">{settings?.storefront_url??"Henüz tanımlanmadı"}</span></label>
          <label>Ana marka rengi<span className="color-input"><input name="primary_color" type="color" defaultValue={settings?.primary_color??"#002045"}/><input value={settings?.primary_color??"#002045"} readOnly aria-label="Ana marka rengi kodu"/></span></label>
          <label>Vurgu rengi<span className="color-input"><input name="accent_color" type="color" defaultValue={settings?.accent_color??"#6f9548"}/><input value={settings?.accent_color??"#6f9548"} readOnly aria-label="Vurgu rengi kodu"/></span></label>
          <label>Para birimi<select name="currency" defaultValue={settings?.currency??"TRY"}><option value="TRY">TRY · Türk Lirası</option><option value="USD">USD · ABD Doları</option><option value="EUR">EUR · Euro</option></select></label>
          <label>Dil / bölge<select name="locale" defaultValue={settings?.locale??"tr-TR"}><option value="tr-TR">Türkçe · Türkiye</option><option value="en-US">English · United States</option></select></label>
          <label>Düşük stok eşiği<input name="low_stock_threshold" type="number" min="0" max="10000" step="1" defaultValue={settings?.low_stock_threshold??5} required/></label>
          <button type="submit">Marka ayarlarını kaydet</button>
        </form>:<p className="catalog-hint">Bu ayarları değiştirmek için yönetici yetkisi gerekir.</p>}
      </section>

      {/* Satış ayarları: sütunlar vardı ama hiçbir form onları yazmıyordu,
          yani her mağaza ArvoCulture tarifesiyle satıyordu. */}
      <section className="card settings-section">
        <header><h2>Satış ayarları</h2><p>Kargo, ücretsiz kargo eşiği, havale indirimi ve sipariş numarası öneki.</p></header>
        {canManage?<form action={updateSalesSettings} className="settings-form">
          <label>Kargo ücreti (₺)<input name="shipping_fee" type="number" min="0" max="100000" step="0.01" defaultValue={((settings?.shipping_fee??12000)/100).toFixed(2)} required/></label>
          <label>Ücretsiz kargo eşiği (₺)<input name="free_shipping_threshold" type="number" min="0" max="1000000" step="0.01" defaultValue={((settings?.free_shipping_threshold??200000)/100).toFixed(2)} required/></label>
          <label>Havale indirimi (%)<input name="bank_transfer_discount_percent" type="number" min="0" max="100" step="0.1" defaultValue={settings?.bank_transfer_discount_percent??3} required/></label>
          <label>Sipariş numarası öneki<input name="order_prefix" maxLength={6} pattern="[A-Za-z]{1,6}" defaultValue={settings?.order_prefix??"AC"} required/></label>
          <p className="catalog-hint">Sepet tutarı eşiği geçerse kargo alınmaz. Eşik, indirim uygulanmadan önceki ara toplamla karşılaştırılır. Önek her mağazada farklı olmalı: sipariş numaraları çakışırsa ödeme bildirimleri yanlış siparişe düşebilir.</p>
          <button type="submit">Satış ayarlarını kaydet</button>
        </form>:<p className="catalog-hint">Bu ayarları değiştirmek için yönetici yetkisi gerekir.</p>}
      </section>

      <section className="domain-stack">
        <section className="card settings-section domain-section">
          <div className="head"><div><small>YÖNETİM PANELİ</small><h3>Panel alan adı</h3></div><em className={panelDomainStatus}>{statusLabel[panelDomainStatus]??panelDomainStatus}</em></div>
          <p className="domain-explainer"><b>ARVO ARC paneli</b> · Sipariş, ürün, stok ve mağaza yönetimi için kullanılır. Müşteriler bu adresi görmez.</p>
          <div className="domain-current"><small>MARKALI PANEL ADRESİ</small><strong>{settings?.panel_custom_domain??"Henüz tanımlanmadı"}</strong><span>{settings?.panel_domain_verified_at?"SSL ve alan adı doğrulandı":"DNS bağlantısı bekleniyor"}</span></div>
          <div className="domain-platform"><small>ARVO ARC ana paneli</small><strong>arc.arvo-os.com</strong></div>
          {canManage&&<form action={updatePanelDomainSettings} className="domain-form">
            <label>Müşteriye özel panel alan adı<input name="panel_custom_domain" defaultValue={settings?.panel_custom_domain??""} placeholder="app.markaniz.com" required/></label>
            <button type="submit">Panel alan adını kaydet</button>
          </form>}
          {settings?.panel_custom_domain&&panelDomainStatus!=="active"&&<div className="dns-guide">
            <div><span>1</span><p><b>CNAME kaydı</b><code>{settings.panel_custom_domain} → 78128f864bd971a1.vercel-dns-017.com</code></p></div>
            <div><span>2</span><p><b>Vercel doğrulaması</b><small>Alan adı ARVO ARC projesine eklenir ve DNS kaydı kontrol edilir.</small></p></div>
            <div><span>3</span><p><b>Otomatik SSL</b><small>DNS doğrulandıktan sonra güvenli panel bağlantısı etkinleşir.</small></p></div>
            {canManage&&<form action={verifyPanelDomain}><button type="submit">DNS bağlantısını doğrula</button></form>}
          </div>}
        </section>

        <section className="card settings-section domain-section">
          <div className="head"><div><small>E-TİCARET MAĞAZASI</small><h3>Mağaza alan adı</h3></div><em className={domainStatus}>{statusLabel[domainStatus]??domainStatus}</em></div>
          <p className="domain-explainer"><b>Herkese açık mağaza</b> · Ürünlerin, koleksiyonların ve ödeme akışının yayınlandığı müşteri adresidir.</p>
          <div className="domain-current storefront"><small>MAĞAZA ADRESİ</small><strong>{settings?.custom_domain??(settings?.platform_subdomain?`${settings.platform_subdomain}.shop.arvo-os.com`:"Henüz tanımlanmadı")}</strong><span>{settings?.domain_verified_at?"SSL ve alan adı doğrulandı":"DNS bağlantısı bekleniyor"}</span></div>
          {canManage&&<form action={updateStorefrontDomainSettings} className="domain-form">
            <label>ARVO mağaza alt alan adı<div className="domain-input"><input name="storefront_subdomain" defaultValue={settings?.platform_subdomain??""} placeholder="magazaadi" pattern="[a-z0-9-]+"/><span>.shop.arvo-os.com</span></div></label>
            <div className="domain-divider"><span>veya özel alan adı</span></div>
            <label>Mağaza alan adı<input name="storefront_custom_domain" defaultValue={settings?.custom_domain??""} placeholder="markaniz.com"/></label>
            <button type="submit">Mağaza alan adını kaydet</button>
          </form>}
          {settings?.custom_domain&&domainStatus!=="active"&&<div className="dns-guide">
            <div><span>1</span><p><b>Vercel DNS kaydı</b><small>Vercel’in mağaza projesinde göstereceği CNAME veya A kaydını DNS sağlayıcınıza ekleyin.</small></p></div>
            <div><span>2</span><p><b>Mağaza yayını</b><code>https://{settings.custom_domain}</code></p></div>
            <div><span>3</span><p><b>Otomatik SSL</b><small>DNS doğrulandıktan sonra güvenli mağaza bağlantısı etkinleşir.</small></p></div>
            {canManage&&<form action={verifyStorefrontDomain}><button type="submit">DNS bağlantısını doğrula</button></form>}
          </div>}
          <div className="domain-note"><b>Doğru ayrım</b><p><strong>app.arvoculture.com</strong> yönetim panelidir; <strong>arvoculture.com</strong> ise müşterilerin alışveriş yaptığı mağazadır.</p></div>
        </section>
      </section>
    </div>
    <section className="card settings-section payment-section">
      <div className="head"><div><small>ÖDEME ALTYAPISI</small><h3>Ödeme yöntemleri</h3><p>Her mağaza kendi havale hesabını ve PayTR mağaza numarasını yönetir.</p></div><span>GÜVENLİ YAPILANDIRMA</span></div>
      {canManage?<form action={updatePaymentSettings} className="payment-form">
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
          <p>Kart bilgileri ARVO ARC sunucularına gelmeden PayTR’ın güvenli ödeme ekranında işlenir.</p>
          <div className="payment-fields">
            <label className="wide">Mağaza numarası<input name="paytr_merchant_id" defaultValue={settings?.paytr_merchant_id??""} placeholder="PayTR merchant_id" autoComplete="off"/></label>
            <label>En yüksek taksit<select name="paytr_max_installment" defaultValue={settings?.paytr_max_installment??0}><option value="0">PayTR belirlesin</option>{[1,2,3,4,5,6,9,12].map(value=><option key={value} value={value}>{value} taksit</option>)}</select></label>
            <label>Mağaza anahtarı (merchant_key)<input name="paytr_merchant_key" type="password" placeholder={keysStored?"Kayıtlı · değiştirmek için yazın":"PayTR merchant_key"} autoComplete="new-password"/></label>
            <label>Mağaza salt (merchant_salt)<input name="paytr_merchant_salt" type="password" placeholder={keysStored?"Kayıtlı · değiştirmek için yazın":"PayTR merchant_salt"} autoComplete="new-password"/></label>
            <div className="check-stack"><label className="check-inline"><input type="checkbox" name="paytr_test_mode" defaultChecked={settings?.paytr_test_mode??true}/> Test modu</label><label className="check-inline"><input type="checkbox" name="paytr_no_installment" defaultChecked={settings?.paytr_no_installment}/> Taksiti kapat</label></div>
          </div>
          <div className="security-note"><b>{keysStored?"Anahtarlarınız kayıtlı.":"Tahsilat kendi PayTR hesabınıza yapılır."}</b><p>Anahtar ve salt şifrelenerek saklanır, hiçbir ekranda geri gösterilmez. Değiştirmek için yeniden yazmanız yeterli; boş bırakırsanız kayıtlı olan korunur.</p><code>{`https://${callbackHost}/api/storefront/paytr-bildirim`}</code></div>
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
        <button className="payment-save" type="submit">Ödeme ayarlarını kaydet</button>
      </form>:<p className="catalog-hint">Bu ayarları değiştirmek için yönetici yetkisi gerekir.</p>}
    </section>
    </div>
  </>;
}
