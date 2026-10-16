"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { iadeOnaySonuc, topluIadeOnayla } from "./actions";
import { KNot } from "@/components/arvo-ui/k-ui";
import { MobilSatir } from "@/components/arvo-ui/mobil-satir";
import { SatirTiklama } from "@/components/arvo-ui/satir-tiklama";
import { rozetTonu } from "@/lib/rozet-tonu";
import "@/components/arvo-ui/liste-ek.css";

export type IadeSatiri = {
  id: string;
  siparisId: string;
  siparisNo: string;
  musteri: string;
  /** Müşteri adı varsa e-posta alt satırda; yoksa ad olarak kullanıldı. */
  eposta: string;
  tarih: string;
  kalemAdedi: number;
  kalemOzeti: string;
  tutar: string;
  /** Tutarın altındaki açıklama: "kargo dahil", "iade edildi" gibi. */
  tutarAlt: string | null;
  durum: { label: string; tone?: string };
  /** Karar bekleyen talebin yaşı (saat). Sonuçlanmışta null. */
  bekleyenSaat: number | null;
  /** Ürünün geri döneceği yer(ler): tedarikçi ya da kendi deponuz. */
  tedarikciler: string[];
  onaylanabilir: boolean;
  tamamlanabilir: boolean;
};

/*
  BEKLEME YAŞININ RENGİ. İade talebi bekledikçe müşteri bir yerde
  cevap bekliyor; 48 saati geçen talep uyarı, 96 saati geçen tehlike.
  Eşikler keyfi değil: mağazanın iade sayfasında "en geç iki iş günü
  içinde dönüş" yazıyor.
*/
const YAS_TONU = (saat: number): string => (saat >= 96 ? "danger" : saat >= 48 ? "warning" : "neutral");
const yasYazisi = (saat: number) => (saat < 24 ? `${saat} sa` : `${Math.floor(saat / 24)} gün`);

