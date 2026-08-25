import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { publishTheme,saveThemeDraft } from "./actions";

type Theme={announcement?:string;hero_eyebrow?:string;hero_title?:string;hero_emphasis?:string;hero_description?:string;primary_cta_label?:string;primary_cta_href?:string;secondary_cta_label?:string;secondary_cta_href?:string;featured_eyebrow?:string;featured_title?:string;campaign_title?:string;campaign_description?:string;primary_color?:string;accent_color?:string;background_color?:string;typography?:string;hero_style?:string};

const defaults:Theme={announcement:"2.000 TL üzeri ücretsiz kargo • İlk alışverişe ARVO10",hero_eyebrow:"ARVOCULTURE · APPAREL & BEAUTY",hero_title:"Seçtiğin şey,",hero_emphasis:"senin hikâyen.",hero_description:"Tarzını, bakımını ve gündelik ritüellerini tek bir kültürde buluşturan özgün seçkiler.",primary_cta_label:"Giyimi keşfet",primary_cta_href:"/koleksiyon/giyim",secondary_cta_label:"Bakımı keşfet",secondary_cta_href:"/koleksiyon/bakim",featured_eyebrow:"ÖNE ÇIKANLAR",featured_title:"Şimdi keşfet.",campaign_title:"İlk seçimine özel.",campaign_description:"İlk siparişinde ARVO10 koduyla %10 indirim.",primary_color:"#111210",accent_color:"#D9FF43",background_color:"#F5F2EC",typography:"editorial",hero_style:"editorial-orbs"};

