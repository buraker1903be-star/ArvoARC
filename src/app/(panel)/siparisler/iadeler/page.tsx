import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { resolveReturn } from "./actions";
import { calculateRefund } from "@/lib/refund";
import { Notice } from "@/components/panel/notice";
import { OrdersTabs } from "../orders-tabs";
import "../orders.css";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
});
const dateTime = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

const STATUS: Record<string, { label: string; tone?: string }> = {
  beklemede: { label: "Bekliyor", tone: "warn" },
  onaylandi: { label: "Ürün bekleniyor", tone: "warn" },
  reddedildi: { label: "Reddedildi", tone: "bad" },
  tamamlandi: { label: "İade edildi", tone: "muted" },
};

const TABS = [
  ["beklemede", "Bekleyenler"],
  ["onaylandi", "Ürün bekleniyor"],
  ["tamamlandi", "İade edilenler"],
  ["reddedildi", "Reddedilenler"],
] as const;
type TabKey = (typeof TABS)[number][0];

const OK: Record<string, string> = {
  "test-iade": "İade kaydedildi ancak bu bir TEST siparişiydi: PayTR'da gerçek para hareketi olmadı.",
  tamamlandi: "İade tamamlandı ve müşteriye bildirildi.",
  onaylandi: "Talep onaylandı. Müşteri ürünü gönderdiğinde iadeyi tamamlayın.",
  reddedildi: "Talep reddedildi ve müşteriye bildirildi.",
};

