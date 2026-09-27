import assert from "node:assert/strict";
import test from "node:test";
import { bildirilmeliMi, paketEtiketi } from "@/lib/kargo-bildirimi";

/*
  Müşteriye kargo bildirimi. Sınananlar, yanlış olursa MÜŞTERİYE YANLIŞ
  BİLGİ giden noktalar: aynı paketin iki kez duyurulması, yola çıkmayacak
  bir paketin duyurulması ve olmayan bir bölünmenin ima edilmesi.
*/

const temel = { status: "created", tracking_number: "1234567890", customer_notified_at: null };

test("takip numarası olmadan bildirim gitmiyor", () => {
  // Numarasız "siparişiniz kargoda" e-postası müşteriye hiçbir şey söylemez.
  assert.equal(bildirilmeliMi({ ...temel, tracking_number: null }), false);
  assert.equal(bildirilmeliMi({ ...temel, tracking_number: "   " }), false);
});

test("AYNI PAKET iki kez duyurulmuyor", () => {
  /*
    Takip numarası sonradan değişebiliyor (etiket gecikmeli geliyor, durum
    güncellemesi numarayı yazıyor); "numara doluysa gönder" kuralı aynı
    müşteriye aynı paketi birkaç kez duyururdu.
  */
  assert.equal(bildirilmeliMi({ ...temel, customer_notified_at: "2026-09-27T10:00:00Z" }), false);
});

test("taslak ve iptal duyurulmuyor", () => {
  // Taslak OTO'da yok; iptal edilen paket yola çıkmayacak.
  assert.equal(bildirilmeliMi({ ...temel, status: "draft" }), false);
  assert.equal(bildirilmeliMi({ ...temel, status: "cancelled" }), false);
  assert.equal(bildirilmeliMi({ ...temel, status: "shipped" }), true);
  assert.equal(bildirilmeliMi(temel), true);
});

test("TEK PAKETLİ siparişte paket etiketi yazılmıyor", () => {
  /*
    "1 paketten 1." demek, olmayan bir bölünmeyi varmış gibi gösterir ve
    müşteriyi gelmeyecek ikinci bir paketi beklemeye iter.
  */
  assert.equal(paketEtiketi(1, 1), null);
  assert.equal(paketEtiketi(1, 3), "3 paketten 1.");
  assert.equal(paketEtiketi(2, 3), "3 paketten 2.");
});

test("geçersiz sıra etiket üretmiyor", () => {
  assert.equal(paketEtiketi(0, 3), null);
  assert.equal(paketEtiketi(2, 0), null);
});
