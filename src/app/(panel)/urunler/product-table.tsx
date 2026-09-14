"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { bulkSetStatus } from "./actions";

export type ProductRow = {
  id: string;
  name: string;
  image: string | null;
  initials: string;
  meta: string;
  price: string;
  compare: string;
  discount: number;
  cost: string | null;
  profit: string | null;
  loss: boolean;
  stock: number;
  stockTone?: string;
  status: string;
  statusLabel: string;
  statusTone?: string;
  bestSeller: boolean;
};

const BULK = [
  { key: "active", label: "Yayınla" },
  { key: "draft", label: "Taslağa al" },
  { key: "archived", label: "Arşivle" },
];

/*
  Katalog listesi. Tedarikçiden gelen ürünleri tek tek açıp
  yayınlamak yerine seçip topluca yayınlanabilir / arşivlenebilir.
  Satırın tamamı ürün düzenleyicisine gider.
*/
export function ProductTable({ rows, canManage, back, total, children }: { rows: ProductRow[]; canManage: boolean; back: string; total: number; children?: React.ReactNode }) {
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

  return (
    <section className="ac table list-table product-list" data-manage={canManage ? "" : undefined}>
      <div className="ac-head ac-pad-sm list-table-head">
        <div>
          <h3>Katalog</h3>
          <p>{total.toLocaleString("tr-TR")} ürün · satıra tıklayarak düzenleyin{canManage ? "; toplu işlem için kutucukları işaretleyin." : "."}</p>
        </div>
      </div>

      {canManage && chosen.length > 0 ? (
        <form action={bulkSetStatus} className="list-bulk-bar">
          <input type="hidden" name="back" value={back} />
          {chosen.map((row) => <input key={row.id} type="hidden" name="product_id" value={row.id} />)}
          <b>{chosen.length} ürün seçildi</b>
          <span className="list-bulk-actions">
            {BULK.map((step) => {
              const eligible = chosen.filter((row) => row.status !== step.key).length;
              return (
                <button key={step.key} className="ac-btn" type="submit" name="status" value={step.key} disabled={!eligible}>
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
          <div className="list-row th">
            {canManage ? (
              <label className="list-check"><input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((row) => row.id)))} aria-label="Bu sayfadaki tüm ürünleri seç" /></label>
            ) : null}
            <span className="pl-thumb" />
            <span className="pl-name">ÜRÜN</span>
            <span className="pl-price">FİYAT</span>
            <span className="pl-margin">ALIŞ / KÂR</span>
            <span className="pl-stock">STOK</span>
            <span className="pl-status">DURUM</span>
          </div>
          {rows.map((row) => (
            <div className={selected.has(row.id) ? "list-row is-selected" : "list-row"} key={row.id}>
              {canManage ? (
                <label className="list-check"><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} aria-label={`${row.name} ürününü seç`} /></label>
              ) : null}
              {/* Küçük görsel: benzer adlı ürünleri ayırt etmek için. */}
              <span className="pl-thumb">
                {row.image ? <Image src={row.image} alt="" width={88} height={88} sizes="44px" /> : <b>{row.initials}</b>}
              </span>
              <span className="pl-name">
                <Link prefetch={false} className="list-row-link" href={`/urunler/${row.id}`}><b>{row.name}</b></Link>
                <small>{row.meta}</small>
              </span>
              <span className="pl-price">
                <b>{row.price}</b>
                {row.compare ? <small><s>{row.compare}</s>{row.discount ? ` · −%${row.discount}` : ""}</small> : null}
              </span>
              {/* Alış ve kâr yalnızca tedarikçi ürünlerinde: kendi
                  ürünlerimizde maliyet kayıtlı değil, uydurma kâr
                  göstermek yanıltıcı olur. */}
              <span className="pl-margin">
                {row.cost ? <><small>Alış {row.cost}</small><b className="profit" data-loss={row.loss ? "" : undefined}>{row.profit}</b></> : <small>—</small>}
              </span>
              <span className="pl-stock"><em className="stock-pill" data-tone={row.stockTone}>{row.stock.toLocaleString("tr-TR")} adet</em></span>
              <span className="pl-status">
                <em className="ac-tag" data-tone={row.statusTone}>{row.statusLabel}</em>
                {row.bestSeller ? <small>Çok satan</small> : null}
              </span>
            </div>
          ))}
        </>
      ) : (
        <div className="list-empty">
          <b>Bu ölçütlere uygun ürün yok.</b>
          <p>Aramayı veya filtreleri değiştirin. Ürün adı, SKU, marka, tür ve etiketlerde arama yapılır.</p>
        </div>
      )}
      {children}
    </section>
  );
}
