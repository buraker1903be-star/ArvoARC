import assert from "node:assert/strict";
import test from "node:test";
import { BITIYOR_GUN, indirimIstatistikleri, urunIndirimOzeti, type IstatistikIndirimi } from "@/lib/indirim-istatistik";

const AN = Date.parse("2026-10-16T12:00:00+03:00");
const gunSonra = (gun: number) => new Date(AN + gun * 86_400_000).toISOString();

const kural = (ek: Partial<IstatistikIndirimi>): IstatistikIndirimi => ({
  status: "active",
  code: null,
  name: "Kampanya",
  discount_type: "percentage",
  value: 10,
  usage_count: 0,
  usage_limit: null,
  ends_at: null,
  ...ek,
});

test("aktif kurallar kuponlu ve otomatik diye ayrılıyor", () => {
  const s = indirimIstatistikleri([
    kural({ code: "ARVO10" }),
    kural({ code: null }),
    /* Taslak ve duraklatılmış sayılmıyor: bugün çalışan kural değiller. */
    kural({ status: "draft", code: "TASLAK" }),
    kural({ status: "paused" }),
  ], AN);
  assert.equal(s.aktif, 2);
  assert.equal(s.kuponlu, 1);
  assert.equal(s.otomatik, 1);
});

test("bitmek üzere olan ile süresi GEÇMİŞ ayrı sayılıyor", () => {
  /*
    Süresi geçtiği hâlde "aktif" duran kural panelde doğru görünmüyordu:
    durumu expired'a çeken bir iş yok, vitrin ise tarihe bakıp
    uygulamıyor. İki sayı ayrı.
  */
  const s = indirimIstatistikleri([
    kural({ ends_at: gunSonra(3) }),
    kural({ ends_at: gunSonra(BITIYOR_GUN) }),
    kural({ ends_at: gunSonra(30) }),
    kural({ ends_at: gunSonra(-1) }),
  ], AN);
  assert.equal(s.bitiyor, 2, "üç gün ve tam yedi gün kalan");
  assert.equal(s.suresiGecmis, 1);
});

test("limiti dolmak üzere olan kural işaretleniyor", () => {
  const s = indirimIstatistikleri([
    kural({ usage_limit: 100, usage_count: 80 }),
    kural({ usage_limit: 100, usage_count: 79 }),
    /* Limitsiz kural hiç dolmaz. */
    kural({ usage_limit: null, usage_count: 9999 }),
  ], AN);
  assert.equal(s.limitiDoluyor, 1);
});

test("kullanım toplamı bütün kurallardan, sıralama çoktan aza", () => {
  const s = indirimIstatistikleri([
    kural({ code: "A", usage_count: 3 }),
    kural({ code: "B", usage_count: 12, status: "paused" }),
    kural({ code: "C", usage_count: 0 }),
  ], AN);
  assert.equal(s.toplamKullanim, 15, "duraklatılmışın geçmiş kullanımı da sayılır");
  assert.deepEqual(s.enCokKullanilan, [{ ad: "B", adet: 12 }, { ad: "A", adet: 3 }], "hiç kullanılmayan listede yok");
});

test("bozuk bitiş tarihi sayıları bozmuyor", () => {
  const s = indirimIstatistikleri([kural({ ends_at: "bozuk" })], AN);
  assert.equal(s.aktif, 1);
  assert.equal(s.bitiyor, 0);
  assert.equal(s.suresiGecmis, 0);
});

test("tür dağılımı okunur adlarla", () => {
  const s = indirimIstatistikleri([
    kural({ discount_type: "percentage" }),
    kural({ discount_type: "free_shipping", value: 0 }),
    kural({ discount_type: "percentage" }),
  ], AN);
  assert.deepEqual(s.turler, [{ tur: "Yüzde indirim", adet: 2 }, { tur: "Ücretsiz kargo", adet: 1 }]);
});


/*
  Ürün indirimi sekmesinin özeti. Sekme kuralları değil varyantın
  karşılaştırma fiyatını listeliyor; kampanya sayıları orada yanlış
  özet olurdu.
*/
test("ürün indirimi özeti: varyant, ürün, ortalama ve en yüksek oran", () => {
  const o = urunIndirimOzeti([
    { product_id: "u1", price: 7500, compare_at_price: 10000 },
    { product_id: "u1", price: 9000, compare_at_price: 10000 },
    { product_id: "u2", price: 5000, compare_at_price: 10000 },
  ]);
  assert.equal(o.varyant, 3);
  assert.equal(o.urun, 2, "aynı ürünün iki varyantı tek ürün");
  assert.equal(o.ortalamaOran, 28, "(25+10+50)/3");
  assert.equal(o.enYuksekOran, 50);
  assert.equal(o.toplamFarkKurus, 2500 + 1000 + 5000);
});

test("indirimsiz ve eksik karşılaştırma fiyatı sayılmıyor", () => {
  const o = urunIndirimOzeti([
    { product_id: "u1", price: 10000, compare_at_price: 10000 },
    { product_id: "u2", price: 10000, compare_at_price: null },
    { product_id: "u3", price: 12000, compare_at_price: 10000 },
  ]);
  assert.equal(o.varyant, 0);
  assert.equal(o.ortalamaOran, null, "indirimli varyant yokken ortalama yok");
  assert.equal(o.enYuksekOran, null);
  assert.equal(o.toplamFarkKurus, 0);
});
