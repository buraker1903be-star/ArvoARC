"use client";

import Link from "next/link";
import { useState } from "react";
import { bulkStatus, quickStatus } from "./actions";

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
export function OrderTable({ rows, canManage, back, children }: { rows: OrderRow[]; canManage: boolean; back: string; children?: React.ReactNode }) {
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
      <div className="ac-head ac-pad-sm order-table-head">
        <div>
          <h3>Sipariş akışı</h3>
          <p>Satıra tıklayarak detayı açın{canManage ? "; toplu işlem için kutucukları işaretleyin." : "."}</p>
        </div>
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

      {rows.length ? (
        <>
          <div className="order-row th">
            {canManage ? (
              <label className="order-check"><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Bu sayfadaki tüm siparişleri seç" /></label>
            ) : null}
            <span className="order-cell-main">SİPARİŞ</span>
            <span className="order-cell-customer">MÜŞTERİ</span>
            <span className="order-cell-source">KAYNAK</span>
            <span className="order-amount">TUTAR</span>
            <span className="order-status">DURUM</span>
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
                {row.email ? <small>{row.email}</small> : null}
              </span>
              <span className="order-cell-source">{row.source}{row.transfer ? <em className="ac-tag order-transfer-tag">Havale</em> : null}</span>
              <span className="order-amount">{row.total}</span>
              <span className="order-status"><em className="ac-tag" data-tone={row.badge.tone}>{row.badge.label}</em></span>
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
