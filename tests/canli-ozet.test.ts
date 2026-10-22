/*
  CANLI EKRANIN SAYILARI.

  Yanlış sayan bir ekran, sayı göstermeyen ekrandan kötüdür: operatör
  rakama bakıp karar veriyor ve sapmanın hiçbir belirtisi yok. Ölçülen
  şey zamana bağlı eşikler (5 dk / 30 dk / 1 saat) ve konuma göre
  toplama — ikisi de gözle görülmeyen sınıftan.

  `simdi` sabit: gerçek saate bağlı bir test gece yarısı kendiliğinden
  kırılır.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { AKIS_SINIRI, canliOzet, enCok, type ZiyaretSatiri } from "@/lib/canli-ozet";

const SIMDI = Date.parse("2026-10-22T12:00:00.000Z");
const dakikaOnce = (d: number) => new Date(SIMDI - d * 60_000).toISOString();

function satir(ek: Partial<ZiyaretSatiri> = {}): ZiyaretSatiri {
  return {
    path: "/",
    product_slug: null,
    country: "TR",
    city: "İstanbul",
    lat: 41.0,
    lon: 29.0,
    ip_hash: "a",
    source: null,
    created_at: dakikaOnce(1),
    ...ek,
  };
}

test("şu an sitede: son beş dakikadaki AYRI ziyaretçi", () => {
  const ozet = canliOzet(
    [
      satir({ ip_hash: "a", created_at: dakikaOnce(1) }),
      /* Aynı kişi ikinci sayfayı açtı: iki ziyaret, bir kişi. */
      satir({ ip_hash: "a", created_at: dakikaOnce(2) }),
      satir({ ip_hash: "b", created_at: dakikaOnce(4) }),
      /* Altı dakika önce: artık "şu an" değil. */
      satir({ ip_hash: "c", created_at: dakikaOnce(6) }),
    ],
    SIMDI,
  );
  assert.equal(ozet.suAn, 2);
  /* Sayfa görüntüleme kişi değil satır sayıyor. */
  assert.equal(ozet.sonSaatGoruntuleme, 4);
  assert.equal(ozet.sonSaatZiyaretci, 3);
});

test("bir saati geçen satır canlı sayılara girmiyor", () => {
  const ozet = canliOzet(
    [satir({ created_at: dakikaOnce(59) }), satir({ ip_hash: "b", created_at: dakikaOnce(61) })],
    SIMDI,
  );
  assert.equal(ozet.sonSaatGoruntuleme, 1);
  assert.equal(ozet.sonSaatZiyaretci, 1);
  /* Günlük sayı bütün satırları kapsıyor: sorgu zaten 24 saatlik. */
  assert.equal(ozet.gunluk, 2);
  /* Harita da son bir saat. */
  assert.equal(ozet.noktalar.length, 1);
});

test("noktalar konuma göre toplanıyor, yaş EN YENİSİ", () => {
  /*
    Önceden her ziyaret ayrı bir benekti: İstanbul'dan gelen kırk
    ziyaret tek koyu lekeye biniyor ve "kaç kişi" sorusu yanıtsız
    kalıyordu.
  */
  const ozet = canliOzet(
    [
      satir({ lat: 41, lon: 29, created_at: dakikaOnce(1) }),
      satir({ lat: 41, lon: 29, created_at: dakikaOnce(30) }),
      satir({ lat: 39, lon: 32, city: "Ankara", created_at: dakikaOnce(10) }),
    ],
    SIMDI,
  );
  const istanbul = ozet.noktalar.find((n) => n.lat === 41);
  assert.equal(ozet.noktalar.length, 2);
  assert.equal(istanbul?.adet, 2);
  /* Parlaklık en yeni ziyarete göre: eskisini alsaydı canlı nokta
     soluk görünürdü. */
  assert.equal(istanbul?.dakika, 1);
});

test("konumu olmayan satır haritaya girmiyor ama sayılara giriyor", () => {
  /* Yerel geliştirmede ve kenar başlığı gelmeyen istekte konum boş. */
  const ozet = canliOzet([satir({ lat: null, lon: null })], SIMDI);
  assert.equal(ozet.noktalar.length, 0);
  assert.equal(ozet.sonSaatGoruntuleme, 1);
});

