"use client";

import Link from "next/link";
import { useState } from "react";
import { bulkStatus, quickStatus, siparisleriSil } from "./actions";
import { ConfirmSubmit } from "@/components/panel/confirm-submit";

export type OrderRow = {
  id: string;
  number: string;
  customer: string;
  email: string;
  source: string;
  total: string;
  date: string;
  badge: { label: string; tone?: string };
  next: { key: string; label: string } | null;
  /** Havale siparişi: ödeme panelden onaylanır. */
  transfer?: boolean;
  /*
    KÂR. Maliyeti eksik, iptal edilmiş ya da iadeli siparişte null:
    yarım bir sayı, sayı olmamasından daha yanıltıcı olurdu
    (lib/siparis-kari.ts).
  */
  kar: { tutar: string; oran: number; eksi: boolean } | null;
  /*
    KARGO. Gönderilerden türetiliyor, ayrı sütunda tutulmuyor; sipariş
    detayındaki özetle aynı fonksiyondan geliyor.
  */
  kargo: { durum: "yok" | "kismi" | "tamam" | "teslim"; sorunlu: boolean };
};

/*
  KARGO SÜTUNUNUN METNİ. "yok" ayrı bir renk almıyor: kargoya
  verilmemiş olmak yeni siparişin olağan hâli, uyarı değil.
*/
const KARGO_ETIKETI: Record<OrderRow["kargo"]["durum"], string> = {
  yok: "Verilmedi",
  kismi: "Kısmen",
  tamam: "Kargoda",
  teslim: "Teslim edildi",
};

const BULK_STEPS = [
  { key: "confirmed", label: "Onayla" },
  { key: "processing", label: "Hazırlanıyor" },
  { key: "fulfilled", label: "Kargoya ver" },
];