/*
  İade listesi ve toplu onay.

  Eskiden liste kart kart akıyordu: her talep ekranın yarısını kaplayan
  bir kart ve her kartın içinde karar formu. Elli talebin on tanesine
  bakmak için sayfayı sonsuza kaydırmak gerekiyordu ve iki talebi
  karşılaştırmak (aynı müşteri mi, aynı ürün mü) mümkün değildi.

  Artık sipariş listesinin kalıbı: tablo, satır tıklanabilir
  (.crm-row-link + SatirTiklama), karar DETAY sayfasında.

  TOPLU İŞLEME AÇILAN TEK KARAR ONAY. Onay para göndermiyor, yalnızca
  "ürünü gönderebilirsiniz" diyor. Ret talebe özel bir not istiyor,
  para iadesi ise tutar ve stok kararı — ikisi de toplu yapılacak işler
  değil, o yüzden satırdan detaya gidiliyor.
*/
export function IadeTablosu({ satirlar, canResolve, bos, children }: {
  satirlar: IadeSatiri[];
  canResolve: boolean;
  bos: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [secili, setSecili] = useState<ReadonlySet<string>>(() => new Set());
  const secilenler = satirlar.filter((satir) => secili.has(satir.id));
  const onaylanabilirler = secilenler.filter((satir) => satir.onaylanabilir);
  const hepsiSecili = satirlar.length > 0 && secilenler.length === satirlar.length;

  const degistir = (id: string) =>
    setSecili((simdiki) => {
      const sonraki = new Set(simdiki);
      if (sonraki.has(id)) sonraki.delete(id);
      else sonraki.add(id);
      return sonraki;
    });
  const hepsiniDegistir = () => setSecili(hepsiSecili ? new Set() : new Set(satirlar.map((satir) => satir.id)));

  /*
    Karar YERİNDE veriliyor (sipariş listesindeki gerekçeyle aynı):
    eylem sonuç döndürüyor, içindeki revalidatePath veriyi yeniliyor ve
    kullanıcı kaydırma yerini kaybetmiyor. Satırın yeni rozeti
    UYDURULMUYOR; satır "işleniyor" hâline geçiyor, gerçek durum veri
    gelince yerine oturuyor.
  */
  const [islenen, setIslenen] = useState<ReadonlySet<string>>(() => new Set());
  const [sonuc, setSonuc] = useState<{ tur: "hata" | "basari"; metin: string } | null>(null);
  const [, basla] = useTransition();
  const [topluCalisiyor, topluBasla] = useTransition();

  const onayla = (id: string) => {
    setIslenen((once) => new Set(once).add(id));
    setSonuc(null);
    basla(async () => {
      const cevap = await iadeOnaySonuc(id);
      setIslenen((once) => {
        const sonra = new Set(once);
        sonra.delete(id);
        return sonra;
      });
      if (cevap.hata) setSonuc({ tur: "hata", metin: cevap.hata });
      else if (cevap.basari) setSonuc({ tur: "basari", metin: cevap.basari });
    });
  };

  /* Seçim YALNIZCA BAŞARIDA temizleniyor: onaylanan talep bekleyenler
     süzgecinden çıkıyor, hatada ise kullanıcı seçtiklerini kaybetmemeli. */
  const topluOnayla = () => {
    setSonuc(null);
    topluBasla(async () => {
      const cevap = await topluIadeOnayla(onaylanabilirler.map((satir) => satir.id));
      if (cevap.hata) setSonuc({ tur: "hata", metin: cevap.hata });
      else if (cevap.basari) setSonuc({ tur: "basari", metin: cevap.basari });
      if (!cevap.hata) setSecili(new Set());
    });
  };

  return (
    <>
      {sonuc ? <KNot ton={sonuc.tur === "hata" ? "tehlike" : "basari"}>{sonuc.metin}</KNot> : null}

      {canResolve && secilenler.length > 0 ? (
        <div className="liste-toplu">
          <b>{secilenler.length} talep seçildi</b>
          <span className="liste-toplu-eylem">
            <button
              className="panel-secondary"
              type="button"
              onClick={topluOnayla}
              disabled={!onaylanabilirler.length || topluCalisiyor}
              title={onaylanabilirler.length ? `${onaylanabilirler.length} talep onaylanır; müşterilere ürünü gönderebilecekleri bildirilir` : "Seçilenlerde karar bekleyen talep yok"}
            >
              Onayla <small>{onaylanabilirler.length}</small>
            </button>
            {/* Ret ve para iadesi toplu YAPILMIYOR: ikisi de talebe özel
                bilgi istiyor (not, tutar, stok kararı). */}
            <button className="panel-secondary" type="button" onClick={() => setSecili(new Set())}>Seçimi temizle</button>
          </span>
        </div>
      ) : null}

      {satirlar.length ? (
        <div className="talep-tablo">
          <table className="crm-data-table iade-tablo" data-cols="iadeler">
            <thead>
              <tr>
                {canResolve ? (
                  <th className="liste-secim">
                    <input
                      type="checkbox"
                      checked={hepsiSecili}
                      ref={(kutu) => { if (kutu) kutu.indeterminate = secilenler.length > 0 && !hepsiSecili; }}
                      onChange={hepsiniDegistir}
                      aria-label="Bu sayfadaki tüm talepleri seç"
                    />
                  </th>
                ) : null}
                <th>Talep</th>
                <th>Müşteri</th>
                <th>Ürün</th>
                <th className="crm-col-amount">Tutar</th>
                <th>Durum</th>
                <th>Geri dönecek yer</th>
                {canResolve ? <th className="iade-eylem-sutun"><span className="sr-only">Sonraki adım</span></th> : null}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((satir) => (
                <tr key={satir.id} className={secili.has(satir.id) ? "is-selected" : undefined} data-islenen={islenen.has(satir.id) ? "" : undefined}>
                  {canResolve ? (
                    <td className="liste-secim">
                      <input type="checkbox" checked={secili.has(satir.id)} onChange={() => degistir(satir.id)} aria-label={`${satir.siparisNo} talebini seç`} />
                    </td>
                  ) : null}
                  <td className="crm-table-mono" data-label="Talep">
                    <Link prefetch={false} className="crm-row-link" href={`/siparisler/iadeler/${satir.id}`} title={satir.siparisNo}>{satir.siparisNo}</Link>
                    <small className="crm-cell-sub">{satir.tarih}</small>
                  </td>
                  <td data-label="Müşteri">
                    <b className="crm-cell-main" title={satir.musteri}>{satir.musteri}</b>
                    {satir.eposta ? <small className="crm-cell-sub">{satir.eposta}</small> : null}
                  </td>
                  <td data-label="Ürün">
                    <b className="crm-cell-main">{satir.kalemAdedi} ürün</b>
                    <small className="crm-cell-sub" title={satir.kalemOzeti}>{satir.kalemOzeti}</small>
                  </td>
                  <td className="crm-col-amount" data-label="Tutar">
                    <b>{satir.tutar}</b>
                    {satir.tutarAlt ? <small className="crm-cell-sub">{satir.tutarAlt}</small> : null}
                  </td>
                  <td data-label="Durum">
                    <span className="status-pill" data-tone={rozetTonu(satir.durum.tone)}>{satir.durum.label}</span>
                    {/* Bekleme yaşı durumun ALTINDA: hangi talebin unutulduğu
                        listeye bakarken görünmeli, detaya girmeden. */}
                    {satir.bekleyenSaat !== null ? (
                      <small className="crm-cell-sub">
                        <span className="status-pill" data-tone={YAS_TONU(satir.bekleyenSaat)}>{yasYazisi(satir.bekleyenSaat)} bekliyor</span>
                      </small>
                    ) : null}
                  </td>
                  <td data-label="Geri dönecek yer">
                    {satir.tedarikciler.length ? (
                      <>
                        <span className="crm-cell-main">{satir.tedarikciler[0]}</span>
                        {/* İki tedarikçili iade tek paketle geri gönderilemez. */}
                        {satir.tedarikciler.length > 1 ? <small className="crm-cell-sub is-uyari">+{satir.tedarikciler.length - 1} ayrı yer</small> : null}
                      </>
                    ) : <span className="crm-cell-sub">—</span>}
                  </td>
                  {canResolve ? (
                    <td className="iade-eylem-sutun">
                      {satir.onaylanabilir ? (
                        <button type="button" className="panel-secondary iade-ilerlet" onClick={() => onayla(satir.id)} disabled={islenen.has(satir.id)}>
                          {islenen.has(satir.id) ? "Gönderiliyor…" : "Onayla →"}
                        </button>
                      ) : satir.tamamlanabilir ? (
                        /* Para iadesi tek tıkla YAPILMAZ: tutar, not ve stok
                           kararı detayda alınır ve işlem geri alınamaz. */
                        <Link prefetch={false} className="panel-secondary iade-ilerlet" href={`/siparisler/iadeler/${satir.id}`}>İadeyi tamamla →</Link>
                      ) : null}
                    </td>
                  ) : null}
                  <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                  <MobilSatir
                    href={`/siparisler/iadeler/${satir.id}`}
                    baslik={satir.musteri}
                    durum={{ etiket: satir.durum.label, ton: rozetTonu(satir.durum.tone) }}
                    alt={[satir.siparisNo, satir.tarih]}
                    isaretler={[
                      { metin: satir.tutar, ton: "guclu" },
                      { metin: `${satir.kalemAdedi} ürün`, ton: "sessiz" },
                      satir.bekleyenSaat !== null && satir.bekleyenSaat >= 48
                        ? { metin: `${yasYazisi(satir.bekleyenSaat)} bekliyor`, ton: satir.bekleyenSaat >= 96 ? "tehlike" : "uyari" }
                        : null,
                      satir.tedarikciler.length > 1 ? { metin: "İki ayrı tedarikçi", ton: "uyari" } : null,
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