test("nokta adı bir satırda boşsa dolu olan korunuyor", () => {
  const ozet = canliOzet(
    [
      satir({ city: null, country: null, created_at: dakikaOnce(1) }),
      satir({ city: "İzmir", country: "TR", created_at: dakikaOnce(2) }),
    ],
    SIMDI,
  );
  assert.equal(ozet.noktalar[0].city, "İzmir");
  assert.equal(ozet.noktalar[0].country, "TR");
});

test("akış son yarım saat ve ürün satırı işaretli", () => {
  const ozet = canliOzet(
    [
      satir({ path: "/urun/krem", product_slug: "krem", created_at: dakikaOnce(5) }),
      satir({ path: "/koleksiyon/tumu", created_at: dakikaOnce(29) }),
      /* Otuz birinci dakika akışta yok. */
      satir({ path: "/eski", created_at: dakikaOnce(31) }),
    ],
    SIMDI,
  );
  assert.deepEqual(
    ozet.akis.map((o) => [o.yol, o.tur]),
    [
      ["/urun/krem", "urun"],
      ["/koleksiyon/tumu", "sayfa"],
    ],
  );
  /* Ürün sayfası açılışı ayrı sayılıyor: mağazanın dönüşüme en yakın
     canlı sinyali. */
  assert.equal(ozet.sonSaatUrun, 1);
});

test("akış sınırlı: tazelemede ekran kilitlenmesin", () => {
  const satirlar = Array.from({ length: AKIS_SINIRI + 10 }, (_, i) =>
    satir({ path: `/s${i}`, created_at: dakikaOnce(1) }),
  );
  const ozet = canliOzet(satirlar, SIMDI);
  assert.equal(ozet.akis.length, AKIS_SINIRI);
  /* Sınır sayıları KISITLAMIYOR: yalnızca listeyi kısaltıyor. */
  assert.equal(ozet.sonSaatGoruntuleme, AKIS_SINIRI + 10);
});

test("açık sayfalar son beş dakikadan", () => {
  const ozet = canliOzet(
    [
      satir({ path: "/urun/a", created_at: dakikaOnce(1) }),
      satir({ path: "/urun/a", created_at: dakikaOnce(2) }),
      satir({ path: "/urun/b", created_at: dakikaOnce(3) }),
      satir({ path: "/urun/c", created_at: dakikaOnce(20) }),
    ],
    SIMDI,
  );
  assert.deepEqual(ozet.acikSayfalar, [
    { ad: "/urun/a", adet: 2 },
    { ad: "/urun/b", adet: 1 },
  ]);
});

test("kaynak OKUNABİLİR ADA çevrildikten sonra sayılıyor", () => {
  /*
    Ham kaynak sayılsaydı aynı platform üç ayrı satıra bölünürdü ve
    "l.instagram.com" kimseye bir şey söylemiyor.

    GİRDİ KONAK, tam adres değil: vitrin `new URL(referrer).hostname`
    gönderiyor (ArvoCulture-site/components/ziyaret-kaydi) ve
    `utm_source` ile gelen kampanya değeri de kısa ("instagram").
    Bu testi ilk yazarken girdiye tam URL verdim ve kusur sandım;
    kusur testteydi — o yüzden burada üç gerçek biçim duruyor.
  */
  const ozet = canliOzet(
    [
      satir({ source: "l.instagram.com" }),
      satir({ source: "www.instagram.com" }),
      satir({ source: "instagram" }),
      satir({ source: "www.google.com.tr" }),
      satir({ source: null }),
    ],
    SIMDI,
  );
  assert.deepEqual(ozet.kaynaklar, [
    { ad: "Instagram", adet: 3 },
    { ad: "Doğrudan", adet: 1 },
    { ad: "Google", adet: 1 },
  ]);
});

test("enCok: eşitlikte ada göre kararlı sıra", () => {
  /* Kararsız sıra, her tazelemede satırların yer değiştirmesi
     demekti — on saniyede bir okunan bir ekranda okunamaz. */
  assert.deepEqual(enCok(["b", "a", "c", "a", "b"], 3), [
    { ad: "a", adet: 2 },
    { ad: "b", adet: 2 },
    { ad: "c", adet: 1 },
  ]);
  /* Boş değer sayılmıyor. */
  assert.deepEqual(enCok([null, null, "a"], 3), [{ ad: "a", adet: 1 }]);
});