/*
  Sipariş listesi ve toplu işlem.

  Günde onlarca sipariş geldiğinde her birini tek tek "Onayla →"
  ile ilerletmek sayfayı onlarca kez yeniliyordu. Seçilen
  siparişler tek istekte bir sonraki adıma geçer; adıma uygun
  olmayanlar (ör. zaten hazırlanan) sunucuda atlanır ve sayısı
  bildirilir.

  Satırın tamamı detay bağlantısı (ilk hücredeki <a> kaplamayla):
  orta tık ve "yeni sekmede aç" çalışır.
*/
export function OrderTable({ rows, canManage, canDelete, back, children }: { rows: OrderRow[]; canManage: boolean; canDelete: boolean; back: string; children?: React.ReactNode }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const chosen = rows.filter((row) => selected.has(row.id));
  const allChecked = rows.length > 0 && chosen.length === rows.length;

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((row) => row.id)));

  return (
    <section className="ac table order-table" data-manage={canManage ? "" : undefined}>
      {/*
        Başlık kaldırıldı: sayfanın kendi başlığı zaten "Siparişler" ve
        "Sipariş akışı" onun altında ikinci kez aynı şeyi söylüyordu.
        Blok 82px yer kaplıyordu; 900px'lik ekranda ilk sipariş satırı
        595. pikselde başlıyor ve 40 kayıttan 4'ü görünüyordu (canlıda
        ölçüldü, 27.09.2026). İpucu duruyor — yeni kullanıcı için tek
        cümlelik değeri var — ama tek satıra indi.
      */}
      <div className="ac-head order-table-head">
        <p>Satıra tıklayarak detayı açın{canManage ? "; toplu işlem için kutucukları işaretleyin." : "."}</p>
      </div>

      {canManage && chosen.length > 0 ? (
        <form action={bulkStatus} className="order-bulk-bar">
          <input type="hidden" name="back" value={back} />
          {chosen.map((row) => <input key={row.id} type="hidden" name="order_id" value={row.id} />)}
          <b>{chosen.length} sipariş seçildi</b>
          <span className="order-bulk-actions">
            {BULK_STEPS.map((step) => {
              const eligible = chosen.filter((row) => row.next?.key === step.key).length;
              return (
                <button key={step.key} className="ac-btn" type="submit" name="status" value={step.key} disabled={!eligible} title={eligible ? `${eligible} siparişe uygulanır` : "Seçilenlerde bu adıma uygun sipariş yok"}>
                  {step.label}
                  <span className="ac-count">{eligible}</span>
                </button>
              );
            })}
            <button className="ac-btn" type="button" onClick={() => setSelected(new Set())}>Seçimi temizle</button>
          </span>
        </form>
      ) : null}

      {/*
        SİLME AYRI FORMDA. Durum düğmeleriyle aynı formda olsaydı yanlış
        düğmeye basmak kayıtları yok ederdi; ayrıca silme yetkisi daha
        dar (owner/admin), durum değiştirme manager'a da açık.

        Onay penceresi kaç siparişin silineceğini ve geri alınamayacağını
        yazıyor — sipariş numaralarıyla, çünkü "3 sipariş" yazan bir
        uyarı hangi üçü olduğunu söylemiyor.
      */}
      {canDelete && chosen.length > 0 ? (
        <form action={siparisleriSil} className="order-bulk-bar order-bulk-danger">
          <input type="hidden" name="back" value={back} />
          {chosen.map((row) => <input key={row.id} type="hidden" name="order_id" value={row.id} />)}
          <b>Seçilenleri kalıcı olarak sil</b>
          <span className="order-bulk-actions">
            <ConfirmSubmit
              className="ac-btn ac-btn-danger"
              message={`${chosen.length} sipariş KALICI olarak silinecek:\n\n${chosen.slice(0, 10).map((row) => row.number).join("\n")}${chosen.length > 10 ? `\n… ve ${chosen.length - 10} sipariş daha` : ""}\n\nKalemleri, gönderileri ve işlem geçmişi de silinir. Açık siparişlerin stoğu iade edilir. Bu işlem geri alınamaz.`}
            >
              {chosen.length} siparişi sil
            </ConfirmSubmit>
          </span>
        </form>
      ) : null}

      {rows.length ? (
        <>
          <div className="order-row th">
            {canManage ? (
              <label className="order-check"><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Bu sayfadaki tüm siparişleri seç" /></label>
            ) : null}
            <span className="order-cell-main">SİPARİŞ</span>
            <span className="order-cell-customer">MÜŞTERİ</span>
            <span className="order-amount">TUTAR</span>
            <span className="order-profit">KÂR</span>
            <span className="order-status">OPERASYON</span>
            <span className="order-shipping">KARGO</span>
            {canManage ? <span className="order-action" /> : null}
          </div>
          {rows.map((row) => (
            <div className={selected.has(row.id) ? "order-row is-selected" : "order-row"} key={row.id}>
              {canManage ? (
                <label className="order-check"><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} aria-label={`${row.number} siparişini seç`} /></label>
              ) : null}
              <span className="order-cell-main">
                <Link prefetch={false} className="order-row-link" href={`/siparisler/${row.id}`}><b>{row.number}</b></Link>
                <small>{row.date}</small>
              </span>
              <span className="order-cell-customer">
                <b>{row.customer}</b>
                {/*
                  Kaynak ve havale etiketi müşterinin altına indi:
                  kendi sütununda 110px yer kaplıyordu ve satırda
                  sorulan soru "kim, ne kadar, ne durumda" — kaynak
                  ancak ayrım gerektiğinde bakılan bir ayrıntı.
                */}
                <small>
                  {row.source}
                  {row.transfer ? <em className="order-transfer-tag">Havale</em> : null}
                </small>
              </span>
              <span className="order-amount">{row.total}</span>
              <span className="order-profit">
                {row.kar ? (
                  <>
                    <b data-eksi={row.kar.eksi ? "" : undefined}>{row.kar.tutar}</b>
                    <small>%{row.kar.oran.toLocaleString("tr-TR")}</small>
                  </>
                ) : (
                  /* Sebep başlıkta: maliyet eksik mi, sipariş kapalı mı. */
                  <b className="is-empty" title="Maliyeti eksik ya da sipariş kapandı (iptal / iade)">—</b>
                )}
              </span>
              <span className="order-status"><em className="ac-tag" data-tone={row.badge.tone}>{row.badge.label}</em></span>
              <span className="order-shipping">
                {/*
                  Teslim edilmiş sipariş en güçlü işareti alıyor: iş
                  bitti demek. "Kargoda" sakin kalıyor — henüz
                  izlenmesi gereken bir şey.
                */}
                <em className="ac-tag" data-tone={row.kargo.sorunlu ? "bad" : row.kargo.durum === "teslim" ? "good" : row.kargo.durum === "kismi" ? "warn" : undefined}>
                  {row.kargo.sorunlu ? "Sorunlu" : KARGO_ETIKETI[row.kargo.durum]}
                </em>
              </span>
              {canManage ? (
                <span className="order-action">
                  {row.next ? (
                    <form action={quickStatus}>
                      <input type="hidden" name="order_id" value={row.id} />
                      <input type="hidden" name="status" value={row.next.key} />
                      <input type="hidden" name="back" value={back} />
                      <button type="submit" className="row-action">{row.next.label} →</button>
                    </form>
                  ) : null}
                </span>
              ) : null}
            </div>
          ))}
        </>
      ) : (
        <div className="order-empty">
          <b>Bu ölçütlere uygun sipariş yok.</b>
          <p>Filtreyi veya dönemi değiştirin. Eski Shopify siparişlerini Veri Aktarımı ekranından yükleyebilirsiniz.</p>
        </div>
      )}
      {children}
    </section>
  );
}