const ERRORS: Record<string, string> = {
  "refund-failed": "PayTR iadeyi reddetti. Sipariş numarası ve tutarı kontrol edin.",
  "already-resolved": "Bu talep zaten sonuçlandırılmış.",
  forbidden: "İade işlemi için yönetici yetkisi gerekiyor.",
  "invalid-amount": "İade tutarı, iade edilen kalemlerin (ve kargo çıkmadıysa kargo bedelinin) toplamını aşamaz.",
  "not-approved": "Para iadesi yalnızca onaylanmış talepte yapılabilir.",
  "already-refunded": "Bu sipariş zaten tamamen iade edilmiş.",
  "over-remaining": "Bu siparişte daha önce iade yapılmış; tutar, kalan iade edilebilir tutarı aşamaz.",
  "not-paid": "Sipariş ödenmemiş; para iadesi yapılamaz.",
  "transfer-order": "Havale siparişi PayTR'dan iade edilemez. Parayı bankadan iade edip siparişi elle kapatın.",
  busy: "Bu talep için iade zaten işleniyor. Sayfayı yenileyip durumu kontrol edin.",
  "save-failed": "Karar kaydedilemedi; müşteriye e-posta gönderilmedi. Tekrar deneyin.",
  "refund-recorded-failed": "İade yapıldı ancak kayıt güncellenemedi. PayTR panelinden doğrulayın; tekrar iade denemeyin.",
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

  const filter: TabKey = TABS.some(([key]) => key === params.filter) ? (params.filter as TabKey) : "beklemede";

  const [{ data: requests, error }, ...countResults] = await Promise.all([
    supabase
      .from("arc_return_requests")
      .select("id,order_id,items,reason,note,status,status_note,refund_amount,created_at,arc_orders(order_number,status,total,shipping,customer_name,customer_email)")
      .eq("organization_id", organization.id)
      .eq("status", filter)
      .order("created_at", { ascending: false })
      .limit(50),
    ...TABS.map(([key]) =>
      supabase.from("arc_return_requests").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("status", key),
    ),
  ]);

  if (error) throw new Error(error.message);

  const counts = Object.fromEntries(TABS.map(([key], index) => [key, countResults[index]?.count ?? 0])) as Record<TabKey, number>;

  return (
    <>
      <section className="ac-bar">
        <div>
          <h1>Siparişler</h1>
          <p>{counts.beklemede} iade talebi karar bekliyor.</p>
        </div>
        <OrdersTabs active="returns" pendingReturns={counts.beklemede} />
      </section>

      <div className="ac-stack">
        {/*
          Durum filtreleri ayrı şeritte: sekmelerle aynı satıra
          sıkıştırıldığında düğmeler alt alta diziliyor ve
          okunmuyordu.
        */}
        <nav className="ac-filter" aria-label="İade durumu">
          {TABS.map(([key, label]) => (
            <Link prefetch={false} key={key} className="ac-btn" href={`/siparisler/iadeler?filter=${key}`} aria-current={filter === key ? "page" : undefined}>
              {label}
              <span className="ac-count" data-tone={key === "beklemede" && counts[key] ? "warn" : undefined}>{counts[key]}</span>
            </Link>
          ))}
        </nav>

        {params.ok ? <Notice tone={params.ok === "test-iade" ? "warn" : "success"} title={OK[params.ok] ?? "İşlem tamamlandı."} /> : null}
        {params.error ? <Notice tone="error" title="İşlem tamamlanamadı">{ERRORS[params.error] ?? "Beklenmeyen bir hata oluştu."}</Notice> : null}

        {(requests ?? []).length === 0 ? (
          <section className="ac order-empty">
            <b>Bu durumda talep bulunmuyor.</b>
            <p>Müşteriler iade talebini mağazadaki sipariş sayfasından oluşturur; yeni talepler “Bekleyenler” sekmesine düşer.</p>
          </section>
        ) : null}

        {(requests ?? []).map((request) => {
          const order = (Array.isArray(request.arc_orders) ? request.arc_orders[0] : request.arc_orders) as {
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

          const itemsTotal = items.reduce((sum, item) => sum + Number(item.total ?? 0), 0);

          /* Tutar sunucudakiyle aynı fonksiyondan geliyor. */
          const refund = calculateRefund({
            itemsTotal,
            orderTotal: order?.total ?? 0,
            shipping: order?.shipping,
            orderStatus: order?.status,
          });

          const state = STATUS[request.status] ?? { label: request.status };

          return (
            <section className="ac ac-pad return-card" key={request.id}>
              <div className="ac-head">
                <div>
                  <h3>
                    {order ? <Link prefetch={false} href={`/siparisler/${request.order_id}`}>{order.order_number}</Link> : "Sipariş bulunamadı"}
                  </h3>
                  <p>
                    {order?.customer_name || order?.customer_email || "Müşteri"} · {dateTime.format(new Date(request.created_at))}
                  </p>
                </div>
                <em className="ac-tag" data-tone={state.tone}>{state.label}</em>
              </div>

              <p className="return-reason">
                <b>Sebep:</b> {request.reason}
                {request.note ? ` · ${request.note}` : ""}
              </p>

              <div className="return-lines">
                <div className="return-line is-head"><span>ÜRÜN</span><span>ADET</span><span>TUTAR</span></div>
                {items.map((item, index) => (
                  <div className="return-line" key={`${item.sku}-${index}`}>
                    <span><b>{item.name}</b><small>{item.sku}</small></span>
                    <span>{item.quantity}</span>
                    <span>{money.format(Number(item.total ?? 0) / 100)}</span>
                  </div>
                ))}
              </div>

              <p className="return-sum">
                <span>Kalem toplamı <b>{money.format(itemsTotal / 100)}</b></span>
                {/*
                  Kargo çıkmadıysa kargo bedeli de iadeye giriyor;
                  bunu ayrı satır olarak göstermek gerekiyor,
                  aksi hâlde tutar olduğundan yüksek görünüyor.
                */}
                {refund.shippingRefund > 0 ? <span>Kargo bedeli <b>{money.format(refund.shippingRefund / 100)}</b></span> : null}
                <span>Sipariş toplamı <b>{money.format((order?.total ?? 0) / 100)}</b></span>
              </p>

              {refund.shippingRefund > 0 ? <p className="order-hint">Kargo çıkmadığı için kargo bedeli de iade tutarına eklendi.</p> : null}

              {request.status === "tamamlandi" && request.refund_amount ? (
                <p className="return-done">{money.format(request.refund_amount / 100)} iade edildi.</p>
              ) : null}

              {request.status === "onaylandi" && canResolve ? (
                <>
                  <hr className="ac-divider" />
                  <p className="order-hint">
                    Talep onaylandı, müşteri ürünü gönderecek. Ürün elinize
                    ulaşıp kontrol ettikten sonra iadeyi tamamlayın.
                  </p>

                  <form action={resolveReturn} className="order-form-grid is-narrow">
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
                      <textarea name="note" rows={2} maxLength={500} placeholder="Değer kaybı kesintisi varsa açıklayın." className="ac-input" />
                    </label>

                    <p className="order-hint is-danger">
                      Bu adım PayTR üzerinden gerçek para iadesi başlatır ve
                      geri alınamaz. Ürünü teslim aldığınızdan emin olun.
                    </p>

                    <button className="ac-btn ac-btn-primary" type="submit">Ürünü aldım, iadeyi tamamla</button>
                  </form>
                </>
              ) : null}

              {request.status === "beklemede" && canResolve ? (
                <>
                  <hr className="ac-divider" />
                  <form action={resolveReturn} className="order-form-grid is-narrow">
                    <input type="hidden" name="request_id" value={request.id} />

                    <label>
                      Müşteriye not
                      <textarea name="note" rows={2} maxLength={500} placeholder="Kargo talimatı, iade adresi gibi bilgiler. E-postada görünür." className="ac-input" />
                    </label>

                    <p className="order-hint">
                      Onay para iadesi yapmaz; müşteriye ürünü gönderebileceğini
                      bildirir. Para, ürün elinize ulaştıktan sonra iade edilir.
                    </p>

                    <div className="return-actions">
                      <button className="ac-btn ac-btn-primary" type="submit" name="decision" value="onayla">Onayla</button>
                      <button className="ac-btn ac-btn-danger" type="submit" name="decision" value="reddet">Reddet</button>
                    </div>
                  </form>
                </>
              ) : null}

              {request.status_note ? <p className="return-note">Not: {request.status_note}</p> : null}
            </section>
          );
        })}
      </div>
    </>
  );
}
