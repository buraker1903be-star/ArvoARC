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
  /** Kupon kodu; yoksa kural sepette kendiliğinden uygulanıyor. */
  kod: string | null;
  turEtiketi: string;
  deger: string;
  /** Minimum sepet tutarı ya da "alt limitsiz". */
  kosul: string;
  kullanim: string;
  /** Limitin doluluk oranı (0–1). Limitsizde null. */
  kullanimOrani: number | null;
  tarih: string;
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
                <th>Tür</th>
                <th className="crm-col-amount">Değer</th>
                <th>Koşul</th>
                <th>Kullanım</th>
                <th>Tarih</th>
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
                    <Link prefetch={false} className="crm-row-link" href={`/indirimler/${satir.id}`} title={satir.ad}>{satir.ad}</Link>
                    <small className="crm-cell-sub crm-table-mono">{satir.kod ?? "otomatik"}</small>
                  </td>
                  <td data-label="Tür">
                    <span className="crm-cell-main">{satir.turEtiketi}</span>
                    <small className="crm-cell-sub">{satir.kod ? "müşteri kod girer" : "koşul sağlanınca"}</small>
                  </td>
                  <td className="crm-col-amount" data-label="Değer"><b>{satir.deger}</b></td>
                  <td data-label="Koşul"><span className="crm-cell-sub">{satir.kosul}</span></td>
                  <td data-label="Kullanım">
                    <span className="crm-cell-main">{satir.kullanim}</span>
                    {/* Limiti dolmak üzere olan kural sessizce bitiyor:
                        müşteri kodu giriyor, "limit doldu" cevabını alıyor. */}
                    {satir.kullanimOrani !== null && satir.kullanimOrani >= 0.8 ? (
                      <small className="crm-cell-sub is-uyari">limit doluyor</small>
                    ) : null}
                  </td>
                  <td data-label="Tarih">
                    <span className="crm-cell-sub">{satir.tarih}</span>
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
                    alt={[satir.kod ?? "otomatik", satir.turEtiketi]}
                    isaretler={[
                      { metin: satir.deger, ton: "guclu" },
                      { metin: satir.kullanim, ton: "sessiz" },
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
