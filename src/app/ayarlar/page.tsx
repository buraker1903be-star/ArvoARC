import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { removeBrandAsset,updatePanelDomainSettings,updateStorefrontDomainSettings,updateStoreSettings,uploadBrandAsset } from "./actions";

const statusLabel:Record<string,string>={not_configured:"Bağlı değil",pending_dns:"DNS bekleniyor",verifying:"Doğrulanıyor",active:"Aktif",failed:"Bağlantı hatası"};

export default async function Settings({searchParams}:{searchParams:Promise<{saved?:string;error?:string}>}){
  const query=await searchParams;const {supabase,organization,membership}=await requireTenant();
  const {data:settings,error}=await supabase.from("arc_store_settings").select("store_name,storefront_url,currency,locale,low_stock_threshold,logo_path,favicon_path,primary_color,accent_color,custom_domain,platform_subdomain,domain_status,domain_verified_at,panel_custom_domain,panel_domain_status,panel_domain_verified_at").eq("organization_id",organization.id).maybeSingle();
  if(error)throw new Error(error.message);
  const canManage=["owner","admin","manager"].includes(membership.role);
  const logoUrl=settings?.logo_path?supabase.storage.from("organization-assets").getPublicUrl(settings.logo_path).data.publicUrl:"";
  const faviconUrl=settings?.favicon_path?supabase.storage.from("organization-assets").getPublicUrl(settings.favicon_path).data.publicUrl:"";
  const domainStatus=settings?.domain_status??"not_configured";
  const panelDomainStatus=settings?.panel_domain_status??"not_configured";
  return <Shell active="settings" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small>ARVO ARC · KİRACI AYARLARI</small><h2>Marka ve alan adları</h2><p>Yönetim paneli ile müşterilerin gördüğü mağaza birbirinden bağımsız alan adlarıyla çalışır.</p></div></section>
    {query.saved&&<section className="card settings-flash"><strong>Mağaza ayarları kaydedildi.</strong></section>}
    {query.error&&<section className="card settings-flash error"><strong>Ayarlar kaydedilemedi: {query.error}</strong></section>}

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
          <label>Ana marka rengi<span className="color-input"><input name="primary_color" type="color" defaultValue={settings?.primary_color??"#002045"}/><input value={settings?.primary_color??"#002045"} readOnly/></span></label>
          <label>Vurgu rengi<span className="color-input"><input name="accent_color" type="color" defaultValue={settings?.accent_color??"#6f9548"}/><input value={settings?.accent_color??"#6f9548"} readOnly/></span></label>
          <label>Para birimi<select name="currency" defaultValue={settings?.currency??"TRY"}><option value="TRY">TRY · Türk Lirası</option><option value="USD">USD · ABD Doları</option><option value="EUR">EUR · Euro</option></select></label>
          <label>Dil / bölge<select name="locale" defaultValue={settings?.locale??"tr-TR"}><option value="tr-TR">Türkçe · Türkiye</option><option value="en-US">English · United States</option></select></label>
          <label>Düşük stok eşiği<input name="low_stock_threshold" type="number" min="0" max="10000" step="1" defaultValue={settings?.low_stock_threshold??5} required/></label>
          <button type="submit">Marka ayarlarını kaydet</button>
        </form>:<p>Bu ayarları değiştirmek için yönetici yetkisi gerekir.</p>}
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
          </div>}
          <div className="domain-note"><b>Doğru ayrım</b><p><strong>app.arvoculture.com</strong> yönetim panelidir; <strong>arvoculture.com</strong> ise müşterilerin alışveriş yaptığı mağazadır.</p></div>
        </section>
      </section>
    </div>
  </Shell>;
}
