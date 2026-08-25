import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { importActiveProducts, migrateShopifyImages } from "./actions";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ imported?: string; errors?: string; error?: string; images?: string; imageErrors?: string; remaining?: string }> }) {
  const params = await searchParams;
  const { supabase, organization, membership } = await requireTenant();
  const { data: batches, error } = await supabase
    .from("arc_import_batches")
    .select("id,kind,file_name,status,total_rows,imported_rows,skipped_rows,error_rows,created_at")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  const canManage = ["owner", "admin", "manager"].includes(membership.role);

  return <Shell active="import" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small>VERİ TAŞIMA</small><h2>Shopify Geçişi</h2><p>Shopify yalnızca eski veri kaynağıdır. Aktarım sonrasında ArvoARC bağımsız çalışır.</p></div></section>
    {params.imported && <section className="card" style={{padding:16,marginBottom:20}}><strong>{params.imported} aktif ürün aktarıldı. Hata: {params.errors ?? "0"}</strong></section>}
    {params.images && <section className="card" style={{padding:16,marginBottom:20}}><strong>{params.images} ürünün görselleri ARC Storage’a taşındı. Hata: {params.imageErrors ?? "0"}. Kalan: {params.remaining ?? "0"}</strong></section>}
    {params.error && <section className="card" style={{padding:16,marginBottom:20}}><strong>Aktarım başlatılamadı: {params.error}</strong></section>}

    <section className="card" style={{padding:24,marginBottom:24}}>
      <div className="head"><div><small>ÜRÜN AKTARIM POLİTİKASI</small><h3>Yalnızca aktif ürünler</h3></div><span>Tek seferlik migration</span></div>
      <p>Importer yalnızca Shopify CSV içinde <b>Status = active</b> olan ürünleri kabul eder. Draft ve archived ürünler atlanır. Varyantlar, fiyatlar ve ürün seçenekleri korunur; stok 0 başlar ve stoksuz satış varsayılan olarak açıktır.</p>
      {canManage && <form action={importActiveProducts} style={{display:"flex",gap:12,alignItems:"end",marginTop:20,flexWrap:"wrap"}}>
        <label style={{flex:"1 1 320px"}}>Shopify Products CSV<input name="file" type="file" accept=".csv,text/csv" required style={{display:"block",width:"100%",marginTop:8,padding:12}} /></label>
        <button type="submit" style={{padding:12}}>Aktif ürünleri aktar</button>
      </form>}
    </section>
    <section className="card" style={{padding:24,marginBottom:24}}>
      <div className="head"><div><small>GÖRSEL BAĞIMSIZLAŞTIRMA</small><h3>Shopify CDN bağını kaldır</h3></div><span>Supabase Storage</span></div>
      <p>Mevcut Shopify ürün görsellerini güvenli biçimde ARC depolamasına kopyalar. İşlem zaman aşımını önlemek için her çalıştırmada 5 ürünü taşır.</p>
      {canManage&&<form action={migrateShopifyImages}><button type="submit" style={{padding:12}}>Sonraki görsel grubunu taşı</button></form>}
    </section>
    <section className="card table"><div className="head"><div><small>AKTARIM GEÇMİŞİ</small><h3>{batches?.length ?? 0} işlem</h3></div></div>
      <div className="row th"><span>DOSYA</span><span>TÜR</span><span>AKTARILAN</span><span>ATLANAN</span><span>DURUM</span></div>
      {batches?.length ? batches.map((batch)=><div className="row" key={batch.id}><span><b>{batch.file_name ?? "Shopify CSV"}</b></span><span>{batch.kind}</span><span>{batch.imported_rows}/{batch.total_rows}</span><span>{batch.skipped_rows + batch.error_rows}</span><span><em>{batch.status}</em></span></div>) : <div style={{padding:24}}><strong>Henüz kayıtlı aktarım yok.</strong><p>İlk aktif ürün kataloğu aktarımı bu ekranda görünecek.</p></div>}
    </section>
  </Shell>;
}
