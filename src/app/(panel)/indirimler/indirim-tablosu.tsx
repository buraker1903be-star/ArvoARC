"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { indirimDurumSonuc, topluIndirimDurumu } from "./actions";
import { KNot } from "@/components/arvo-ui/k-ui";
import { MobilSatir } from "@/components/arvo-ui/mobil-satir";
import { SatirTiklama } from "@/components/arvo-ui/satir-tiklama";
import { rozetTonu } from "@/lib/rozet-tonu";
import "@/components/arvo-ui/liste-ek.css";

export type IndirimSatiri = {
  id: string;
  ad: string;
  /*
    Ad satırının ALTINDAKİ metin: kupon kodu ya da "otomatik". Adın
    kendisiyle aynıysa sayfa onu null veriyor — "ARVO10 / ARVO10" diye
    iki kez yazılıyordu.
  */
  altSatir: string | null;
  /** Kuralın tek cümlesi: "%10 indirim", "Ücretsiz kargo". */
  kural: string;
  /** Minimum sepet tutarı; koşulsuz kuralda null. */
  kosul: string | null;
  /** Kullanım: "12/100", "12" ya da hiç kullanılmadıysa null. */
  kullanim: string | null;
  /** Limitin doluluk oranı (0–1). Limitsizde null. */
  kullanimOrani: number | null;
  /** Geçerlilik aralığı; süresizse null. */
  tarih: string | null;
  suresiGecti: boolean;
  bitiyor: boolean;
  durum: { label: string; tone?: string };
  aktifMi: boolean;
};

