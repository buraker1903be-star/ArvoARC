"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { bulkStatus, durumIlerletSonuc, quickStatus, siparisleriSil, topluDurumSonuc } from "./actions";
import { ConfirmSubmit } from "@/components/panel/confirm-submit";
import { KNot } from "@/components/arvo-ui/k-ui";
import { MobilSatir } from "@/components/arvo-ui/mobil-satir";
import { SatirTiklama } from "@/components/arvo-ui/satir-tiklama";
import { rozetTonu } from "@/lib/rozet-tonu";

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

const KARGO_ETIKETI: Record<OrderRow["kargo"]["durum"], string> = {
  yok: "Verilmedi",
  kismi: "Kısmen",
  tamam: "Kargoda",
  teslim: "Teslim edildi",
};

/*
  KARGO SÜTUNUNUN RENGİ. Dört durumun üçü aynı yeşildi: rozetin
  varsayılan tonu yeşil olduğu için "Verilmedi" ve "Kargoda",
  "Teslim edildi" ile birebir aynı görünüyordu (28.09.2026'da canlıda
  ölçüldü) — yani operasyoncu listeye bakıp hangi paketin yola bile
  çıkmadığını ayırt edemiyordu.

  "Verilmedi" nötr: yeni siparişin olağan hâli, uyarı değil — asıl
  istenen buydu ama yeşil varsayılan yüzünden olmuyordu. Yolda olan
  paket "info", teslim edilen yeşil; yeşil yalnızca işin bittiğini
  söylüyor.
*/
const KARGO_TONU = (kargo: OrderRow["kargo"]): string =>
  kargo.sorunlu ? "danger"
  : kargo.durum === "teslim" ? "success"
  : kargo.durum === "kismi" ? "warning"
  : kargo.durum === "tamam" ? "info"
  : "neutral";

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

  Satırın tamamı detay bağlantısı (ilk hücredeki .crm-row-link;
  SatirTiklama): orta tık ve "yeni sekmede aç" çalışır.

  GÖRÜNÜM ArvoOS'un liste tablosu (16.10.2026): .talep-tablo >
  table.crm-data-table, telefonda her satır tek kompakt satır
  (MobilSatir). Eskiden div tabanlı kendi ızgarası vardı (orders.css).
