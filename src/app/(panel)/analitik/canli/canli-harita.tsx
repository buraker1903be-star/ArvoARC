"use client";

import { useEffect, useState } from "react";
import {
  DUNYA_YOLU,
  HARITA_GENISLIK,
  HARITA_YUKSEKLIK,
  haritaX,
  haritaY,
} from "@/lib/dunya-haritasi";
import { canliYenile } from "./actions";
import type { CanliVeri } from "./veri";

/**
 * Canlı ziyaret haritası.
 *
 * HARİTA KENDİ ÇİZİMİMİZ: dış bir harita servisi (karo sunucusu)
 * kullanılmıyor. Üç sebeple — ücret, her ziyaretçi için dışarıya
 * giden istek, ve panelin internetsiz ortamda da açılması.
 * Kıtaların yolu derleme anında üretiliyor
 * (scripts/dunya-haritasi-uret.mjs).
 *
 * YENİLEME ON SANİYEDE BİR. Gerçek zamanlı abonelik (Realtime)
 * `arc_visits` tablosunu tarayıcıya açmayı gerektirirdi; tablo
 * RLS politikasız ve öyle kalmalı. On saniye "canlı" hissi için
 * fazlasıyla yeterli ve sekme arkada kalınca duruyor.
 */
export function CanliHarita({ ilk }: { ilk: CanliVeri }) {
  const [veri, setVeri] = useState(ilk);
  const [yenileniyor, setYenileniyor] = useState(false);

  useEffect(() => {
    let acik = true;

    const yenile = () => {
      /* Sekme arkadayken istek atmıyoruz: açık bırakılan bir panel
         gün boyu boşa sorgu üretirdi. */
      if (document.visibilityState !== "visible") return;
      setYenileniyor(true);
      void canliYenile()
        .then((yeni) => {
          if (acik) setVeri(yeni);
        })
        .finally(() => {
          if (acik) setYenileniyor(false);
        });
    };

    const zamanlayici = setInterval(yenile, 10000);
    document.addEventListener("visibilitychange", yenile);
    return () => {
      acik = false;
      clearInterval(zamanlayici);
      document.removeEventListener("visibilitychange", yenile);
    };
  }, []);

  return (
    <div className="talep-izgara canli">
      <section className="panel-card canli-harita-kart">
        <header className="canli-bas">
          <div>
            <b>{veri.suAn}</b>
            <span>şu an sitede</span>
          </div>
          <div>
            <b>{veri.gunluk.toLocaleString("tr-TR")}</b>
            <span>son 24 saatte sayfa</span>
          </div>
          <div>
            <b>{veri.noktalar.length}</b>
            <span>son 1 saatte konum</span>
          </div>
          <span className="canli-nabiz" data-calisiyor={yenileniyor ? "" : undefined}>
            Canlı
          </span>
        </header>

        <svg
          className="canli-harita"
          viewBox={`0 0 ${HARITA_GENISLIK} ${HARITA_YUKSEKLIK}`}
          role="img"
          aria-label={`Son bir saatte ${veri.noktalar.length} konumdan ziyaret`}
        >
          <path className="canli-kita" d={DUNYA_YOLU} />

          {veri.noktalar.map((nokta, sira) => (
            <g
              key={`${nokta.lat}-${nokta.lon}-${sira}`}
              transform={`translate(${haritaX(nokta.lon)} ${haritaY(nokta.lat)})`}
            >
              {/*
                YENİ ZİYARET DAHA PARLAK. Noktalar üst üste
                binince hangisinin şimdi olduğu anlaşılmıyordu;
                saydamlık yaşla azalıyor (0 dk tam, 60 dk soluk).
              */}
              <circle className="canli-dalga" r="7" opacity={nokta.dakika <= 2 ? 0.5 : 0} />
              <circle
                className="canli-nokta"
                r="2.6"
                opacity={1 - Math.min(nokta.dakika, 60) / 85}
              >
                <title>
                  {[nokta.city, nokta.country].filter(Boolean).join(" · ") ||
                    "Bilinmeyen konum"}
                  {` · ${nokta.dakika} dk önce`}
                </title>
              </circle>
            </g>
          ))}
        </svg>

        {veri.noktalar.length === 0 ? (
          <p className="canli-bos">
            Son bir saatte konumu bilinen ziyaret yok. Konum Vercel&apos;in
            kenar başlıklarından geliyor; yerel geliştirmede boş kalır.
          </p>
        ) : null}
      </section>

      <div className="canli-listeler">
        <Liste
          baslik="En çok tıklanan ürünler"
          alt="son 24 saat"
          satirlar={veri.urunler.map((u) => ({
            ad: u.ad,
            adet: u.adet,
            href: `/urunler?q=${encodeURIComponent(u.slug)}`,
          }))}
          bos="Henüz ürün sayfası açılmamış."
        />
        {/* Kaynak ürünlerden SONRA, ülkelerden ÖNCE: "nereden
            geldi" sorusu "hangi ülkeden" sorusundan daha sık
            soruluyor. */}
        <Liste
          baslik="Nereden geldi"
          alt="son 24 saat"
          satirlar={veri.kaynaklar.map((k) => ({ ad: k.ad, adet: k.adet }))}
          bos="Kaynak bilgisi gelmemiş."
        />
        <Liste
          baslik="Ülkeler"
          alt="son 24 saat"
          satirlar={veri.ulkeler.map((u) => ({ ad: u.ad, adet: u.adet }))}
          bos="Konum bilgisi gelmemiş."
        />
        <Liste
          baslik="Şehirler"
          alt="son 24 saat"
          satirlar={veri.sehirler.map((s) => ({ ad: s.ad, adet: s.adet }))}
          bos="Konum bilgisi gelmemiş."
        />
      </div>
    </div>
  );
}

function Liste({
  baslik,
  alt,
  satirlar,
  bos,
}: {
  baslik: string;
  alt: string;
  satirlar: Array<{ ad: string; adet: number; href?: string }>;
  bos: string;
}) {
  const enYuksek = satirlar[0]?.adet ?? 0;
  return (
    <section className="panel-card canli-liste">
      <h3>
        {baslik} <small>{alt}</small>
      </h3>
      {satirlar.length === 0 ? (
        <p className="canli-bos">{bos}</p>
      ) : (
        <ol>
          {satirlar.map((satir) => (
            <li key={satir.ad}>
              {/* Çubuk en yüksek değere göre: sayıları okumadan
                  oranı görmek için. */}
              <i style={{ width: `${enYuksek ? (satir.adet / enYuksek) * 100 : 0}%` }} />
              <span>{satir.ad}</span>
              <b>{satir.adet.toLocaleString("tr-TR")}</b>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
