import assert from "node:assert/strict";
import test from "node:test";
import { siparisKari, type KarKalemi } from "@/lib/siparis-kari";

/*
  Sipariş kârı. Yanlış olursa operasyoncu YANLIŞ FİYAT KARARI verir:
  zararına satılan bir ürün kârlı görünür ya da tersi.
*/

const kalem = (toplam: number, adet: number, maliyet: number | null): KarKalemi => ({ toplamKurus: toplam, adet, maliyetKurus: maliyet });

test("kâr ve oran hesaplanıyor", () => {
  // 2 adet, 50 ₺ satış, 30 ₺ alış → 100 ₺ gelir, 60 ₺ maliyet, 40 ₺ kâr.
  const sonuc = siparisKari([kalem(10000, 2, 3000)], "fulfilled", "paid");
  assert.equal(sonuc!.kurus, 4000);
  assert.equal(sonuc!.oran, 40);
});

test("birden çok kalem toplanıyor", () => {
  const sonuc = siparisKari([kalem(10000, 2, 3000), kalem(5000, 1, 2000)], "fulfilled", "paid");
  assert.equal(sonuc!.kurus, 4000 + 3000);
});

test("EKSİK MALİYETTE sonuç yok", () => {
  /*
    Yarım bir sayı, sayı olmamasından daha yanıltıcı: kâr olduğundan
    yüksek çıkar ve operasyoncu ona bakıp fiyat kararı verir.
  */
  assert.equal(siparisKari([kalem(10000, 2, 3000), kalem(5000, 1, null)], "fulfilled", "paid"), null);
});

test("KAPANMIŞ siparişte kâr yok", () => {
  // İptal hiç gerçekleşmedi, iadede para geri gitti.
  assert.equal(siparisKari([kalem(10000, 1, 3000)], "cancelled", "paid"), null);
  assert.equal(siparisKari([kalem(10000, 1, 3000)], "refunded", "paid"), null);
  assert.equal(siparisKari([kalem(10000, 1, 3000)], "fulfilled", "refunded"), null);
});

test("KISMİ İADEDE kâr hesaplanmıyor", () => {
  /*
    Gelirin bir kısmı geri gitti ama hangi kalemden gittiği kayıtlı
    değil; tahmin yürütmek yanlış sayı üretirdi.
  */
  assert.equal(siparisKari([kalem(10000, 1, 3000)], "fulfilled", "partially_refunded"), null);
});

test("ZARAR eksi değerle görünüyor", () => {
  // Zararına satış gizlenmiyor; asıl görülmesi gereken şey o.
  const sonuc = siparisKari([kalem(2000, 1, 3000)], "fulfilled", "paid");
  assert.equal(sonuc!.kurus, -1000);
  assert.equal(sonuc!.oran, -50);
});

test("kalemsiz sipariş sonuç vermiyor", () => {
  assert.equal(siparisKari([], "fulfilled", "paid"), null);
});

test("maliyeti sıfır olan ürün geçerli", () => {
  // Hediye ya da promosyon ürünü: sıfır maliyet bilinmiyor demek değil.
  const sonuc = siparisKari([kalem(5000, 1, 0)], "fulfilled", "paid");
  assert.equal(sonuc!.kurus, 5000);
  assert.equal(sonuc!.oran, 100);
});
