"use client";

import { useState, useTransition } from "react";
import { maliyetOnizle, maliyetUygula, type FiyatGecisi, type MaliyetOnizleme } from "./actions";

/*
  ALIŞ FİYATI AKTARIMI.

  LR'ın partner portalı fiyat listesi indirmiyor; fiyatlar yalnızca
  giriş yapılmış ekranda görünüyor. Otomatik giriş yapıp kazımak
  denenmedi: şifre saklamayı gerektirir, portalın kullanım şartlarına
  aykırı olması olası ve sayfa değişince sessizce yanlış fiyat çeker —
  maliyet yanlışsa kâr sütunu da yanlış çıkar.

  Bunun yerine kullanıcı tabloyu kopyalayıp buraya yapıştırıyor.
  İki adım: önce ne değişeceğini ESKİ ve YENİ değerle görüyor, sonra
  onaylıyor.
*/

const para = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });

export function MaliyetAktarimi() {
  /*
    İKİ GEÇİŞ: LR'ın sayfasında girişliyken alış, çıkışken müşteri
    fiyatı görünüyor. Hangisini yapıştırdığını kullanıcı söylüyor;
    tahmin etmek, sayfa değişince sessizce yanlış fiyat yazmak demekti.
  */
  const [gecis, setGecis] = useState<FiyatGecisi>("alis");
  /* LR kendi de satıyor: müşteri fiyatı TAVAN, biz altında kalıyoruz. */
  const [indirim, setIndirim] = useState("30");
  const [metin, setMetin] = useState("");
  const [onizleme, setOnizleme] = useState<MaliyetOnizleme | null>(null);
  const [sonuc, setSonuc] = useState<string | null>(null);
  const [calisiyor, basla] = useTransition();

  const esleştir = () =>
    basla(async () => {
      setSonuc(null);
      setOnizleme(await maliyetOnizle(metin, gecis, Math.round(Number(indirim.replace(",", ".")) * 100) || 0));
    });

  const uygula = () =>
    basla(async () => {
      if (!onizleme?.eslesen.length) return;
      const cevap = await maliyetUygula(
        onizleme.eslesen.map((s) => ({ sku: s.sku, kurus: s.yeni, satis: s.satis, ustuCizili: s.ustuCizili })),
        gecis,
      );
      setSonuc(cevap.hata ?? `${cevap.yazilan} ürünün alış fiyatı güncellendi.`);
      setOnizleme(null);
      setMetin("");
    });

  return (
    <section className="ac ac-pad import-card">
      <div className="ac-head">
        <div>
          <h3>LR fiyat aktarımı</h3>
          <p>
            LR portalındaki fiyat tablosunu kopyalayıp yapıştırın. <b>Girişliyken</b> gördüğünüz alış
            fiyatını, <b>çıkışken</b> gördüğünüz müşteri fiyatını ayrı ayrı aktarın.
          </p>
        </div>
      </div>

      <div className="fiyat-gecis">
        <label className="check-inline">
          <input type="radio" name="gecis" checked={gecis === "alis"} onChange={() => { setGecis("alis"); setOnizleme(null); }} />
          <span><b>Alış fiyatı</b><small>LR&apos;a giriş yapmışken görünen; kâr bundan hesaplanıyor</small></span>
        </label>
        <label className="check-inline">
          <input type="radio" name="gecis" checked={gecis === "musteri"} onChange={() => { setGecis("musteri"); setOnizleme(null); }} />
          <span><b>LR müşteri fiyatı</b><small>Çıkışken görünen; satabileceğiniz tavan</small></span>
        </label>
      </div>

      {gecis === "musteri" ? (
        <label className="fiyat-indirim">
          LR fiyatının altında kalınacak tutar (₺)
          <input
            className="ac-input"
            inputMode="decimal"
            value={indirim}
            onChange={(olay) => { setIndirim(olay.target.value); setOnizleme(null); }}
          />
          <small>Satış fiyatı = LR fiyatı − bu tutar. LR fiyatı üstü çizili görünür, yani vitrinde kampanya olur.</small>
        </label>
      ) : null}

      <label className="wide">
        Yapıştırılan satırlar
        <textarea
          className="ac-input maliyet-giris"
          rows={8}
          value={metin}
          onChange={(olay) => setMetin(olay.target.value)}
          placeholder={"LR-12345\tAloe Vera Jel\t340,50\nLR-67890\tGüneş Kremi\t128,00"}
          spellCheck={false}
        />
      </label>
      <p className="order-hint">
        Her satırda bir ürün: SKU ve alış fiyatı. Aradaki ürün adı yok sayılır; ayırıcı sekme, virgül,
        noktalı virgül ya da boşluk olabilir. <b>Satış fiyatını değil, sizin ödediğiniz tutarı yapıştırın.</b>
      </p>

      <div className="maliyet-actions">
        <button className="ac-btn ac-btn-primary" type="button" onClick={esleştir} disabled={calisiyor || !metin.trim()}>
          {calisiyor ? "Okunuyor…" : "Eşleştir"}
        </button>
        {onizleme?.eslesen.length ? (
          <button className="ac-btn" type="button" onClick={uygula} disabled={calisiyor}>
            {onizleme.eslesen.filter((x) => !x.sorun).length} ürüne uygula
          </button>
        ) : null}
      </div>

      {sonuc ? <p className="maliyet-sonuc">{sonuc}</p> : null}

      {onizleme ? (
        <div className="maliyet-onizleme">
          {onizleme.eslesen.length ? (
            <>
              <h4>{onizleme.eslesen.length} ürün eşleşti</h4>
              <ul>
                {onizleme.eslesen.map((satir) => (
                  <li key={satir.sku}>
                    <span><b>{satir.ad}</b><small>{satir.sku}</small></span>
                    {/* Eski ve yeni yan yana: yanlış sütun kopyalandıysa
                        fark burada göze çarpar. */}
                    {/*
                      Müşteri geçişinde hesaplanan satış fiyatı ve üstü
                      çizili değer gösteriliyor: kullanıcı vitrinde ne
                      görüneceğini uygulamadan önce görüyor.
                    */}
                    <em>
                      {satir.sorun ? (
                        <span className="fiyat-sorun">{satir.sorun} · atlanacak</span>
                      ) : satir.satis !== undefined ? (
                        <>
                          {satir.eski ? para.format(satir.eski / 100) : "—"} → <b>{para.format(satir.satis / 100)}</b>
                          {satir.ustuCizili ? <s>{para.format(satir.ustuCizili / 100)}</s> : null}
                        </>
                      ) : (
                        <>
                          {satir.eski ? para.format(satir.eski / 100) : "—"} → <b>{para.format(satir.yeni / 100)}</b>
                        </>
                      )}
                    </em>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <h4>Hiçbir ürün eşleşmedi.</h4>
          )}

          {onizleme.eslesmeyen.length ? (
            <p className="maliyet-uyari">
              <b>{onizleme.eslesmeyen.length} SKU katalogda bulunamadı:</b> {onizleme.eslesmeyen.slice(0, 12).join(", ")}
              {onizleme.eslesmeyen.length > 12 ? ` … ve ${onizleme.eslesmeyen.length - 12} tane daha` : ""}
            </p>
          ) : null}

          {onizleme.atlanan.length ? (
            <p className="maliyet-uyari">
              {/* Sessizce yutmak, kullanıcının yüklediğini sanıp eksik
                  maliyetle devam etmesi demekti. */}
              <b>{onizleme.atlanan.length} satır okunamadı:</b> {onizleme.atlanan.slice(0, 5).map((s) => `“${s.slice(0, 40)}”`).join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