/*
  İndirim listesi.

  Eskiden iki kart ve iOS listeleri vardı: bütün kurallar tek sayfada,
  arama ve süzgeç yok, sayılar bellekte. Artık sipariş listesinin
  kalıbı — tablo, sunucuda süzme/sayma/sayfalama, satır tıklanabilir
  ve kampanya DETAYINA gidiyor.

  TOPLU İŞLEM YALNIZCA DURUM. Silme toplu yapılmıyor: kampanya
  silinince kullanım geçmişi de gidiyor (usage_count kayıtta duruyor,
  başka yerde değil) ve yanlış satırı seçip silmek geri alınamaz. Silme
  detayda, tek tek ve onaylı.
*/
export function IndirimTablosu({ satirlar, canManage, bos, children }: {
  satirlar: IndirimSatiri[];
  canManage: boolean;
  bos: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [secili, setSecili] = useState<ReadonlySet<string>>(() => new Set());
  const secilenler = satirlar.filter((satir) => secili.has(satir.id));
  const hepsiSecili = satirlar.length > 0 && secilenler.length === satirlar.length;
  const duraklatilabilir = secilenler.filter((satir) => satir.aktifMi);
  const etkinlestirilebilir = secilenler.filter((satir) => !satir.aktifMi);

  const degistir = (id: string) =>
    setSecili((simdiki) => {
      const sonraki = new Set(simdiki);
      if (sonraki.has(id)) sonraki.delete(id);
      else sonraki.add(id);
      return sonraki;
    });
  const hepsiniDegistir = () => setSecili(hepsiSecili ? new Set() : new Set(satirlar.map((satir) => satir.id)));

  const [islenen, setIslenen] = useState<ReadonlySet<string>>(() => new Set());
  const [sonuc, setSonuc] = useState<{ tur: "hata" | "basari"; metin: string } | null>(null);
  const [, basla] = useTransition();
  const [topluCalisiyor, topluBasla] = useTransition();

  /* Durum YERİNDE değişiyor: eylem sonuç döndürüyor, içindeki
     revalidatePath veriyi yeniliyor ve kullanıcı kaydırma yerini
     kaybetmiyor (sipariş listesindeki gerekçeyle aynı). */
  const durumDegistir = (id: string, durum: string) => {
    setIslenen((once) => new Set(once).add(id));
    setSonuc(null);
    basla(async () => {
      const cevap = await indirimDurumSonuc(id, durum);
      setIslenen((once) => {
        const sonra = new Set(once);
        sonra.delete(id);
        return sonra;
      });
      if (cevap.hata) setSonuc({ tur: "hata", metin: cevap.hata });
      else if (cevap.basari) setSonuc({ tur: "basari", metin: cevap.basari });
    });
  };

  /* Seçim yalnızca başarıda temizleniyor: durumu değişen kural
     süzgeçten çıkabiliyor, hatada ise seçim korunmalı. */
  const topluDurum = (idler: string[], durum: string) => {
    setSonuc(null);
    topluBasla(async () => {
      const cevap = await topluIndirimDurumu(idler, durum);
      if (cevap.hata) setSonuc({ tur: "hata", metin: cevap.hata });
      else if (cevap.basari) setSonuc({ tur: "basari", metin: cevap.basari });
      if (!cevap.hata) setSecili(new Set());
    });
  };

  return (
    <>
      {sonuc ? <KNot ton={sonuc.tur === "hata" ? "tehlike" : "basari"}>{sonuc.metin}</KNot> : null}

      {canManage && secilenler.length > 0 ? (
        <div className="liste-toplu">
          <b>{secilenler.length} kampanya seçildi</b>
          <span className="liste-toplu-eylem">
            <button
              className="panel-secondary"
              type="button"
              onClick={() => topluDurum(duraklatilabilir.map((s) => s.id), "paused")}
              disabled={!duraklatilabilir.length || topluCalisiyor}
              title={duraklatilabilir.length ? `${duraklatilabilir.length} kampanya duraklatılır; vitrinde anında geçersiz olur` : "Seçilenlerde aktif kampanya yok"}
            >
              Duraklat <small>{duraklatilabilir.length}</small>
            </button>
            <button
              className="panel-secondary"
              type="button"
              onClick={() => topluDurum(etkinlestirilebilir.map((s) => s.id), "active")}
              disabled={!etkinlestirilebilir.length || topluCalisiyor}
              title={etkinlestirilebilir.length ? `${etkinlestirilebilir.length} kampanya etkinleştirilir` : "Seçilenlerde duraklatılmış kampanya yok"}
            >
              Etkinleştir <small>{etkinlestirilebilir.length}</small>
            </button>
            <button className="panel-secondary" type="button" onClick={() => setSecili(new Set())}>Seçimi temizle</button>
          </span>
        </div>
      ) : null}

      {satirlar.length ? (
        <div className="talep-tablo">
          <table className="crm-data-table indirim-tablo" data-cols="indirimler">
            <thead>
              <tr>
                {canManage ? (
                  <th className="liste-secim">
                    <input
                      type="checkbox"
                      checked={hepsiSecili}
                      ref={(kutu) => { if (kutu) kutu.indeterminate = secilenler.length > 0 && !hepsiSecili; }}
                      onChange={hepsiniDegistir}
                      aria-label="Bu sayfadaki tüm kampanyaları seç"
                    />
                  </th>
                ) : null}
                <th>Kampanya</th>
                <th>Kural</th>
                <th>Kullanım</th>
                <th>Geçerlilik</th>
                <th>Durum</th>
                {canManage ? <th className="indirim-eylem-sutun"><span className="sr-only">Durum değiştir</span></th> : null}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((satir) => (
                <tr key={satir.id} className={secili.has(satir.id) ? "is-selected" : undefined} data-islenen={islenen.has(satir.id) ? "" : undefined}>
                  {canManage ? (
                    <td className="liste-secim">
                      <input type="checkbox" checked={secili.has(satir.id)} onChange={() => degistir(satir.id)} aria-label={`${satir.ad} kampanyasını seç`} />
                    </td>
                  ) : null}
                  <td data-label="Kampanya">
                    <Link prefetch={false} className="crm-row-link crm-cell-main" href={`/indirimler/${satir.id}`} title={satir.ad}>{satir.ad}</Link>
                    {satir.altSatir ? <small className="crm-cell-sub crm-table-mono">{satir.altSatir}</small> : null}
                  </td>
                  {/* Kural ve koşulu TEK HÜCREDE: "Tür" ile "Değer" ayrı
                      sütunken birbirini tekrarlıyordu ("Yüzde indirim" +
                      "%10") ve koşul üçüncü bir sütun istiyordu. */}
                  <td data-label="Kural">
                    <b className="crm-cell-main">{satir.kural}</b>
                    {satir.kosul ? <small className="crm-cell-sub">{satir.kosul}</small> : null}
                  </td>
                  <td data-label="Kullanım">
                    {/* Hiç kullanılmamış kural "0 kullanım" diye yazı
                        yazmıyor: üç sütun birden yokluk anlatıyordu. */}
                    {satir.kullanim ? <span className="crm-cell-main">{satir.kullanim}</span> : <span className="crm-cell-sub" title="Henüz kullanılmadı">—</span>}
                    {satir.kullanimOrani !== null && satir.kullanimOrani >= 0.8 ? (
                      <small className="crm-cell-sub is-uyari">limit doluyor</small>
                    ) : null}
                  </td>
                  <td data-label="Geçerlilik">
                    {satir.tarih ? <span className="crm-cell-sub">{satir.tarih}</span> : <span className="crm-cell-sub" title="Başlangıç ve bitiş tarihi yok">süresiz</span>}
                    {satir.suresiGecti ? (
                      <small className="crm-cell-sub"><span className="status-pill" data-tone="danger">süresi geçti</span></small>
                    ) : satir.bitiyor ? (
                      <small className="crm-cell-sub"><span className="status-pill" data-tone="warning">bitmek üzere</span></small>
                    ) : null}
                  </td>
                  <td data-label="Durum"><span className="status-pill" data-tone={rozetTonu(satir.durum.tone)}>{satir.durum.label}</span></td>
                  {canManage ? (
                    <td className="indirim-eylem-sutun">
                      <button
                        type="button"
                        className="panel-secondary indirim-ilerlet"
                        onClick={() => durumDegistir(satir.id, satir.aktifMi ? "paused" : "active")}
                        disabled={islenen.has(satir.id)}
                      >
                        {islenen.has(satir.id) ? "…" : satir.aktifMi ? "Duraklat" : "Etkinleştir"}
                      </button>
                    </td>
                  ) : null}
                  <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                  <MobilSatir
                    href={`/indirimler/${satir.id}`}
                    baslik={satir.ad}
                    durum={{ etiket: satir.durum.label, ton: rozetTonu(satir.durum.tone) }}
                    alt={[satir.altSatir ?? "otomatik", satir.kosul ?? "koşulsuz"]}
                    isaretler={[
                      { metin: satir.kural, ton: "guclu" },
                      satir.kullanim ? { metin: satir.kullanim, ton: "sessiz" } : null,
                      satir.suresiGecti ? { metin: "Süresi geçti", ton: "tehlike" } : satir.bitiyor ? { metin: "Bitmek üzere", ton: "uyari" } : null,
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
