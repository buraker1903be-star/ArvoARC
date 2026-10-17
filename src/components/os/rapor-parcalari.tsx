import type { CSSProperties, ReactNode } from "react";

/*
  Kaynak: ArvoOS/app/panel/finance/raporlar/page.tsx (17.10.2026).

  Raporlar sayfasının SUNUM parçaları: simge seti, mini grafikler,
  gösterge kartı ve defter tablosu. ArvoOS'ta sayfanın içindeydi;
  ArvoARC'ta ayrı dosyada çünkü sayfanın kendi hesabı zaten uzun ve
  bu parçalar ikinci bir rapor ekranında da kullanılabilir.

  Grafikler sunucuda çizilen SVG ve CSS: istemci kodu, kütüphane yok.
  Biçimi components/os/raporlar.css veriyor (o da ArvoOS kopyası).
*/

const para = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
/** Rapor ekranında kuruş gösterilmiyor: sayılar yan yana okunuyor. */
export const paraYaz = (kurus: number) => para.format(Math.round(kurus) / 100);
/** Negatif oran "−%184" (eskiden "%-184" yazılıyordu). */
export const yuzde = (deger: number) => (Math.round(deger) < 0 ? `−%${Math.abs(Math.round(deger))}` : `%${Math.round(deger)}`);
/** Satır içi CSS değişkeni (--w, --h); CSS tarafında her zaman fallback'li okunur. */
export const cssDegisken = (ad: string, deger: string) => ({ [ad]: deger }) as CSSProperties;
export const oranSinirla = (deger: number) => Math.max(0, Math.min(100, deger));
/** Düşülen kalem: "−₺1.250"; sıfırsa işaretsiz. */
export const dusum = (kurus: number) => (kurus ? `−${paraYaz(kurus)}` : paraYaz(0));
export const payi = (deger: number, taban: number) => (taban ? (deger / taban) * 100 : null);

export type Ton = "brand" | "info" | "gold" | "success" | "warning" | "danger";
export type SeriNoktasi = { ad: string; deger: number; etiket: string; simdiki?: boolean };
export type Grafik =
  | { tur: "cubuk"; seri: SeriNoktasi[] }
  | { tur: "halka"; oran: number | null; altyazi: string }
  | { tur: "gosterge"; oran: number }
  | { tur: "yigin"; parcalar: { ad: string; deger: number; ton: Ton }[] }
  | { tur: "selale"; adimlar: { ad: string; deger: number; ton: Ton }[] };
export type Gosterge = { etiket: string; deger: string; not: string; simge: string; ton: Ton; tonlu?: boolean; grafik: Grafik };
export type DefterSatiri = { etiket: string; ipucu: string; tutar: string; pay: number | null; ton: Ton };

const simgeYollari: Record<string, ReactNode> = {
  kutu: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" /></>,
  para: <><rect x="2.5" y="5.5" width="19" height="14" rx="2.5" /><path d="M16 12.5h2.5" /><path d="M2.5 9.5h19" /></>,
  sepet: <><path d="M6 7h15l-1.6 8.4a2 2 0 0 1-2 1.6H9.4a2 2 0 0 1-2-1.6L5.5 4.5H2.5" /><circle cx="10" cy="20" r="1.2" /><circle cx="18" cy="20" r="1.2" /></>,
  grafik: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M21 20H3" /></>,
  geri: <><path d="M4 8h13" /><path d="m14 5 3 3-3 3" /><path d="M20 16H7" /><path d="m10 13-3 3 3 3" /></>,
  kargo: <><path d="M3 7.5h11v9H3Z" /><path d="M14 10.5h3.6l2.9 3v3H14Z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17.5" cy="18" r="1.6" /></>,
  etiket: <><path d="M4 4h7.5L20 12.5 12.5 20 4 11.5Z" /><circle cx="8.5" cy="8.5" r="1.3" /></>,
  uyari: <><path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4" /><path d="M12 17h.01" /></>,
  kisi: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.3a6.5 6.5 0 0 1 3.5 5.7" /></>,
  kalp: <><path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10Z" /></>,
  kivilcim: <><path d="M4 16.5 9 11l3.5 3.5L20 7" /><path d="M15 7h5v5" /></>,
};

export function Simge({ ad, boy = 18 }: { ad: string; boy?: number }) {
  return (
    <svg width={boy} height={boy} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {simgeYollari[ad]}
    </svg>
  );
}

