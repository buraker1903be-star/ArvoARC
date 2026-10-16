"use client";

import { Children, useState, type ReactNode } from "react";

/*
  Kayıt detaylarının (talep, teklif) sağ sütunu: yorumlar, postalar ve
  kayıt geçmişi tek akışta, sekmelerle. Eskiden yorumlar ve postalar yan sütunda alt alta,
  kayıt geçmişi sol sütunun en altındaydı; sayfa 1400px boyuna çıkıyor,
  geçmişe ulaşmak için kaydırmak gerekiyordu.

  Panellerin içeriği sunucuda çiziliyor (her biri kendi verisini okuyor);
  burası yalnızca hangisinin görüneceğini seçer. Gizli paneller DOM'da
  kalır, sekme değişince yeniden yüklenmez.
*/
export function TalepAkis({
  sekmeler,
  baslangic = 0,
  tembel = [],
  children,
}: {
  sekmeler: string[];
  /** Açılışta seçili sekme (adresten gelen derin bağlantı için). */
  baslangic?: number;
  /**
   * Yalnızca İLK SEÇİLDİĞİNDE kurulan paneller. İş detayındaki müşteri
   * mesajları bunlardan: panel kurulunca mesajlar okundu sayılıyor ve
   * gizli panel de DOM'da kurulsaydı sayfayı açmak okumak sayılırdı
   * (eskiden sayfa içindeki mesaj bölümünde böyle oluyordu).
   */
  tembel?: number[];
  children: ReactNode;
}) {
  const [secili, setSecili] = useState(baslangic);
  const [acilanlar, setAcilanlar] = useState(() => new Set([baslangic]));
  const sec = (sira: number) => {
    setSecili(sira);
    setAcilanlar((onceki) => (onceki.has(sira) ? onceki : new Set(onceki).add(sira)));
  };
  const paneller = Children.toArray(children);
  return (
    <section className="talep-akis panel-card">
      <div className="talep-akis-sekmeler" role="tablist" aria-label="Talep akışı">
        {sekmeler.map((ad, sira) => (
          <button
            key={ad}
            type="button"
            role="tab"
            id={`talep-sekme-${sira}`}
            aria-selected={sira === secili}
            aria-controls={`talep-panel-${sira}`}
            tabIndex={sira === secili ? 0 : -1}
            className={sira === secili ? "is-active" : undefined}
            onClick={() => sec(sira)}
            onKeyDown={(olay) => {
              if (olay.key !== "ArrowRight" && olay.key !== "ArrowLeft") return;
              const sonraki = (secili + (olay.key === "ArrowRight" ? 1 : -1) + sekmeler.length) % sekmeler.length;
              sec(sonraki);
              document.getElementById(`talep-sekme-${sonraki}`)?.focus();
            }}
          >
            {ad}
          </button>
        ))}
      </div>
      {paneller.map((panel, sira) => (
        <div
          key={sira}
          id={`talep-panel-${sira}`}
          role="tabpanel"
          aria-labelledby={`talep-sekme-${sira}`}
          hidden={sira !== secili}
          className="talep-akis-panel"
        >
          {tembel.includes(sira) && !acilanlar.has(sira) ? null : panel}
        </div>
      ))}
    </section>
  );
}
