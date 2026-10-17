import type { CSSProperties } from "react";
import "./mini-seri.css";

/*
  MİNİ SERİ ve ÖLÇER (17.10.2026).

  Liste sayfalarının istatistik kutuları yalnızca bir SAYI
  gösteriyordu: "Yeni · 30 gün 4" artıyor mu azalıyor mu, "Tekrar eden
  %24" iyi mi kötü mü — sayının yanında cevabı yoktu. Raporlar
  sayfasındaki gösterge kartlarının küçük kardeşi: aynı dil (altı ay
  çubuk, oran çubuğu), dar kutuya sığacak boyda.

  Sunucuda çizilen SVG yok, CSS var: istemci kodu ve kütüphane yok.
*/

export type SeriNoktasi = { ad: string; deger: number; etiket: string; simdiki?: boolean };

const degisken = (ad: string, deger: string) => ({ [ad]: deger }) as CSSProperties;

export function MiniSeri({ seri, etiket }: { seri: SeriNoktasi[]; etiket: string }) {
  const enBuyuk = Math.max(1, ...seri.map((n) => n.deger));
  return (
    <div className="mini-seri" role="img" aria-label={`${etiket}: ${seri.map((n) => `${n.ad} ${n.etiket}`).join(", ")}`}>
      {seri.map((nokta) => (
        <span key={nokta.ad} className={nokta.simdiki ? "is-simdiki" : undefined} title={`${nokta.ad}: ${nokta.etiket}`}>
          {/* Boş ay da bir çubuk bırakıyor: aradaki boşluk "veri yok"
              ile "sıfır" arasındaki farkı siliyordu. */}
          <i style={degisken("--h", `${nokta.deger ? Math.max(10, (nokta.deger / enBuyuk) * 100) : 4}%`)} />
          <small>{nokta.ad}</small>
        </span>
      ))}
    </div>
  );
}

/** 0–100 arası oranı gösteren ince çubuk; oran null ise çizilmez. */
export function MiniOlcer({ oran, ton }: { oran: number | null; ton?: "uyari" }) {
  if (oran === null) return null;
  const sinirli = Math.max(0, Math.min(100, oran));
  return <span className="mini-olcer" data-ton={ton} aria-hidden="true"><i style={degisken("--w", `${sinirli}%`)} /></span>;
}
