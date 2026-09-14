import { requireTenant } from "@/lib/tenant";
import { Notice } from "@/components/panel/notice";
import { importActiveProducts, importHistoricalOrders, migrateShopifyImages } from "./actions";
import { importKindLabel, importStatusLabel } from "@/lib/commerce-labels";
import "../modules.css";

const dateTime = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

const ERRORS: Record<string, string> = {
  forbidden: "Aktarım için yetkiniz yok.",
  "csv-required": "Shopify Products dışa aktarımından bir .csv dosyası seçin.",
  "orders-csv-required": "Shopify Orders dışa aktarımından bir .csv dosyası seçin.",
};

const statusTone = (status: string) => (status === "completed" ? undefined : status === "failed" ? "bad" : status === "processing" ? "warn" : "muted");

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ imported?: string; errors?: string; error?: string; images?: string; imageErrors?: string; remaining?: string; orders?: string; orderErrors?: string; orderSkipped?: string }> }) {
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
  const count = (value?: string) => Number(value ?? 0);

  return <>
    <section className="ac-bar">
      <div>
        <h1>Veri Aktarımı</h1>
        <p>Shopify arşivinden ürün, sipariş ve görsel aktarımı.</p>
      </div>
    </section>

    <div className="ac-stack">
      {params.imported ? <Notice tone={count(params.errors) ? "warn" : "success"} title={`${count(params.imported)} aktif ürün aktarıldı.`}>{count(params.errors) ? `${count(params.errors)} satır hatalı olduğu için aktarılamadı.` : null}</Notice> : null}
      {params.orders ? <Notice tone={count(params.orderErrors) ? "warn" : "success"} title={`${count(params.orders)} eski sipariş aktarıldı.`}>{`Hata: ${count(params.orderErrors)} · Atlanan satır: ${count(params.orderSkipped)}`}</Notice> : null}
      {params.images ? <Notice tone={count(params.imageErrors) ? "warn" : "success"} title={`${count(params.images)} ürünün görselleri ARC depolamasına taşındı.`}>{`Hata: ${count(params.imageErrors)} · Kalan ürün: ${count(params.remaining)}`}</Notice> : null}
      {params.error ? <Notice tone="error" title="Aktarım başlatılamadı">{ERRORS[params.error] ?? params.error}</Notice> : null}

      <div className="import-grid">
        <section className="ac ac-pad import-card">
          <div className="ac-head"><div><h3>Aktif ürünler</h3><p>Tek seferlik katalog aktarımı</p></div></div>
          <p>Yalnızca Shopify CSV’de <b>Status = active</b> olan ürünler alınır; taslak ve arşivlenmişler atlanır. Varyantlar, fiyatlar ve seçenekler korunur. Stok 0 başlar, stoksuz satış açık gelir.</p>
          {canManage ? (
            <form action={importActiveProducts} className="import-form">
              <label>Shopify Products CSV<input name="file" type="file" accept=".csv,text/csv" required /></label>
              <button className="ac-btn ac-btn-primary" type="submit">Aktif ürünleri aktar</button>
            </form>
          ) : null}
        </section>

        <section className="ac ac-pad import-card">
          <div className="ac-head"><div><h3>Geçmiş siparişler</h3><p>Stok miktarlarını etkilemez</p></div></div>
          <p>Shopify Orders CSV’deki eski siparişleri, müşteri bilgilerini ve kalemleri aktarır. Tarihsel kayıt olduğu için mevcut stoktan yeniden düşüm yapılmaz.</p>
          {canManage ? (
            <form action={importHistoricalOrders} className="import-form">
              <label>Shopify Orders CSV<input name="file" type="file" accept=".csv,text/csv" required /></label>
              <button className="ac-btn ac-btn-primary" type="submit">Eski siparişleri aktar</button>
            </form>
          ) : null}
        </section>

        <section className="ac ac-pad import-card">
          <div className="ac-head"><div><h3>Görselleri taşı</h3><p>Shopify CDN bağını kaldırır</p></div></div>
          <p>Shopify ürün görsellerini ARC depolamasına kopyalar. Zaman aşımını önlemek için her çalıştırmada 5 ürün taşınır; kalan sayısı işlem sonunda gösterilir.</p>
          {canManage ? (
            <form action={migrateShopifyImages} className="import-form">
              <button className="ac-btn ac-btn-primary" type="submit">Sonraki görsel grubunu taşı</button>
            </form>
          ) : null}
        </section>
      </div>

      <section className="ac table list-table import-list">
        <div className="ac-head ac-pad-sm list-table-head"><div><h3>Aktarım geçmişi</h3><p>Son 20 işlem</p></div></div>
        {batches?.length ? <>
          <div className="list-row th"><span className="il-file">DOSYA</span><span className="il-kind">TÜR</span><span className="il-imported">AKTARILAN</span><span className="il-skipped">ATLANAN</span><span className="il-status">DURUM</span><span className="il-date">TARİH</span></div>
          {batches.map((batch) => (
            <div className="list-row" key={batch.id}>
              <span className="il-file"><b>{batch.file_name ?? "Shopify CSV"}</b></span>
              <span className="il-kind">{importKindLabel(batch.kind)}</span>
              <span className="il-imported"><b>{(batch.imported_rows ?? 0).toLocaleString("tr-TR")}</b><small>/ {(batch.total_rows ?? 0).toLocaleString("tr-TR")} satır</small></span>
              <span className="il-skipped">{((batch.skipped_rows ?? 0) + (batch.error_rows ?? 0)).toLocaleString("tr-TR")}</span>
              <span className="il-status"><em className="ac-tag" data-tone={statusTone(batch.status)}>{importStatusLabel(batch.status)}</em></span>
              <span className="il-date">{dateTime.format(new Date(batch.created_at))}</span>
            </div>
          ))}
        </> : <div className="list-empty"><b>Henüz kayıtlı aktarım yok.</b><p>İlk aktif ürün kataloğu aktarımı burada görünecek.</p></div>}
      </section>
    </div>
  </>;
}
