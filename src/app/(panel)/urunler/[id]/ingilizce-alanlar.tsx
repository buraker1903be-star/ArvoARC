"use client";

import { useState } from "react";

/*
  İNGİLİZCE AD VE AÇIKLAMA.

  Çeviri kurum sahibinin kendi sunucusundaki açık ağırlıklı bir
  modelden geliyor (scripts/ceviri-uret.mjs) ve kalitesi DEĞİŞKEN:
  birkaç adın tuhaf çıkması kaçınılmaz. Elle düzeltmenin tek yolu
  SQL olmamalı.

  BOŞ BIRAKMAK GEÇERLİ BİR SEÇİM: alan silinince ürün İngilizce
  vitrinde Türkçe adıyla görünüyor. Yani yanlış bir çeviriyi geri
  almanın yolu var ve bu, yanlış çeviriyle yaşamaktan iyi — Türkçe
  ad dürüst, yarım çeviri değil.
*/
export function IngilizceAlanlar({
  adEn,
  aciklamaEn,
  turkceAd,
  bayat,
}: {
  adEn: string;
  aciklamaEn: string;
  turkceAd: string;
  /** Türkçe ad çeviriden SONRA değişti mi? */
  bayat: boolean;
}) {
  const [ad, setAd] = useState(adEn);
  const [aciklama, setAciklama] = useState(aciklamaEn);

  return (
    <section className="product-editor-section">
      <div className="product-editor-heading">
        <div>
          <small>İNGİLİZCE VİTRİN</small>
          <h4>İngilizce ad ve açıklama</h4>
        </div>
        <span>{ad ? "Çevirisi var" : "Çevirisi yok"}</span>
      </div>

      {bayat ? (
        /*
          BAYATLIK UYARISI. Türkçe ad çeviriden sonra değiştiyse
          (tedarikçi güncellemesi, elle düzeltme) çeviri eskimiş
          demek ve bunu hiçbir şey söylemiyordu: ürün sayfası
          İngilizce tarafta ESKİ adı göstermeye devam ediyordu.
        */
        <p className="list-hint" role="status">
          Türkçe ad bu çeviriden sonra değişti; çeviri eskimiş olabilir.
        </p>
      ) : null}

      <div className="editor-field-grid">
        <label className="full-field">
          İngilizce ad{" "}
          <span className={ad.length > 200 ? "field-count over" : "field-count"}>
            {ad.length}/200
          </span>
          <input
            name="name_en"
            value={ad}
            onChange={(event) => setAd(event.target.value)}
            maxLength={200}
            placeholder={turkceAd}
          />
          <small>
            Boş bırakılırsa ürün İngilizce vitrinde Türkçe adıyla görünür.
          </small>
        </label>
        <label className="full-field">
          İngilizce açıklama
          <textarea
            name="description_en"
            value={aciklama}
            onChange={(event) => setAciklama(event.target.value)}
            rows={8}
            maxLength={4000}
            placeholder="Boş bırakılırsa Türkçe açıklama gösterilir."
          />
        </label>
      </div>
    </section>
  );
}