export default async function ThemeEditor({searchParams}:{searchParams:Promise<{saved?:string;published?:string;error?:string}>}){
  const query=await searchParams;const {supabase,organization,membership}=await requireTenant();
  const {data:themes,error}=await supabase.from("arc_store_themes").select("mode,version,config,published_at,updated_at").eq("organization_id",organization.id);
  if(error)throw new Error(error.message);
  const draftRow=themes?.find(theme=>theme.mode==="draft");const publishedRow=themes?.find(theme=>theme.mode==="published");
  const theme={...defaults,...((draftRow?.config??{}) as Theme)};
  const canManage=["owner","admin","manager"].includes(membership.role);
  return <Shell active="theme" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small>VİTRİN · TEMA STÜDYOSU</small><h2>Tema Düzenleyici</h2><p>Ana sayfanın metinlerini, renklerini ve görsel karakterini taslak olarak hazırlayın; ön izlemeden sonra tek işlemle mağazaya yayınlayın.</p></div></section>
    {query.saved&&<section className="card theme-flash"><strong>Tema taslağı kaydedildi.</strong></section>}
    {query.published&&<section className="card theme-flash"><strong>Tema mağazaya yayınlandı. Vitrin kısa süre içinde güncellenecek.</strong></section>}
    {query.error&&<section className="card theme-flash error"><strong>İşlem tamamlanamadı: {query.error}</strong></section>}

    <div className="theme-status">
      <article><small>TASLAK</small><strong>v{draftRow?.version??1}</strong><span>{draftRow?.updated_at?new Date(draftRow.updated_at).toLocaleString("tr-TR"):"Hazır"}</span></article>
      <article><small>YAYINDA</small><strong>v{publishedRow?.version??1}</strong><span>{publishedRow?.published_at?new Date(publishedRow.published_at).toLocaleString("tr-TR"):"Henüz yayınlanmadı"}</span></article>
      {canManage&&<form action={publishTheme}><button type="submit">Taslağı mağazaya yayınla →</button></form>}
    </div>

    <div className="theme-editor-layout">
      <section className="card theme-controls">
        <div className="head"><div><small>İÇERİK VE STİL</small><h3>Ana sayfa ayarları</h3></div><span>Taslak</span></div>
        {canManage?<form action={saveThemeDraft}>
          <fieldset><legend>Duyuru bandı</legend><label>Duyuru metni<input name="announcement" defaultValue={theme.announcement}/></label></fieldset>
          <fieldset><legend>Hero alanı</legend><label>Üst etiket<input name="hero_eyebrow" defaultValue={theme.hero_eyebrow}/></label><div className="theme-two"><label>Ana başlık<input name="hero_title" defaultValue={theme.hero_title} required/></label><label>Vurgulu başlık<input name="hero_emphasis" defaultValue={theme.hero_emphasis}/></label></div><label>Açıklama<textarea name="hero_description" rows={4} defaultValue={theme.hero_description} required/></label><div className="theme-two"><label>Birinci buton<input name="primary_cta_label" defaultValue={theme.primary_cta_label}/></label><label>Bağlantısı<input name="primary_cta_href" defaultValue={theme.primary_cta_href}/></label><label>İkinci buton<input name="secondary_cta_label" defaultValue={theme.secondary_cta_label}/></label><label>Bağlantısı<input name="secondary_cta_href" defaultValue={theme.secondary_cta_href}/></label></div></fieldset>
          <fieldset><legend>Katalog ve kampanya</legend><div className="theme-two"><label>Öne çıkan etiketi<input name="featured_eyebrow" defaultValue={theme.featured_eyebrow}/></label><label>Öne çıkan başlığı<input name="featured_title" defaultValue={theme.featured_title}/></label></div><label>Kampanya başlığı<input name="campaign_title" defaultValue={theme.campaign_title}/></label><label>Kampanya açıklaması<textarea name="campaign_description" rows={3} defaultValue={theme.campaign_description}/></label></fieldset>
          <fieldset><legend>Görsel sistem</legend><div className="theme-color-grid"><label>Ana renk<input name="primary_color" type="color" defaultValue={theme.primary_color}/></label><label>Vurgu rengi<input name="accent_color" type="color" defaultValue={theme.accent_color}/></label><label>Arka plan<input name="background_color" type="color" defaultValue={theme.background_color}/></label></div><div className="theme-two"><label>Tipografi<select name="typography" defaultValue={theme.typography}><option value="editorial">Editorial</option><option value="modern">Modern</option><option value="minimal">Minimal</option></select></label><label>Hero düzeni<select name="hero_style" defaultValue={theme.hero_style}><option value="editorial-orbs">Editorial Orbs</option><option value="split">Bölünmüş vitrin</option><option value="minimal">Minimal</option></select></label></div></fieldset>
          <div className="product-editor-actions"><span>Kaydetmek canlı mağazayı değiştirmez.</span><button type="submit">Taslağı kaydet</button></div>
        </form>:<p>Temayı değiştirmek için yönetici yetkisi gerekir.</p>}
      </section>

      <section className="theme-preview-wrap">
        <div className="theme-preview-bar"><span><i></i><i></i><i></i></span><b>Masaüstü ön izleme</b><a href="/magaza" target="_blank">Canlı mağaza ↗</a></div>
        <div className={`theme-preview ${theme.typography} ${theme.hero_style}`} style={{"--preview-ink":theme.primary_color,"--preview-accent":theme.accent_color,"--preview-paper":theme.background_color} as React.CSSProperties}>
          <div className="preview-announcement">{theme.announcement}</div>
          <div className="preview-header"><b>ARVOCULTURE</b><span>GİYİM&nbsp;&nbsp; BAKIM&nbsp;&nbsp; PARFÜM</span><em>SEPET</em></div>
          <div className="preview-hero"><div><small>{theme.hero_eyebrow}</small><h3>{theme.hero_title}<em>{theme.hero_emphasis}</em></h3><p>{theme.hero_description}</p><span><b>{theme.primary_cta_label}</b><b>{theme.secondary_cta_label}</b></span></div><aside><i>AC</i></aside></div>
          <div className="preview-featured"><small>{theme.featured_eyebrow}</small><h4>{theme.featured_title}</h4><div><i></i><i></i><i></i></div></div>
        </div>
      </section>
    </div>
  </Shell>;
}
