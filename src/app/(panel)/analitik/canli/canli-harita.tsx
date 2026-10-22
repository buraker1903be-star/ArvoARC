"use client";

import { useState } from "react";
import {
  DUNYA_YOLU,
  HARITA_GENISLIK,
  HARITA_YUKSEKLIK,
  haritaX,
  haritaY,
} from "@/lib/dunya-haritasi";
import type { Nokta } from "./veri";

/*
  CANLI ZİYARET HARİTASI.

  HARİTA KENDİ ÇİZİMİMİZ: dış bir harita servisi (karo sunucusu)
  kullanılmıyor — ücret yok, ziyaretçi başına dışarıya giden istek
  yok, panel internetsiz ortamda da açılıyor. Kıtaların yolu derleme
  anında üretiliyor (scripts/dunya-haritasi-uret.mjs) ve antimeridyeni
  geçen çokgenler bölünüyor; bölünmediği sürümde harita kenardan
  kenara atlayan çizgilerle doluydu.

  "YAKIN" GÖRÜNÜM (22.10.2026, ArvoOS'un analitik modülünden):
  ziyaretçilerin çoğu Türkiye'den ve dünya görünümünde hepsi tek bir
  beneğe biniyordu. Pencere noktaların çevresine odaklanıyor; en dar
  pencere ~140 birim, tek noktada bile çevresi görünsün.

  YENİLEME SAYFADAN: bu bileşen artık yalnızca görünüm seçimini
  tutuyor. Önceden on saniyede bir kendi sunucu işlemini çağırıyordu
  ama yeni düzende şerit, akış, açık sayfalar ve kaynaklar da canlı —
  hepsini tek tek istemciye taşımak yerine sayfa tazeleniyor
  (yenile.tsx).
*/

const EN_DAR = 140;

function yakinPencere(noktalar: Nokta[]) {
  const xs = noktalar.map((n) => haritaX(n.lon));
  const ys = noktalar.map((n) => haritaY(n.lat));
  let gen = Math.max(EN_DAR, (Math.max(...xs) - Math.min(...xs)) * 1.5);
  let yuk = Math.max(gen / 2, (Math.max(...ys) - Math.min(...ys)) * 1.5);
  /* Oran 2:1 sabit — eşlenik dikdörtgen izdüşümünde harita böyle. */
  gen = Math.min(HARITA_GENISLIK, Math.max(gen, yuk * 2));
  yuk = gen / 2;
  const ortaX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const ortaY = (Math.max(...ys) + Math.min(...ys)) / 2;
  const x = Math.min(Math.max(0, ortaX - gen / 2), HARITA_GENISLIK - gen);
  const y = Math.min(Math.max(0, ortaY - yuk / 2), HARITA_YUKSEKLIK - yuk);
  return { x, y, gen, yuk };
}

export function CanliHarita({ noktalar }: { noktalar: Nokta[] }) {
  const [gorunum, setGorunum] = useState<"yakin" | "dunya">("yakin");
  const yakin = gorunum === "yakin" && noktalar.length > 0;
  const pencere = yakin
    ? yakinPencere(noktalar)
    : { x: 0, y: 0, gen: HARITA_GENISLIK, yuk: HARITA_YUKSEKLIK };
  /* Nokta ve çizgi boyu ekranda sabit kalsın: yakınlaşınca viewBox
     küçülüyor ve sabit yarıçap orada dev bir leke oluyor. */
  const k = pencere.gen / HARITA_GENISLIK;
  const enCok = Math.max(1, ...noktalar.map((n) => n.adet));
  /* Büyükten küçüğe çizilir: küçük nokta büyüğün altında kaybolmasın. */
  const sirali = [...noktalar].sort((a, b) => b.adet - a.adet);

  return (
    <div className="an-harita">
      <div className="an-harita-arac" role="group" aria-label="Harita görünümü">
        <button
          type="button"
          className="an-hap"
          aria-pressed={gorunum === "yakin"}
          onClick={() => setGorunum("yakin")}
          disabled={noktalar.length === 0}
        >
          Yakın
        </button>
        <button
          type="button"
          className="an-hap"
          aria-pressed={gorunum === "dunya"}
          onClick={() => setGorunum("dunya")}
        >
          Dünya
        </button>
      </div>
      <svg
        viewBox={`${pencere.x} ${pencere.y} ${pencere.gen} ${pencere.yuk}`}
        role="img"
        aria-label={
          noktalar.length
            ? `Son bir saatte ${noktalar.length} konumdan ziyaret`
            : "Son bir saatte konumlu ziyaret yok"
        }
        preserveAspectRatio="xMidYMid meet"
      >
        <path className="an-kita" d={DUNYA_YOLU} strokeWidth={0.6 * k} />
        {sirali.map((n) => {
          /* Yarıçap KAREKÖKLE: doğrusal büyütmede kırk ziyaretli bir
             şehir ekranı kaplıyordu. */
          const r = (3 + 7 * Math.sqrt(n.adet / enCok)) * k;
          /* Yeni ziyaret parlak, bir saatlik soluk. */
          const saydam = 1 - Math.min(n.dakika, 60) / 90;
          return (
            <g
              key={`${n.lat},${n.lon}`}
              transform={`translate(${haritaX(n.lon)} ${haritaY(n.lat)})`}
            >
              {n.dakika <= 2 ? (
                <circle className="an-dalga" r={r} style={{ ["--k" as string]: k }} />
              ) : null}
              <circle className="an-nokta" r={r} opacity={saydam} strokeWidth={1.2 * k}>
                <title>
                  {`${[n.city, n.country].filter(Boolean).join(", ") || "Bilinmeyen konum"} · ${n.adet} ziyaret · ${n.dakika ? `${n.dakika} dk önce` : "şimdi"}`}
                </title>
              </circle>
              {/* Yalnızca en yoğun noktanın adı yazılıyor: her noktaya
                  etiket koymak yakın görünümde okunmaz bir yığın
                  üretiyordu. */}
              {yakin && n.city && n.adet === sirali[0].adet ? (
                <text
                  className="an-etiket"
                  y={-r - 4 * k}
                  fontSize={11 * k}
                  textAnchor="middle"
                >
                  {n.city}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {noktalar.length === 0 ? (
        <p className="an-harita-bos">
          Son bir saatte konumu bilinen ziyaret yok. Konum Vercel&apos;in
          kenar başlıklarından geliyor; yerel geliştirmede boş kalır.
        </p>
      ) : null}
    </div>
  );
}
