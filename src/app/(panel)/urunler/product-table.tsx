"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { KNot } from "@/components/arvo-ui/k-ui";
import { MobilSatir } from "@/components/arvo-ui/mobil-satir";
import { SatirTiklama } from "@/components/arvo-ui/satir-tiklama";
import { rozetTonu } from "@/lib/rozet-tonu";
import "@/components/arvo-ui/liste-ek.css";
import { bulkSetStatus, topluDurumSonuc } from "./actions";

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
  /** Zamanlanmış yayın varsa rozetin başlığında okunuyor. */
  statusHint?: string;
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
/* total kaldırıldı: yalnızca liste üstündeki ipucu bandında kullanılıyordu,
   o bant sayfa alt başlığına taşındı ve sayı zaten orada yazıyor. */
export function ProductTable({ rows, canManage, back, bos, children }: { rows: ProductRow[]; canManage: boolean; back: string; bos: React.ReactNode; children?: React.ReactNode }) {
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

  const [sonuc, setSonuc] = useState<{ tur: "hata" | "basari"; metin: string } | null>(null);
  const [calisiyor, basla] = useTransition();

  const uygula = (idler: string[], durum: string) => {
    setSonuc(null);
    basla(async () => {
      const cevap = await topluDurumSonuc(idler, durum);
      /* Hata da başarı da SÖYLENİYOR: yönlendirme kalktığı için çerezli
         şerit okunmuyor, sessiz kalmak "işlem oldu mu" sorusu bırakırdı. */
      if (cevap.hata) setSonuc({ tur: "hata", metin: cevap.hata });
      else if (cevap.basari) setSonuc({ tur: "basari", metin: cevap.basari });
      /*
        SEÇİM TEMİZLENİYOR — ama yalnızca işlem başarılıysa. Durumu
        değişen ürünler mevcut filtreden çıkabiliyor, yani seçimi
        tutmak var olmayan satırlara işaret etmek olurdu. Hata
        durumunda seçim korunuyor: kullanıcı yeniden denemek isterse
        kırk kayıttan seçtiklerini tekrar bulmak zorunda kalmasın.
      */
      if (!cevap.hata) setSelected(new Set());
    });
  };

  /* GÖRÜNÜM ArvoOS'un liste tablosu (16.10.2026); seçim ve toplu işlem mantığı aynen. */
  return (
    <>
      {/* Yerinde işlem sonucu: liste yönlendirmediği için kabuktaki balon okunmuyor. */}
      {sonuc ? <KNot ton={sonuc.tur === "hata" ? "tehlike" : "basari"}>{sonuc.metin}</KNot> : null}

      {canManage && chosen.length > 0 ? (
        /*
          FORM DURUYOR, yalnızca gönderimi kesiliyor: hangi düğmeye
          basıldığını submitter söylüyor; type="button" JavaScript
          kapalıyken toplu işlemi tamamen bozardı.
        */
        <form
          action={bulkSetStatus}
          className="liste-toplu"
          onSubmit={(olay) => {
            const basilan = (olay.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            const durum = basilan?.value;
            if (!durum) return;
            olay.preventDefault();
            uygula(chosen.map((row) => row.id), durum);
          }}
        >
          <input type="hidden" name="back" value={back} />
          {chosen.map((row) => <input key={row.id} type="hidden" name="product_id" value={row.id} />)}
          <b>{chosen.length} ürün seçildi</b>
          <span className="liste-toplu-eylem">
            {BULK.map((step) => {
              const eligible = chosen.filter((row) => row.status !== step.key).length;
              return (
                <button key={step.key} className="panel-secondary" type="submit" name="status" value={step.key} disabled={!eligible || calisiyor}>
                  {step.label} <small>{eligible}</small>
                </button>
              );
            })}
            <button className="panel-secondary" type="button" onClick={() => setSelected(new Set())}>Seçimi temizle</button>
          </span>
        </form>
      ) : null}

      {rows.length ? (
        <div className="talep-tablo">
          <table className="crm-data-table urun-tablo" data-cols="urunler">
            <thead>
              <tr>
                {canManage ? (
                  <th className="liste-secim"><input type="checkbox" checked={allChecked} ref={(kutu) => { if (kutu) kutu.indeterminate = chosen.length > 0 && !allChecked; }} onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((row) => row.id)))} aria-label="Bu sayfadaki tüm ürünleri seç" /></th>
                ) : null}
                <th className="urun-gorsel-sutun"><span className="sr-only">Görsel</span></th>
                <th>Ürün</th>
                <th className="crm-col-amount">Fiyat</th>
                <th className="crm-col-amount">Alış / kâr</th>
                <th className="crm-col-amount">Stok</th>
                <th>Durum</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={selected.has(row.id) ? "is-selected" : undefined}>
                  {canManage ? (
                    <td className="liste-secim"><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} aria-label={`${row.name} ürününü seç`} /></td>
                  ) : null}
                  {/* Küçük görsel: benzer adlı ürünleri ayırt etmek için. */}
                  <td className="urun-gorsel-sutun">
                    <span className="urun-gorsel">{row.image ? <Image src={row.image} alt="" width={80} height={80} sizes="40px" /> : <b>{row.initials}</b>}</span>
                  </td>
                  <td data-label="Ürün">
                    <Link prefetch={false} className="crm-row-link crm-cell-main" href={`/urunler/${row.id}`} title={row.name}>{row.name}</Link>
                    <small className="crm-cell-sub" title={row.meta}>{row.meta}{row.bestSeller ? <span className="status-pill" data-tone="gold">Çok satan</span> : null}</small>
                  </td>
                  <td className="crm-col-amount" data-label="Fiyat">
                    <b>{row.price}</b>
                    {row.compare ? <small className="crm-cell-sub"><s>{row.compare}</s>{row.discount ? ` · −%${row.discount}` : ""}</small> : null}
                  </td>
                  {/* Alış ve kâr yalnızca tedarikçi ürünlerinde: kendi ürünlerimizde maliyet kayıtlı değil. */}
                  <td className="crm-col-amount" data-label="Alış / kâr">
                    {row.cost ? <><b className={row.loss ? "is-eksi" : undefined}>{row.profit}</b><small className="crm-cell-sub">Alış {row.cost}</small></> : <span className="crm-cell-sub">—</span>}
                  </td>
                  <td className="crm-col-amount" data-label="Stok"><span className="status-pill" data-tone={rozetTonu(row.stockTone ?? "muted")}>{row.stock.toLocaleString("tr-TR")} adet</span></td>
                  <td data-label="Durum">
                    {/* Zamanlama rozete İŞARET olarak iniyor: yeni bir sütun listeden yer çalardı. */}
                    <span className="status-pill" data-tone={rozetTonu(row.statusHint ? "warn" : row.statusTone)} title={row.statusHint}>{row.statusLabel}{row.statusHint ? " ⏱" : ""}</span>
                  </td>
                  <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                  <MobilSatir
                    href={`/urunler/${row.id}`}
                    baslik={row.name}
                    durum={{ etiket: row.statusLabel, ton: rozetTonu(row.statusHint ? "warn" : row.statusTone) }}
                    alt={[row.meta]}
                    isaretler={[
                      { metin: row.price, ton: "guclu" },
                      { metin: `${row.stock.toLocaleString("tr-TR")} adet`, ton: row.stock <= 0 ? "uyari" : "sessiz" },
                      row.bestSeller ? { metin: "Çok satan", ton: "bilgi" } : null,
                    ]}
                  />
                </tr>
              ))}
            </tbody>
          </table>
          <SatirTiklama />
          {children}
        </div>
      ) : bos}
    </>
  );
}