export function MiniGrafik({ grafik }: { grafik: Grafik }) {
  if (grafik.tur === "cubuk") {
    const enBuyuk = Math.max(1, ...grafik.seri.map((n) => n.deger));
    return (
      <div className="rpt-mini rpt-mini-cubuk" role="img" aria-label={grafik.seri.map((n) => `${n.ad} ${n.etiket}`).join(", ")}>
        {grafik.seri.map((n) => (
          <span key={n.ad} className={n.simdiki ? "is-current" : undefined} title={`${n.ad}: ${n.etiket}`}>
            <i style={cssDegisken("--h", `${n.deger ? Math.max(8, (n.deger / enBuyuk) * 100) : 3}%`)} />
            <small>{n.ad}</small>
          </span>
        ))}
      </div>
    );
  }
  if (grafik.tur === "halka") {
    const cevre = 2 * Math.PI * 22;
    const oran = grafik.oran === null ? 0 : oranSinirla(grafik.oran);
    return (
      <div className="rpt-mini rpt-mini-halka">
        <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
          <circle className="rpt-halka-iz" cx="28" cy="28" r="22" />
          <circle className="rpt-halka-dolu" cx="28" cy="28" r="22" strokeDasharray={`${(oran / 100) * cevre} ${cevre}`} transform="rotate(-90 28 28)" />
          <text x="28" y="32" textAnchor="middle">{grafik.oran === null ? "—" : yuzde(grafik.oran)}</text>
        </svg>
        <span>{grafik.altyazi}</span>
      </div>
    );
  }
  if (grafik.tur === "gosterge") {
    const oran = oranSinirla(grafik.oran);
    const uzunluk = Math.PI * 40;
    return (
      <div className="rpt-mini rpt-mini-gosterge" role="img" aria-label={`Oran ${yuzde(grafik.oran)}`}>
        <svg viewBox="0 0 100 56" width="100" height="56" aria-hidden="true">
          <path className="rpt-halka-iz" d="M10 50 A40 40 0 0 1 90 50" />
          <path className="rpt-halka-dolu" d="M10 50 A40 40 0 0 1 90 50" strokeDasharray={`${(oran / 100) * uzunluk} ${uzunluk}`} />
        </svg>
      </div>
    );
  }
  if (grafik.tur === "yigin") {
    const toplam = grafik.parcalar.reduce((t, p) => t + Math.max(0, p.deger), 0);
    return (
      <div className="rpt-mini rpt-mini-yigin">
        <div className="rpt-yigin-cubuk" aria-hidden="true">
          {toplam ? grafik.parcalar.map((p) => <i key={p.ad} data-tone={p.ton} style={cssDegisken("--w", `${(Math.max(0, p.deger) / toplam) * 100}%`)} />) : null}
        </div>
        <ul className="rpt-mini-lejant">
          {grafik.parcalar.map((p) => <li key={p.ad} data-tone={p.ton}><i />{p.ad} <b>{paraYaz(p.deger)}</b></li>)}
        </ul>
      </div>
    );
  }
  const taban = Math.max(1, ...grafik.adimlar.map((a) => Math.abs(a.deger)));
  return (
    <ul className="rpt-mini rpt-mini-selale">
      {grafik.adimlar.map((a) => (
        <li key={a.ad} data-tone={a.ton}>
          <span>{a.ad}</span>
          <span className="rpt-selale-iz"><i style={cssDegisken("--w", `${Math.max(a.deger ? 3 : 0, (Math.abs(a.deger) / taban) * 100)}%`)} /></span>
        </li>
      ))}
    </ul>
  );
}

export function GostergeKarti({ gosterge }: { gosterge: Gosterge }) {
  return (
    <article className="rpt-widget" data-tone={gosterge.ton}>
      <header className="rpt-widget-bas">
        <span className="rpt-widget-icon"><Simge ad={gosterge.simge} /></span>
        <small>{gosterge.etiket}</small>
      </header>
      <strong className={gosterge.tonlu ? "is-toned" : undefined}>{gosterge.deger}</strong>
      <MiniGrafik grafik={gosterge.grafik} />
      <span className="rpt-widget-note">{gosterge.not}</span>
    </article>
  );
}

export function Defter({ baslik, altyazi, satirlar, toplam }: { baslik: string; altyazi: string; satirlar: DefterSatiri[]; toplam: DefterSatiri }) {
  const payHucresi = (satir: DefterSatiri) => (
    <td className="rpt-share">
      <span className="rpt-share-bar" data-tone={satir.ton} aria-hidden="true"><i style={cssDegisken("--w", `${satir.pay === null ? 0 : oranSinirla(satir.pay)}%`)} /></span>
      <span className="rpt-share-value">{satir.pay === null ? "—" : yuzde(satir.pay)}</span>
    </td>
  );
  return (
    <div className="rpt-ledger">
      <h3>{baslik}</h3>
      <div className="rpt-table-wrap">
        <table className="rpt-table">
          <caption>{altyazi}</caption>
          <thead><tr><th scope="col">Kalem</th><th scope="col">Pay</th><th scope="col" className="rpt-money">Tutar</th></tr></thead>
          <tbody>
            {satirlar.map((satir) => (
              <tr key={satir.etiket}>
                <th scope="row"><b>{satir.etiket}</b><small>{satir.ipucu}</small></th>
                {payHucresi(satir)}
                <td className="rpt-money">{satir.tutar}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr data-tone={toplam.ton}>
              <th scope="row"><b>{toplam.etiket}</b><small>{toplam.ipucu}</small></th>
              {payHucresi(toplam)}
              <td className="rpt-money">{toplam.tutar}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
