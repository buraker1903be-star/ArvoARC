"use client";

import { useState, useTransition } from "react";
import {
  maliyetOnizle,
  maliyetUygula,
  sonToplananListe,
  toplayiciKodu,
  type FiyatGecisi,
  type MaliyetOnizleme,
  type ToplananListe,
} from "./actions";

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
const zaman = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
const gun = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" });

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
  /*
    Sonuç satırı iyi haberi de kötü haberi de taşıyor; ikisi aynı yeşil
    çerçevede görünürse hata "oldu" gibi okunuyor.
  */
  const [sonuc, setSonuc] = useState<{ metin: string; hata?: boolean } | null>(null);
  /*
    TOPLAMA: tarayıcı toplayıcısının bıraktığı liste. Kimliği tutuluyor
    ki uygulandığında işaretlensin; aynı liste ikinci kez getirildiğinde
    "uygulandı" yazsın.
  */
  const [toplama, setToplama] = useState<ToplananListe | null>(null);
  const [yerImi, setYerImi] = useState<{ kod: string; bitis: string } | null>(null);
  const [calisiyor, basla] = useTransition();

  /* Geçiş ya da indirim değişince önizleme geçersiz: hesabı onlar belirliyor. */
  const sifirla = () => { setOnizleme(null); setToplama(null); };

  const indirimKurus = () => Math.round(Number(indirim.replace(",", ".")) * 100) || 0;

  const esleştir = () =>
    basla(async () => {
      setSonuc(null);
      setToplama(null);
      setOnizleme(await maliyetOnizle(metin, gecis, indirimKurus()));
    });

  const toplananiGetir = () =>
    basla(async () => {
      setSonuc(null);
      const cevap = await sonToplananListe(gecis, indirimKurus());
      if ("hata" in cevap) { setToplama(null); setOnizleme(null); setSonuc({ metin: cevap.hata, hata: true }); return; }
      setMetin("");
      setToplama(cevap);
      setOnizleme(cevap.onizleme);
    });

  const yerImiAl = () =>
    basla(async () => {
      const cevap = await toplayiciKodu();
      if ("hata" in cevap) { setSonuc({ metin: cevap.hata, hata: true }); return; }
      setYerImi(cevap);
    });

  const uygula = () =>
    basla(async () => {
      if (!onizleme?.eslesen.length) return;
      const cevap = await maliyetUygula(
        onizleme.eslesen.map((s) => ({ sku: s.sku, kurus: s.yeni, satis: s.satis, ustuCizili: s.ustuCizili })),
        gecis,
        toplama?.toplamaId ?? null,
      );
      setSonuc(
        cevap.hata
          ? { metin: cevap.hata, hata: true }
          : { metin: `${cevap.yazilan} üründe ${gecis === "alis" ? "alış fiyatı" : "satış fiyatı"} güncellendi.` },
      );
      setOnizleme(null);
      setToplama(null);
      setMetin("");
    });

  return (
    <section className="ac ac-pad import-card">
      <div className="ac-head">
        <div>
          <h3>LR fiyat aktarımı</h3>
          <p>
            İki yol var: LR sayfasında <b>tarayıcı toplayıcıyı</b> çalıştırın ya da fiyat tablosunu
            kopyalayıp yapıştırın. <b>Girişliyken</b> gördüğünüz alış fiyatını, <b>çıkışken</b> gördüğünüz
            müşteri fiyatını ayrı ayrı aktarın.
          </p>
        </div>
      </div>

      <div className="fiyat-gecis">
        <label className="check-inline">
          <input type="radio" name="gecis" checked={gecis === "alis"} onChange={() => { setGecis("alis"); sifirla(); }} />
          <span><b>Alış fiyatı</b><small>LR&apos;a giriş yapmışken görünen; kâr bundan hesaplanıyor</small></span>
        </label>
        <label className="check-inline">
          <input type="radio" name="gecis" checked={gecis === "musteri"} onChange={() => { setGecis("musteri"); sifirla(); }} />
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
            onChange={(olay) => { setIndirim(olay.target.value); sifirla(); }}
          />
          <small>Satış fiyatı = LR fiyatı − bu tutar. LR fiyatı üstü çizili görünür, yani vitrinde kampanya olur.</small>
        </label>
      ) : null}

      {/*
        TARAYICI TOPLAYICISI. LR'ın portalı fiyat listesi indirmiyor ve
        girişi CAS SSO ile tek kullanımlık jetonla yapılıyor; sunucudan
        taramak kullanıcının LR şifresini saklamayı gerektirirdi. Bunun
        yerine yer imi, KULLANICININ KENDİ OTURUMUNDA açık sayfayı
        okuyup satırları panele bırakıyor. Yazma kararı yine burada:
        sayfa tasarımı değişince yanlış sütun okunabilir.
      */}
      <div className="toplayici">
        <b>Tarayıcı toplayıcı</b>
        <p>
          Yapıştırmak yerine: LR sayfasını açın, yer imine basın, betik SKU ve fiyatları okuyup buraya
          bırakır. Şifreniz hiçbir yere yazılmaz — betik yalnızca sizin açtığınız sayfayı okur.
        </p>
        <div className="maliyet-actions">
          <button className="ac-btn" type="button" onClick={toplananiGetir} disabled={calisiyor}>
            Son toplanan listeyi getir
          </button>
          <button className="ac-btn" type="button" onClick={yerImiAl} disabled={calisiyor}>
            {yerImi ? "Kodu yenile" : "Yer imi kodunu göster"}
          </button>
        </div>

        {yerImi ? (
          <>
            <ol>
              <li>Aşağıdaki kodu kopyalayın.</li>
              <li>Tarayıcıda yeni bir yer imi oluşturun; adres alanına bu kodu yapıştırın, adına “LR fiyat” yazın.</li>
              <li>LR&apos;ın ürün listesi sayfasında (alış için <b>girişli</b>, tavan için <b>çıkışken</b>) yer imine basın.</li>
              <li>Açılan kutuda listeyi görün, <b>Panele gönder</b>&apos;e basın, sonra buradan “Son toplanan listeyi getir”.</li>
            </ol>
            <div className="toplayici-kod">
              <input
                className="ac-input"
                readOnly
                value={yerImi.kod}
                onFocus={(olay) => olay.currentTarget.select()}
                aria-label="Yer imi kodu"
              />
              <button
                className="ac-btn"
                type="button"
                onClick={() => { void navigator.clipboard?.writeText(yerImi.kod); setSonuc({ metin: "Yer imi kodu kopyalandı." }); }}
              >
                Kopyala
              </button>
            </div>
            {/* Süre bilerek: sızan bir kod sonsuza kadar geçerli olmasın. */}
            <p>Kod {gun.format(new Date(yerImi.bitis))} tarihine kadar geçerli; sonra buradan yenilenir.</p>
          </>
        ) : null}

        {toplama ? (
          <div className="toplayici-liste">
            <b>{zaman.format(new Date(toplama.toplandi))}</b> tarihli liste getirildi · {toplama.okunan} satır okundu
            {toplama.uygulandi ? <> · <b>bu liste {zaman.format(new Date(toplama.uygulandi))} tarihinde uygulanmış</b></> : null}
            {toplama.sayfa ? <><br /><small>{toplama.sayfa.slice(0, 120)}</small></> : null}
          </div>
        ) : null}
      </div>

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

      {sonuc ? <p className="maliyet-sonuc" data-tone={sonuc.hata ? "hata" : undefined}>{sonuc.metin}</p> : null}

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
