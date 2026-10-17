import assert from "node:assert/strict";
import { test } from "node:test";
import { AZAMI_SAYFA, KAYNAKLAR, VARSAYILAN_SAYFA, gorselleriMutlaklastir, sayfaSiniri } from "@/lib/vitrin-api";

const sorgu = (q: string) => new URLSearchParams(q);

test("sayfa boyu tavanla sınırlı", () => {
  /*
    PostgREST tek istekte 1000 satır döndürüyor; daha fazlasını
    istemek sessizce kesilen bir liste demek. Bu depoda aynı kusur
    arama dizininde yaşandı: müşteri satın alabildiği ürünü arayıp
    bulamadı.
  */
  assert.equal(sayfaSiniri(sorgu("limit=99999")).limit, AZAMI_SAYFA);
  assert.equal(sayfaSiniri(sorgu("limit=10")).limit, 10);
  assert.equal(sayfaSiniri(sorgu("")).limit, VARSAYILAN_SAYFA);
});

test("bozuk sayfa değerleri varsayılana düşüyor", () => {
  /* Dışarıdan gelen her şey bozuk olabilir; NaN bir sorguya girerse
     fonksiyon hiç satır döndürmez ve sebebi görünmez. */
  for (const q of ["limit=abc", "limit=-5", "limit=0", "limit="]) {
    assert.equal(sayfaSiniri(sorgu(q)).limit, VARSAYILAN_SAYFA, q);
  }
  for (const q of ["offset=abc", "offset=-9", "offset="]) {
    assert.equal(sayfaSiniri(sorgu(q)).offset, 0, q);
  }
});

test("her kaynak konağı ilk parametre olarak taşıyor", () => {
  /*
    Konak kaybolursa fonksiyon mağazayı çözemez ve BOŞ döner — hata
    vermeden. Vitrin "ürün yok" gösterir ve sebebi hiçbir yerde
    yazmaz.
  */
  for (const [ad, tanim] of Object.entries(KAYNAKLAR)) {
    const p = tanim.parametreler(sorgu("slug=deneme"), "magaza.example");
    assert.equal(p.p_host, "magaza.example", `${ad} konağı taşımıyor`);
  }
});

test("ürün ve varyant slug istiyor, boşsa boş metin gidiyor", () => {
  /* null yerine boş metin: fonksiyon imzası text bekliyor ve
     null gönderip "parametre tipi" hatası almak, sebebi
     anlaşılmayan bir 502 demekti. */
  assert.equal(KAYNAKLAR.urun.parametreler(sorgu(""), "m.example").p_slug, "");
  assert.equal(KAYNAKLAR.urun.parametreler(sorgu("slug=krem"), "m.example").p_slug, "krem");
});

test("koleksiyon slug'ı diziye sarılıyor", () => {
  const p = KAYNAKLAR.koleksiyon.parametreler(sorgu("slug=giyim"), "m.example");
  assert.deepEqual(p.p_collection_slugs, ["giyim"]);
  /* Slug yoksa null: boş dizi "hiçbir rafa ait olmayan ürünler"
     demek olurdu, oysa istenen "bütün raflar". */
  assert.equal(KAYNAKLAR.koleksiyon.parametreler(sorgu(""), "m.example").p_collection_slugs, null);
});

test("süzgeçler aynen geçiyor", () => {
  const p = KAYNAKLAR.urunler.parametreler(
    sorgu("marka=LR&beden=M&azami_fiyat=50000&sadece_indirimli=1&sadece_stokta=1&sirala=ucuz"),
    "m.example",
  );
  assert.equal(p.p_brand, "LR");
  assert.equal(p.p_size, "M");
  assert.equal(p.p_max_price, 50000);
  assert.equal(p.p_only_discounted, true);
  assert.equal(p.p_only_available, true);
  assert.equal(p.p_sort, "ucuz");
});

test("her kaynağın açıklaması var", () => {
  /* Açıklama belgeye giriyor; boş bırakılan bir kaynak, müşterinin
     geliştiricisine "deneyerek bul" demek olurdu. */
  for (const [ad, tanim] of Object.entries(KAYNAKLAR)) {
    assert.ok(tanim.aciklama.length > 20, `${ad} açıklaması yetersiz`);
    assert.ok(tanim.fonksiyon.startsWith("arc_storefront_"), `${ad} vitrin ailesinde değil`);
  }
});

test("görsel yolları mutlak adrese çevriliyor", () => {
  /*
    API'nin müşterisi bizim depolama düzenimizi bilmek zorunda
    değil. Göreli yol dönersek her geliştirici aynı soruyu sorar ve
    yanlış birleştiren herkes kırık görsel yayınlar.
  */
  const taban = "https://ornek.supabase.co";
  const cikti = gorselleriMutlaklastir(
    [{ slug: "krem", image_paths: ["kurum/urun/a.png", "kurum/urun/b.png"] }],
    taban,
  ) as Array<Record<string, unknown>>;

  assert.deepEqual(cikti[0].gorseller, [
    `${taban}/storage/v1/object/public/arc-product-images/kurum/urun/a.png`,
    `${taban}/storage/v1/object/public/arc-product-images/kurum/urun/b.png`,
  ]);
  /* Göreli alan SİLİNMİYOR: biçimi değiştirmek bugün çalışan bir
     entegrasyonu kırmak olurdu. */
  assert.deepEqual(cikti[0].image_paths, ["kurum/urun/a.png", "kurum/urun/b.png"]);
});

test("varyantın tekil görseli de çevriliyor", () => {
  const cikti = gorselleriMutlaklastir(
    [{ sku: "A-1", image_path: "kurum/urun/c.png" }],
    "https://ornek.supabase.co/",
  ) as Array<Record<string, unknown>>;
  /* Tabandaki sondaki eğik çizgi çift kalmamalı. */
  assert.equal(cikti[0].gorsel, "https://ornek.supabase.co/storage/v1/object/public/arc-product-images/kurum/urun/c.png");
});

test("zaten mutlak olan adres ikinci kez sarılmıyor", () => {
  const cikti = gorselleriMutlaklastir(
    [{ image_paths: ["https://cdn.example/a.png"] }],
    "https://ornek.supabase.co",
  ) as Array<Record<string, unknown>>;
  assert.deepEqual(cikti[0].gorseller, ["https://cdn.example/a.png"]);
});

test("görselsiz satır bozulmuyor", () => {
  const cikti = gorselleriMutlaklastir([{ slug: "x" }, null, "metin"], "https://o.co") as unknown[];
  assert.deepEqual(cikti[0], { slug: "x" });
  assert.equal(cikti[1], null);
  assert.equal(cikti[2], "metin");
});
