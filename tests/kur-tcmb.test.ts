/*
  TCMB KUR AYRIŞTIRICISI.

  Yanlış bir kur BÜTÜN kataloğun dolar fiyatını yanlış yapıyor ve bunu
  hiçbir ekran söylemiyor — fiyat görünür, yanlışlığı görünmez. Bu
  yüzden ayrıştırma ve sınır kuralları burada sabitlendi; örnek metin
  TCMB'nin 22.10.2026 bülteninden alınmış gerçek biçim.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { EN_COK, kurKarari, tcmbUsdKuru, UYARI_ESIGI } from "@/lib/kur/tcmb";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="22.10.2026" Date="10/22/2026"  Bulten_No="2026/200" >
	<Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
			<Unit>1</Unit>
			<Isim>ABD DOLARI</Isim>
			<ForexBuying>49.5389</ForexBuying>
			<ForexSelling>49.6281</ForexSelling>
	</Currency>
	<Currency CrossOrder="1" Kod="AUD" CurrencyCode="AUD">
			<Unit>1</Unit>
			<ForexBuying>34.6595</ForexBuying>
	</Currency>
</Tarih_Date>`;

test("USD alış kuru ve bülten tarihi okunuyor", () => {
  const sonuc = tcmbUsdKuru(XML);
  assert.equal(sonuc?.kur, 49.5389);
  assert.equal(sonuc?.tarih, "22.10.2026");
});

test("USD bloğu AÇIKÇA aranıyor, belgedeki ilk kur değil", () => {
  /*
    İlk `ForexBuying` alınsaydı TCMB sıralamayı değiştirdiği gün
    sessizce Avustralya doları kuruyla fiyatlanırdık.
  */
  const tersSira = XML.replace(/Kod="USD"/, "Kod="+'"'+"ZZZ"+'"').replace(/Kod="AUD"/, 'Kod="USD"');
  assert.equal(tcmbUsdKuru(tersSira)?.kur, 34.6595);
});

test("USD yoksa null", () => {
  assert.equal(tcmbUsdKuru(XML.replace(/Kod="USD"/, 'Kod="EUR"')), null);
  assert.equal(tcmbUsdKuru(""), null);
  /* Alan adı değişirse de null: uydurma bir kur, kur olmamasından kötü. */
  assert.equal(tcmbUsdKuru(XML.replace(/ForexBuying/g, "Alis")), null);
});

test("birim hesaba katılıyor", () => {
  /* TCMB bazı para birimlerini 100 birim üzerinden yayımlıyor; alanı
     yok saymak yüz katı bir kur yazmak olurdu. */
  const yuzBirim = XML.replace("<Unit>1</Unit>", "<Unit>100</Unit>");
  /* Tam eşitlik DEĞİL: 49.5389/100 kayan noktada 0.49538899999999996
     çıkıyor. Kuru burada yuvarlamıyoruz — sütun numeric(12,4) ve
     yuvarlama orada yapılıyor; kodda yuvarlamak iki yerde iki ayrı
     kural demekti. */
  assert.ok(Math.abs((tcmbUsdKuru(yuzBirim)?.kur ?? 0) - 0.495389) < 1e-9);
});

test("aralık dışı değer reddediliyor", () => {
  /* Böyle bir sayı kur değil, ayrıştırma hatası. */
  assert.deepEqual(kurKarari(0, 40), { uygula: false, sebep: "aralik-disi" });
  assert.deepEqual(kurKarari(EN_COK + 1, 40), { uygula: false, sebep: "aralik-disi" });
  assert.deepEqual(kurKarari(null, 40), { uygula: false, sebep: "okunamadi" });
  assert.deepEqual(kurKarari(Number.NaN, 40), { uygula: false, sebep: "okunamadi" });
});

test("ilk kurda karşılaştırma yok", () => {
  assert.deepEqual(kurKarari(49.5, null), {
    uygula: true,
    kur: 49.5,
    degisimYuzde: null,
    uyar: false,
  });
  /* Sıfır da "kur yok" sayılıyor: eski satırlarda alan boş. */
  assert.equal(kurKarari(49.5, 0).uygula, true);
});

test("olağan günlük oynama sessizce uygulanıyor", () => {
  const karar = kurKarari(49.9, 49.5);
  assert.deepEqual(karar, { uygula: true, kur: 49.9, degisimYuzde: 0.8, uyar: false });
});

test("büyük değişim UYGULANIYOR, yalnızca haber veriliyor", () => {
  /*
    İlk tasarımda eşiği aşan kur reddediliyordu; yanlıştı — Türk
    lirasında yüzde onluk bir gün gerçekten oluyor ve o gün fiyatı
    dondurmak, kataloğu olduğundan ucuza satmak demek.
  */
  const karar = kurKarari(55, 49.5);
  assert.equal(karar.uygula, true);
  assert.equal(karar.uygula && karar.uyar, true);
  assert.ok(Math.abs((karar.uygula && karar.degisimYuzde) || 0) >= UYARI_ESIGI);

  /* Düşüş de uyarıyor: yön değil büyüklük önemli. */
  const dusus = kurKarari(40, 49.5);
  assert.equal(dusus.uygula, true);
  assert.equal(dusus.uygula && dusus.uyar, true);
});
