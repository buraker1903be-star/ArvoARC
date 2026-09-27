import assert from "node:assert/strict";
import test from "node:test";
import { fiyatKarari, skuAdaylari } from "@/lib/fiyat-aktarimi";

/*
  LR fiyat kuralı. Yanlış olursa CANLI MAĞAZADA yanlış fiyat oluşur:
  ya zararına satılır ya da LR'ın kendi fiyatının üstünde kalınıp satış
  kaybedilir.
*/

test("satış fiyatı tavandan sabit tutar düşülerek buluyor", () => {
  const sonuc = fiyatKarari(95090, 3000, 60000);
  assert.deepEqual(sonuc, { karar: { satis: 92090, ustuCizili: 95090 } });
});

test("kuruş sonu korunuyor", () => {
  // ₺950,90 − ₺30 = ₺920,90; ayrıca yuvarlama gerekmiyor.
  const sonuc = fiyatKarari(95090, 3000, null);
  assert.equal("karar" in sonuc && sonuc.karar.satis % 100, 90);
});

test("İNDİRİM YOKSA üstü çizili fiyat da yok", () => {
  /*
    LR fiyatıyla aynı tutarı üstü çizili göstermek müşteriye sahte
    kampanya sunmak olurdu.
  */
  assert.deepEqual(fiyatKarari(95090, 0, null), { karar: { satis: 95090, ustuCizili: null } });
});

test("MALİYETİN ALTINA İNMİYOR", () => {
  /*
    LR kendi kampanyasında müşteri fiyatını çok düşürebiliyor; üstüne
    bizim indirimimizi de uygulamak zararına satış demek olurdu.
  */
  assert.deepEqual(fiyatKarari(50000, 3000, 48000), { sorun: "maliyetin-altinda" });
  // Maliyete eşit olması sorun değil; kâr sıfır ama zarar yok.
  assert.equal("karar" in fiyatKarari(51000, 3000, 48000), true);
});

test("maliyet bilinmiyorsa taban denetimi yapılmıyor", () => {
  // Maliyeti olmayan üründe indirim yine uygulanıyor; tek bildiğimiz tavan.
  assert.equal("karar" in fiyatKarari(50000, 3000, null), true);
});

test("indirim fiyatı sıfıra indiriyorsa uygulanmıyor", () => {
  assert.deepEqual(fiyatKarari(2000, 3000, null), { sorun: "indirim-fiyati-asiyor" });
});

test("tavan yoksa karar verilmiyor", () => {
  assert.deepEqual(fiyatKarari(0, 3000, null), { sorun: "tavan-yok" });
});

test("SKU: LR kimliğinden taban numara çıkarılıyor", () => {
  /*
    LR'ın kimliği "20604-201" (taban + varyant eki), ArvoARC'taki SKU
    "20604". Birebir eşleşme önce deneniyor ki gerçekten "20604-201"
    diye kayıtlı bir ürün varsa kaçırılmasın.
  */
  assert.deepEqual(skuAdaylari("20604-201"), ["20604-201", "20604"]);
  assert.deepEqual(skuAdaylari("23113"), ["23113"]);
  assert.deepEqual(skuAdaylari("  80935-117 "), ["80935-117", "80935"]);
  assert.deepEqual(skuAdaylari(""), []);
});
