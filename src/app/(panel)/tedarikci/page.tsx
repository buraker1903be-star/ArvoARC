import { requireTenant } from "@/lib/tenant";
import { Notice } from "@/components/panel/notice";
import { updateSupplier, resetCursor } from "./actions";
import "../catalog.css";
import "../modules.css";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const dateTime = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

const ERRORS: Record<string, string> = {
  "invalid-margin": "Kâr oranı 0 ile 500 arasında olmalı.",
  "invalid-shipping": "Kargo payı geçersiz.",
  "invalid-round": "Yuvarlama 0 ile 99 kuruş arasında olmalı.",
  "invalid-service": "Ek hizmet bedeli geçersiz.",
  "invalid-buffer": "Stok tamponu 0 ile 100 arasında olmalı.",
  "missing-code": "Tedarikçi kodu eksik.",
  "save-failed": "Ayarlar kaydedilemedi, tekrar deneyin.",
  forbidden: "Bu işlem için yetkiniz yok.",
};

/**
 * Tedarikçi ayarları.
 *
 * Fiyat kuralı, aktarım durumu ve imleç yönetimi. Öncesinde bu
 * ayarları değiştirmek için SQL yazmak gerekiyordu.
 */
export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const params = await searchParams;
  const { supabase, organization, membership } = await requireTenant();
  const canManage = ["owner", "admin"].includes(membership.role);

  const { data: suppliers, error } = await supabase.from("arc_suppliers").select("*").eq("organization_id", organization.id).order("name");
  if (error) throw new Error(error.message);

  return (
    <>
      <section className="ac-bar">
        <div>
          <h1>Tedarikçiler</h1>
          <p>Fiyat kuralları ve katalog aktarım durumu.</p>
        </div>
      </section>

      <div className="ac-stack">
        {params.ok === "saved" ? <Notice title="Tedarikçi ayarları kaydedildi." /> : null}
        {params.ok === "reset" ? <Notice title="Aktarım imleci sıfırlandı.">Bir sonraki çalıştırma kataloğun başından başlar.</Notice> : null}
        {params.error ? <Notice tone="error" title="İşlem tamamlanamadı">{ERRORS[params.error] ?? "Beklenmeyen bir hata oluştu."}</Notice> : null}

        {(suppliers ?? []).length === 0 ? (
          <section className="ac list-empty"><b>Tanımlı tedarikçi yok.</b><p>Tedarikçi entegrasyonu kurulduğunda burada görünür.</p></section>
        ) : null}

        {(suppliers ?? []).map((supplier) => {
          const total = supplier.sync_total ?? 0;
          const cursor = supplier.sync_cursor ?? 0;
          const percent = total > 0 ? Math.min(100, Math.round((cursor / total) * 100)) : 0;
          const margin = supplier.margin_percent ?? 40;
          const shipping = supplier.shipping_markup ?? 0;
          const service = supplier.service_fee ?? 0;
          const round = supplier.round_to_kurus ?? 90;

          return (
            <section key={supplier.id} className="ac ac-pad">
              <div className="ac-head">
                <div>
                  <h3>{supplier.name}</h3>
                  <p>{supplier.code} · {supplier.publish_directly ? "Yeni ürünler doğrudan yayınlanır" : "Yeni ürünler taslak olarak gelir"}</p>
                </div>
                <em className="ac-tag" data-tone={total ? (percent >= 100 ? undefined : "warn") : "muted"}>{total ? `%${percent} aktarıldı` : "Aktarım başlamadı"}</em>
              </div>

              <div className="supplier-sync">
                <div className="supplier-sync-top"><span>Aktarım imleci</span><b>{cursor.toLocaleString("tr-TR")} / {total ? total.toLocaleString("tr-TR") : "—"} ürün</b></div>
                <div className="supplier-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ "--w": `${percent}%` } as React.CSSProperties} /></div>
                <dl className="supplier-facts">
                  <div><dt>Son eşitleme</dt><dd>{supplier.last_synced_at ? dateTime.format(new Date(supplier.last_synced_at)) : "Henüz yapılmadı"}</dd></div>
                  <div><dt>Son not</dt><dd>{supplier.last_sync_note || "—"}</dd></div>
                </dl>
              </div>

              {canManage ? (
                <>
                  <form action={updateSupplier} className="supplier-form">
                    <input type="hidden" name="code" value={supplier.code} />
                    <label>Kâr oranı (%)<input name="margin_percent" type="number" min="0" max="500" step="1" defaultValue={margin} required className="ac-input" /></label>
                    <label>Kargo payı (₺)<input name="shipping_markup" type="number" min="0" step="0.01" defaultValue={(shipping / 100).toFixed(2)} required className="ac-input" /></label>
                    <label>Ek hizmet bedeli (₺)<input name="service_fee" type="number" min="0" step="0.01" defaultValue={(service / 100).toFixed(2)} className="ac-input" /></label>
                    <label>Stok tamponu (adet)<input name="stock_buffer" type="number" min="0" max="100" step="1" defaultValue={supplier.stock_buffer ?? 5} className="ac-input" /></label>
                    <label>Yuvarlama (kuruş)<input name="round_to_kurus" type="number" min="0" max="99" step="1" defaultValue={round} required className="ac-input" /></label>
                    <label className="check-inline is-wide"><input name="publish_directly" type="checkbox" defaultChecked={supplier.publish_directly ?? false} /> Yeni ürünler doğrudan yayınlansın (kapalıysa taslak gelir)</label>
                    <div className="catalog-form-actions"><button className="ac-btn ac-btn-primary" type="submit">Kaydet</button></div>
                  </form>

                  {/* Önizleme içe aktarmadaki hesabın aynısı; ek hizmet
                      bedeli de dâhil (öncesinde önizlemede yoktu). */}
                  <p className="supplier-preview">
                    Örnek: {money.format(200)} alış{service ? ` + ${money.format(service / 100)} hizmet` : ""} · %{margin} kâr · {money.format(shipping / 100)} kargo payı →
                    <strong>{money.format(previewPrice(20000, margin, shipping, round, service) / 100)}</strong> satış
                  </p>
                  <p className="module-hint">Tedarikçi stoğu tampon değerin altına düştüğünde ürün satışa kapanır ve vitrinde “Tükendi” görünür; siparişi iletene kadar tükenme riskine karşı güvenlik payıdır. Fiyat değişikliği yalnızca yeni aktarımlarda uygulanır.</p>

                  <div className="supplier-reset">
                    <form action={resetCursor}>
                      <input type="hidden" name="code" value={supplier.code} />
                      <button type="submit" className="ac-btn">Aktarım imlecini sıfırla</button>
                    </form>
                    <p className="module-hint">Mevcut ürünlerin fiyatını yeni kurala göre güncellemek için imleci sıfırlayın; bir sonraki aktarım kataloğu baştan dolaşır.</p>
                  </div>
                </>
              ) : (
                <p className="module-hint">Ayarları değiştirmek için yönetici yetkisi gerekiyor.</p>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

/**
 * Satış fiyatı önizlemesi.
 *
 * İçe aktarma kodundaki hesabın aynısı; yönetici kuralı
 * değiştirmeden önce sonucu görebilsin.
 */
function previewPrice(cost: number, margin: number, shipping: number, round: number, service = 0) {
  const raw = ((cost + service) * (100 + margin)) / 100 + shipping;
  if (!round || round <= 0) return Math.round(raw);
  return Math.ceil((raw - round) / 100) * 100 + round;
}
