import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { updateSupplier, resetCursor } from "./actions";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
});

/**
 * Tedarikçi ayarları.
 *
 * Fiyat kuralı, aktarım durumu ve imleç yönetimi. Öncesinde bu
 * ayarları değiştirmek için SQL yazmak gerekiyordu.
 */
export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { supabase, organization, membership } = await requireTenant();
  const canManage = ["owner", "admin"].includes(membership.role);

  const { data: suppliers, error } = await supabase
    .from("arc_suppliers")
    .select("*")
    .eq("organization_id", organization.id)
    .order("name");

  if (error) throw new Error(error.message);

  /*
    Sayfa Shell içinde değildi: sol menü görünmüyordu ve
    kullanıcı buraya girince gezinmeyi kaybediyordu.
  */
  return (
    <Shell
      active="suppliers"
      tenantName={organization.name}
      tenantPlan={organization.plan_code}
    >
      <section className="ac-bar">
        <div>
          <h1>Tedarikçiler</h1>
          <p>Fiyat kuralları ve aktarım durumu.</p>
        </div>
      </section>

      <div className="ac-stack">

      {params.ok==="saved"&&(
        <p className="ac ac-pad-sm" style={{color:"var(--c-good)"}}>Ayarlar kaydedildi.</p>
      )}
      {params.ok === "reset" && (
        <p style={{ color: "#1f7a4d", marginBottom: 16 }}>
          Aktarım imleci sıfırlandı. Bir sonraki çalıştırma baştan başlar.
        </p>
      )}
      {params.error && (
        <p style={{ color: "#c62d24", marginBottom: 16 }}>
          {params.error === "invalid-margin"
            ? "Kâr oranı 0 ile 500 arasında olmalı."
            : params.error === "invalid-shipping"
              ? "Kargo payı geçersiz."
              : params.error === "invalid-round"
                ? "Yuvarlama 0 ile 99 kuruş arasında olmalı."
                : params.error === "forbidden"
                  ? "Bu işlem için yetkiniz yok."
                  : "İşlem tamamlanamadı."}
        </p>
      )}

      {(suppliers ?? []).length === 0 && (
        <p style={{ color: "#7c8177" }}>Tanımlı tedarikçi yok.</p>
      )}

      {(suppliers ?? []).map((supplier) => {
        const total = supplier.sync_total ?? 0;
        const cursor = supplier.sync_cursor ?? 0;
        const percent = total > 0 ? Math.round((cursor / total) * 100) : 0;

        return (
          <section
            key={supplier.id}
            className="ac ac-pad"
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 18,
              }}
            >
              <h2 style={{ margin: 0 }}>{supplier.name}</h2>
              <span style={{ fontSize: 13, color: "#7c8177" }}>
                {supplier.code}
              </span>
            </div>

            {/* Aktarım durumu */}
            <div
              style={{
                padding:"var(--s4)",
                marginBottom:"var(--s5)",
                background:"var(--c-surface-2)",
                borderRadius:"var(--r1)",
                fontSize:"var(--t-sm)",
                lineHeight:1.8,
                color:"var(--c-ink-2)",
              }}
            >
              Katalog: <strong>{total || "—"}</strong> ürün
              <br />
              İmleç:{" "}
              <strong>
                {cursor} {total > 0 ? `(%${percent})` : ""}
              </strong>
              <br />
              Son eşitleme:{" "}
              <strong>
                {supplier.last_synced_at
                  ? new Date(supplier.last_synced_at).toLocaleString("tr-TR")
                  : "Henüz yapılmadı"}
              </strong>
              {supplier.last_sync_note ? (
                <>
                  <br />
                  Not: {supplier.last_sync_note}
                </>
              ) : null}
            </div>

            {canManage ? (
              <>
                <form
                  action={updateSupplier}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                    gap: 14,
                    alignItems: "end",
                  }}
                >
                  <input type="hidden" name="code" value={supplier.code} />

                  <label>
                    Kâr oranı (%)
                    <input
                      name="margin_percent"
                      type="number"
                      min="0"
                      max="500"
                      step="1"
                      defaultValue={supplier.margin_percent ?? 40}
                      required
                      className="ac-input"
                    />
                  </label>

                  <label>
                    Kargo payı (₺)
                    <input
                      name="shipping_markup"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={((supplier.shipping_markup ?? 0) / 100).toFixed(2)}
                      required
                      className="ac-input"
                    />
                  </label>

                  <label>
                    Ek hizmet bedeli (₺)
                    <input
                      name="service_fee"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={((supplier.service_fee ?? 0) / 100).toFixed(2)}
                      className="ac-input"
                    />
                  </label>

                  <label>
                    Yuvarlama (kuruş)
                    <input
                      name="round_to_kurus"
                      type="number"
                      min="0"
                      max="99"
                      step="1"
                      defaultValue={supplier.round_to_kurus ?? 90}
                      required
                      className="ac-input"
                    />
                  </label>

                  <label
                    style={{
                      gridColumn: "1 / -1",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <input
                      name="publish_directly"
                      type="checkbox"
                      defaultChecked={supplier.publish_directly ?? false}
                    />
                    Yeni ürünler doğrudan yayınlansın (kapalıysa taslak gelir)
                  </label>

                  <button className="ac-btn ac-btn-primary" type="submit">Kaydet</button>
                </form>

                <p
                  style={{
                    margin: "18px 0 0",
                    fontSize: 12,
                    color: "#7c8177",
                    lineHeight: 1.7,
                  }}
                >
                  Örnek: {money.format(200)} alış · %
                  {supplier.margin_percent ?? 40} kâr ·{" "}
                  {money.format((supplier.shipping_markup ?? 0) / 100)} kargo
                  payı →{" "}
                  <strong>
                    {money.format(
                      previewPrice(
                        20000,
                        supplier.margin_percent ?? 40,
                        supplier.shipping_markup ?? 0,
                        supplier.round_to_kurus ?? 90,
                      ) / 100,
                    )}
                  </strong>{" "}
                  satış
                </p>

                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: 12,
                    color: "#7c8177",
                    lineHeight: 1.7,
                  }}
                >
                  Fiyat değişikliği yalnızca yeni aktarımlarda uygulanır.
                  Mevcut ürünlerin fiyatını güncellemek için aktarımı
                  yeniden çalıştırın.
                </p>

                <form action={resetCursor} style={{ marginTop: 18 }}>
                  <input type="hidden" name="code" value={supplier.code} />
                  <button
                    type="submit"
                    className="ac-btn"
                  >
                    Aktarım imlecini sıfırla
                  </button>
                </form>
              </>
            ) : (
              <p style={{ color: "#7c8177", fontSize: 13 }}>
                Ayarları değiştirmek için yönetici yetkisi gerekiyor.
              </p>
            )}
          </section>
        );
      })}
      </div>
    </Shell>
  );
}

/**
 * Satış fiyatı önizlemesi.
 *
 * İçe aktarma kodundaki hesabın aynısı; yönetici kuralı
 * değiştirmeden önce sonucu görebilsin.
 */
function previewPrice(
  cost: number,
  margin: number,
  shipping: number,
  round: number,
  service = 0,
) {
  const raw = ((cost + service) * (100 + margin)) / 100 + shipping;
  if (!round || round <= 0) return Math.round(raw);
  return Math.ceil((raw - round) / 100) * 100 + round;
}
