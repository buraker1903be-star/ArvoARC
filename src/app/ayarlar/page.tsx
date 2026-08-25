import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { updateStoreSettings } from "./actions";

export default async function Settings({searchParams}:{searchParams:Promise<{saved?:string;error?:string}>}){
  const query=await searchParams;const {supabase,organization,membership}=await requireTenant();
  const {data:settings,error}=await supabase.from("arc_store_settings").select("store_name,storefront_url,currency,locale,low_stock_threshold").eq("organization_id",organization.id).maybeSingle();
  if(error)throw new Error(error.message);
  const canManage=["owner","admin","manager"].includes(membership.role);
  return <Shell active="settings" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small>MAĞAZA · KİRACI AYARLARI</small><h2>Mağaza Ayarları</h2><p>Her ArvoARC kiracısının vitrin adresi ve operasyon tercihleri bağımsız yönetilir.</p></div></section>
    {query.saved&&<section className="card" style={{padding:16,marginBottom:20}}><strong>Mağaza ayarları kaydedildi.</strong></section>}
    {query.error&&<section className="card" style={{padding:16,marginBottom:20}}><strong>Ayarlar kaydedilemedi: {query.error}</strong></section>}
    <section className="card" style={{padding:24,maxWidth:850}}><div className="head"><div><small>GENEL AYARLAR</small><h3>{settings?.store_name??organization.name}</h3></div><span>{organization.plan_code}</span></div>
      {canManage?<form action={updateStoreSettings} style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:16,marginTop:20}}>
        <label>Mağaza adı<input name="store_name" defaultValue={settings?.store_name??organization.name} required maxLength={160} style={{display:"block",width:"100%",padding:12,marginTop:6}}/></label>
        <label>Mağaza adresi<input name="storefront_url" type="url" defaultValue={settings?.storefront_url??""} placeholder="https://magazaniz.com" required style={{display:"block",width:"100%",padding:12,marginTop:6}}/></label>
        <label>Para birimi<select name="currency" defaultValue={settings?.currency??"TRY"} style={{display:"block",width:"100%",padding:12,marginTop:6}}><option value="TRY">TRY · Türk Lirası</option><option value="USD">USD · ABD Doları</option><option value="EUR">EUR · Euro</option></select></label>
        <label>Dil / bölge<select name="locale" defaultValue={settings?.locale??"tr-TR"} style={{display:"block",width:"100%",padding:12,marginTop:6}}><option value="tr-TR">Türkçe · Türkiye</option><option value="en-US">English · United States</option></select></label>
        <label>Düşük stok eşiği<input name="low_stock_threshold" type="number" min="0" max="10000" step="1" defaultValue={settings?.low_stock_threshold??5} required style={{display:"block",width:"100%",padding:12,marginTop:6}}/></label>
        <button type="submit" style={{padding:12,alignSelf:"end"}}>Ayarları kaydet</button>
      </form>:<p>Bu ayarları değiştirmek için yönetici yetkisi gerekir.</p>}
    </section>
  </Shell>;
}
