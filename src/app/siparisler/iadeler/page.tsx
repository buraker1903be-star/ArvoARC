import Link from "next/link";
import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { resolveReturn } from "./actions";
import { calculateRefund } from "@/lib/refund";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
});

const STATUS: Record<string, { label: string; tone?: string }> = {
  beklemede: { label: "Bekliyor", tone: "warn" },
  onaylandi: { label: "Ürün bekleniyor", tone: "warn" },
  reddedildi: { label: "Reddedildi", tone: "bad" },
  tamamlandi: { label: "İade edildi", tone: "muted" },
};

/**
 * İade talepleri.
 *
 * Öncesinde iade süreci üç ayrı yerde yürüyordu: müşteri
 * e-posta atıyor, siz PayTR panelinden para iade ediyor, ARC'ta
 * durumu elle değiştiriyordunuz. Burada hepsi tek akışta.
 */
export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const { supabase, organization, membership } = await requireTenant();
  const canResolve = ["owner", "admin"].includes(membership.role);

  const filter = ["beklemede", "onaylandi", "tamamlandi", "reddedildi"].includes(
    params.filter ?? "",
  )
    ? params.filter
    : "beklemede";

  const { data: requests, error } = await supabase
    .from("arc_return_requests")
    .select(
      "id,items,reason,note,status,status_note,refund_amount,created_at,arc_orders(order_number,status,total,shipping,customer_name,customer_email)",
    )
    .eq("organization_id", organization.id)
    .eq("status", filter!)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  const { count: pendingCount } = await supabase
    .from("arc_return_requests")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organization.id)
    .eq("status", "beklemede");

  return (
    <Shell
      active="orders"
      tenantName={organization.name}
      tenantPlan={organization.plan_code}
    >
      <section className="ac-bar">
        <div>
          <h1>Siparişler</h1>
          <p>{pendingCount ?? 0} iade talebi bekliyor.</p>
        </div>

        {/* Sekmeler: Siparişler · İade talepleri */}
        <nav className="ac-bar-actions">
          <Link className="ac-btn" href="/siparisler">
            Siparişler
          </Link>
          <Link
            className="ac-btn"
            href="/siparisler/iadeler"
            style={{ borderColor: "var(--c-accent)", color: "var(--c-accent)" }}
          >
            İade talepleri
          </Link>
        </nav>
      </section>

      <div className="ac-stack">
        {/*
          Durum filtreleri ayrı şeritte: sekmelerle aynı satıra
          sıkıştırıldığında düğmeler alt alta diziliyor ve
          okunmuyordu.
        */}
        <nav className="ac-filter">
          {[
            ["beklemede", "Bekleyenler"],
            ["onaylandi", "Ürün bekleniyor"],
            ["tamamlandi", "İade edilenler"],
            ["reddedildi", "Reddedilenler"],
          ].map(([key, label]) => (
            <Link
              key={key}
              className="ac-btn"
              href={`/siparisler/iadeler?filter=${key}`}
              style={
                filter === key
                  ? { borderColor: "var(--c-accent)", color: "var(--c-accent)" }
                  : undefined
              }
            >
              {label}
            </Link>
          ))}
        </nav>
        {params.ok && (
          <section className="ac ac-pad-sm">
            <strong>
              {params.ok === "test-iade"
                ? "İade kaydedildi ancak bu bir TEST siparişiydi: PayTR'da gerçek para hareketi olmadı."
                : params.ok === "tamamlandi"
                ? "İade tamamlandı ve müşteriye bildirildi."
                : params.ok === "onaylandi"
                  ? "Talep onaylandı. Müşteri ürünü gönderdiğinde iadeyi tamamlayın."
                  : "Talep reddedildi ve müşteriye bildirildi."}
            </strong>
          </section>
        )}

        {params.error && (
          <section className="ac ac-pad-sm">
            <strong style={{ color: "var(--c-bad)" }}>
              {params.error === "refund-failed"
                ? "PayTR iadeyi reddetti. Sipariş numarası ve tutarı kontrol edin."
                : params.error === "already-resolved"
                  ? "Bu talep zaten sonuçlandırılmış."
                  : params.error === "forbidden"
                    ? "İade işlemi için yönetici yetkisi gerekiyor."
                    : params.error === "invalid-amount"
                      ? "İade tutarı, iade edilen kalemlerin (ve kargo çıkmadıysa kargo bedelinin) toplamını aşamaz."
                      : params.error === "not-approved"
                        ? "Para iadesi yalnızca onaylanmış talepte yapılabilir."
                        : "İşlem tamamlanamadı."}
            </strong>
          </section>
        )}

        {(requests ?? []).length === 0 && (
          <section className="ac ac-pad">
            <p style={{ margin: 0, color: "var(--c-ink-3)" }}>
              Bu durumda talep bulunmuyor.
            </p>
          </section>
        )}

        {(requests ?? []).map((request) => {
          const order = (
            Array.isArray(request.arc_orders)
              ? request.arc_orders[0]
              : request.arc_orders
          ) as {
            order_number: string;
            status: string;
            total: number;
            shipping: number | null;
            customer_name: string | null;
            customer_email: string | null;
          } | null;

          const items = (request.items ?? []) as Array<{
            name?: string;
            sku?: string;
            quantity?: number;
            total?: number;
          }>;

          const itemsTotal = items.reduce(
            (sum, item) => sum + Number(item.total ?? 0),
            0,
          );

          /* Tutar sunucudakiyle aynı fonksiyondan geliyor. */
          const refund = calculateRefund({
            itemsTotal,
            orderTotal: order?.total ?? 0,
            shipping: order?.shipping,
            orderStatus: order?.status,
          });

          const state = STATUS[request.status] ?? { label: request.status };

          return (
            <section className="ac ac-pad" key={request.id}>
              <div className="ac-head">
                <div>
                  <h3>
                    <Link href={`/siparisler`}>{order?.order_number}</Link>
                  </h3>
                  <p>
                    {order?.customer_name || order?.customer_email || "Müşteri"}{" "}
                    · {new Date(request.created_at).toLocaleString("tr-TR")}
                  </p>
                </div>
                <em className="ac-tag" data-tone={state.tone}>
                  {state.label}
                </em>
              </div>

              <p style={{ margin: "0 0 var(--s3)" }}>
                <strong>Sebep:</strong> {request.reason}
                {request.note ? ` · ${request.note}` : ""}
              </p>

              <div className="ac-lines">
                {items.map((item, index) => (
                  <div className="ac-line" key={`${item.sku}-${index}`}>
                    <span>
                      <b>{item.name}</b>
                      <span className="ac-dim">{item.sku}</span>
                    </span>
                    <span>{item.quantity}</span>
                    <span>{money.format(Number(item.total ?? 0) / 100)}</span>
                  </div>
                ))}
              </div>

              <p style={{ margin: "var(--s3) 0 0", fontSize: "var(--t-sm)", color: "var(--c-ink-3)" }}>
                Kalem toplamı <strong>{money.format(itemsTotal / 100)}</strong>
                {/*
                  Kargo çıkmadıysa kargo bedeli de iadeye giriyor;
                  bunu ayrı satır olarak göstermek gerekiyor,
                  aksi hâlde tutar olduğundan yüksek görünüyor.
                */}
                {refund.shippingRefund > 0 ? (
                  <>
                    {" · "}Kargo bedeli{" "}
                    <strong>{money.format(refund.shippingRefund / 100)}</strong>
                  </>
                ) : null}
                {" · "}Sipariş toplamı{" "}
                <strong>{money.format((order?.total ?? 0) / 100)}</strong>
              </p>

              {refund.shippingRefund > 0 ? (
                <p style={{ margin: "var(--s2) 0 0", fontSize: "var(--t-sm)", color: "var(--c-ink-3)", lineHeight: 1.6 }}>
                  Kargo çıkmadığı için kargo bedeli de iade tutarına
                  eklendi.
                </p>
              ) : null}

              {request.status === "tamamlandi" && request.refund_amount ? (
                <p style={{ margin: "var(--s3) 0 0", color: "var(--c-good)" }}>
                  <strong>
                    {money.format(request.refund_amount / 100)} iade edildi.
                  </strong>
                </p>
              ) : null}

              {request.status === "onaylandi" && canResolve ? (
                <>
                  <hr className="ac-divider" />

                  <p style={{ margin: "0 0 var(--s3)", fontSize: "var(--t-sm)", color: "var(--c-ink-3)", lineHeight: 1.6 }}>
                    Talep onaylandı, müşteri ürünü gönderecek. Ürün elinize
                    ulaşıp kontrol ettikten sonra iadeyi tamamlayın.
                  </p>

                  <form
                    action={resolveReturn}
                    style={{ display: "grid", gap: "var(--s3)", maxWidth: 420 }}
                  >
                    <input type="hidden" name="request_id" value={request.id} />
                    <input type="hidden" name="decision" value="iade-et" />

                    <label>
                      İade tutarı (₺)
                      <input
                        name="amount"
                        type="number"
                        min="0"
                        step="0.01"
                        max={(refund.amount / 100).toFixed(2)}
                        placeholder={
                          refund.shippingRefund > 0
                            ? `Kalem + kargo: ${(refund.amount / 100).toFixed(2)}`
                            : `Kalem toplamı: ${(refund.amount / 100).toFixed(2)}`
                        }
                        className="ac-input"
                      />
                    </label>

                    <label>
                      Müşteriye not
                      <textarea
                        name="note"
                        rows={2}
                        maxLength={500}
                        placeholder="Değer kaybı kesintisi varsa açıklayın."
                        className="ac-input"
                      />
                    </label>

                    <p style={{ margin: 0, fontSize: "var(--t-sm)", color: "var(--c-bad)", lineHeight: 1.6 }}>
                      Bu adım PayTR üzerinden gerçek para iadesi başlatır ve
                      geri alınamaz. Ürünü teslim aldığınızdan emin olun.
                    </p>

                    <button className="ac-btn ac-btn-primary" type="submit">
                      Ürünü aldım, iadeyi tamamla
                    </button>
                  </form>
                </>
              ) : null}

              {request.status === "beklemede" && canResolve ? (
                <>
                  <hr className="ac-divider" />

                  <form
                    action={resolveReturn}
                    style={{ display: "grid", gap: "var(--s3)", maxWidth: 420 }}
                  >
                    <input type="hidden" name="request_id" value={request.id} />

                    <label>
                      Müşteriye not
                      <textarea
                        name="note"
                        rows={2}
                        maxLength={500}
                        placeholder="Kargo talimatı, iade adresi gibi bilgiler. E-postada görünür."
                        className="ac-input"
                      />
                    </label>

                    <p style={{ margin: 0, fontSize: "var(--t-sm)", color: "var(--c-ink-3)", lineHeight: 1.6 }}>
                      Onay para iadesi yapmaz; müşteriye ürünü gönderebileceğini
                      bildirir. Para, ürün elinize ulaştıktan sonra iade edilir.
                    </p>

                    <div style={{ display: "flex", gap: "var(--s2)" }}>
                      <button
                        className="ac-btn ac-btn-primary"
                        type="submit"
                        name="decision"
                        value="onayla"
                      >
                        Onayla
                      </button>
                      <button
                        className="ac-btn"
                        type="submit"
                        name="decision"
                        value="reddet"
                        style={{ borderColor: "var(--c-bad)", color: "var(--c-bad)" }}
                      >
                        Reddet
                      </button>
                    </div>
                  </form>
                </>
              ) : null}

              {request.status_note ? (
                <p style={{ margin: "var(--s3) 0 0", fontSize: "var(--t-sm)", color: "var(--c-ink-3)" }}>
                  Not: {request.status_note}
                </p>
              ) : null}
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