*/
export function OrderTable({ rows, canManage, canDelete, back, bos, children }: { rows: OrderRow[]; canManage: boolean; canDelete: boolean; back: string; bos: React.ReactNode; children?: React.ReactNode }) {
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

  /*
    DURUM İLERLETME YERİNDE OLUYOR.

    Eskiden her satırda bir <form action={quickStatus}> vardı ve eylem
    geri YÖNLENDİRİYORDU: kaydırma yeri gidiyor, seçim sıfırlanıyor,
    liste baştan çiziliyordu. Kırk kayıtlı bir listede üç siparişi
    ilerletmek üç kez başa dönmek demekti.

    Artık eylem sonucu döndürüyor (durumIlerletSonuc) ve içindeki
    revalidatePath veriyi yeniliyor; kullanıcı yerinde kalıyor.

    İyimser durum olarak satırın YENİ ETİKETİ UYDURULMUYOR. Bir sonraki
    adımın rozet metni ve tonu sunucu kuralından geliyor (nextOrderStep
    + durum etiketleri); istemcide tahmin etmek o eşlemenin ikinci bir
    kopyası olurdu ve yanlış etiket göstermek, geç güncellemekten kötü.
    Onun yerine satır "işleniyor" hâline geçiyor: düğme kilitleniyor,
    gerçek rozet veri gelince yerine oturuyor.
  */
  const [islenen, setIslenen] = useState<ReadonlySet<string>>(() => new Set());
  const [sonuc, setSonuc] = useState<{ tur: "hata" | "basari"; metin: string } | null>(null);
  const [, basla] = useTransition();

  const [topluCalisiyor, topluBasla] = useTransition();

  /*
    Toplu işlem de yerinde. Seçim YALNIZCA BAŞARIDA temizleniyor:
    durumu değişen siparişler mevcut filtreden çıkabiliyor, yani seçimi
    tutmak var olmayan satırlara işaret etmek olurdu. Hatada seçim
    korunuyor ki kullanıcı kırk kayıttan seçtiklerini tekrar bulmasın.
  */
  const topluUygula = (idler: string[], durum: string) => {
    setSonuc(null);
    topluBasla(async () => {
      const cevap = await topluDurumSonuc(idler, durum);
      if (cevap.hata) setSonuc({ tur: "hata", metin: cevap.hata });
      else if (cevap.basari) setSonuc({ tur: "basari", metin: cevap.basari });
      if (!cevap.hata) setSelected(new Set());
    });
  };

  const ilerlet = (id: string, durum: string) => {
    setIslenen((önce) => new Set(önce).add(id));
    setSonuc(null);
    basla(async () => {
      const cevap = await durumIlerletSonuc(id, durum);
      setIslenen((önce) => {
        const sonra = new Set(önce);
        sonra.delete(id);
        return sonra;
      });
      /* Hata da başarı da SÖYLENİYOR: yönlendirme kalktığı için çerezli
         şerit okunmuyor, sessiz kalmak "bir şey oldu mu" sorusu bırakırdı. */
      if (cevap.hata) setSonuc({ tur: "hata", metin: cevap.hata });
      else if (cevap.basari) setSonuc({ tur: "basari", metin: cevap.basari });
    });
  };

  return (
    <>
      {/*
        Yerinde işlem sonucu. Liste yönlendirmediği için kabuktaki balon
        (çerez) okunmuyor; sonuç listenin BAŞINDA, çünkü kullanıcının gözü
        düğmeye bastığı satırda.
      */}
      {sonuc ? <KNot ton={sonuc.tur === "hata" ? "tehlike" : "basari"}>{sonuc.metin}</KNot> : null}

      {canManage && chosen.length > 0 ? (
        /*
          FORM DURUYOR, gönderimi kesiliyor: type="button" yapmak
          JavaScript kapalıyken toplu işlemi tamamen bozardı. Hangi
          düğmeye basıldığı submitter'dan okunuyor (durum value'da);
          okunamazsa forma dokunulmuyor ve normal gönderim çalışıyor.
        */
        <form
          action={bulkStatus}
          className="liste-toplu"
          onSubmit={(olay) => {
            const durum = ((olay.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
            if (!durum) return;
            olay.preventDefault();
            topluUygula(chosen.map((row) => row.id), durum);
          }}
        >
          <input type="hidden" name="back" value={back} />
          {chosen.map((row) => <input key={row.id} type="hidden" name="order_id" value={row.id} />)}
          <b>{chosen.length} sipariş seçildi</b>
          <span className="liste-toplu-eylem">
            {BULK_STEPS.map((step) => {
              const eligible = chosen.filter((row) => row.next?.key === step.key).length;
              return (
                <button key={step.key} className="panel-secondary" type="submit" name="status" value={step.key} disabled={!eligible || topluCalisiyor} title={eligible ? `${eligible} siparişe uygulanır` : "Seçilenlerde bu adıma uygun sipariş yok"}>
                  {step.label} <small>{eligible}</small>
                </button>
              );
            })}
            <button className="panel-secondary" type="button" onClick={() => setSelected(new Set())}>Seçimi temizle</button>
          </span>
        </form>
      ) : null}

      {/*
        SİLME AYRI FORMDA. Durum düğmeleriyle aynı formda olsaydı yanlış
        düğmeye basmak kayıtları yok ederdi; ayrıca silme yetkisi daha
        dar (owner/admin), durum değiştirme manager'a da açık.
      */}
      {canDelete && chosen.length > 0 ? (
        <form action={siparisleriSil} className="liste-toplu is-tehlike">
          <input type="hidden" name="back" value={back} />
          {chosen.map((row) => <input key={row.id} type="hidden" name="order_id" value={row.id} />)}
          <b>Seçilenleri kalıcı olarak sil</b>
          <span className="liste-toplu-eylem">
            <ConfirmSubmit
              className="panel-danger"
              message={`${chosen.length} sipariş KALICI olarak silinecek:\n\n${chosen.slice(0, 10).map((row) => row.number).join("\n")}${chosen.length > 10 ? `\n… ve ${chosen.length - 10} sipariş daha` : ""}\n\nKalemleri, gönderileri ve işlem geçmişi de silinir. Açık siparişlerin stoğu iade edilir. Bu işlem geri alınamaz.`}
            >
              {chosen.length} siparişi sil
            </ConfirmSubmit>
          </span>
        </form>
      ) : null}

      {rows.length ? (
        <div className="talep-tablo">
          <table className="crm-data-table siparis-tablo" data-cols="siparisler">
            <thead>
              <tr>
                {canManage ? (
                  <th className="liste-secim"><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Bu sayfadaki tüm siparişleri seç" /></th>
                ) : null}
                <th>Sipariş</th>
                <th>Müşteri</th>
                <th className="crm-col-amount">Tutar</th>
                <th className="crm-col-amount">Kâr</th>
                <th>Durum</th>
                <th>Kargo</th>
                {canManage ? <th className="siparis-eylem-sutun"><span className="sr-only">Sonraki adım</span></th> : null}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                /* data-islenen: satır beklerken soluklaşıyor. */
                <tr key={row.id} className={selected.has(row.id) ? "is-selected" : undefined} data-islenen={islenen.has(row.id) ? "" : undefined}>
                  {canManage ? (
                    <td className="liste-secim"><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} aria-label={`${row.number} siparişini seç`} /></td>
                  ) : null}
                  <td className="crm-table-mono" data-label="Sipariş">
                    <Link prefetch={false} className="crm-row-link" href={`/siparisler/${row.id}`} title={row.number}>{row.number}</Link>
                    <small className="crm-cell-sub">{row.date}</small>
                  </td>
                  <td data-label="Müşteri">
                    <b className="crm-cell-main" title={row.customer}>{row.customer}</b>
                    <small className="crm-cell-sub">
                      {row.source}
                      {row.transfer ? <span className="status-pill" data-tone="gold">Havale</span> : null}
                    </small>
                  </td>
                  <td className="crm-col-amount" data-label="Tutar">{row.total}</td>
                  <td className="crm-col-amount" data-label="Kâr">
                    {row.kar ? (
                      <>
                        <b className={row.kar.eksi ? "is-eksi" : undefined}>{row.kar.tutar}</b>
                        <small className="crm-cell-sub">%{row.kar.oran.toLocaleString("tr-TR")}</small>
                      </>
                    ) : (
                      /* Sebep başlıkta: maliyet eksik mi, sipariş kapalı mı. */
                      <span className="crm-cell-sub" title="Maliyeti eksik ya da sipariş kapandı (iptal / iade)">—</span>
                    )}
                  </td>
                  <td data-label="Durum"><span className="status-pill" data-tone={rozetTonu(row.badge.tone)}>{row.badge.label}</span></td>
                  <td data-label="Kargo">
                    <span className="status-pill" data-tone={KARGO_TONU(row.kargo)}>{row.kargo.sorunlu ? "Sorunlu" : KARGO_ETIKETI[row.kargo.durum]}</span>
                  </td>
                  {canManage ? (
                    <td className="siparis-eylem-sutun">
                      {row.next ? (
                        /*
                          FORM DURUYOR, yalnızca gönderimi kesiliyor: JS varsa
                          yerinde işleniyor, yoksa form normal gönderilip
                          quickStatus'un yönlendirmeli yolundan geçiyor.
                        */
                        <form
                          action={quickStatus}
                          onSubmit={(olay) => {
                            olay.preventDefault();
                            ilerlet(row.id, row.next!.key);
                          }}
                        >
                          <input type="hidden" name="order_id" value={row.id} />
                          <input type="hidden" name="status" value={row.next.key} />
                          <input type="hidden" name="back" value={back} />
                          <button type="submit" className="panel-secondary siparis-ilerlet" disabled={islenen.has(row.id)}>
                            {islenen.has(row.id) ? "Gönderiliyor…" : `${row.next.label} →`}
                          </button>
                        </form>
                      ) : null}
                    </td>
                  ) : null}
                  <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                  <MobilSatir
                    href={`/siparisler/${row.id}`}
                    baslik={row.customer}
                    durum={{ etiket: row.badge.label, ton: rozetTonu(row.badge.tone) }}
                    alt={[row.number, row.date]}
                    isaretler={[
                      { metin: row.total, ton: "guclu" },
                      { metin: row.kargo.sorunlu ? "Kargo sorunlu" : `Kargo: ${KARGO_ETIKETI[row.kargo.durum]}`, ton: row.kargo.sorunlu ? "tehlike" : "sessiz" },
                      row.transfer ? { metin: "Havale", ton: "uyari" } : null,
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
