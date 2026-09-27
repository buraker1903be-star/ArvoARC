import assert from "node:assert/strict";
import test from "node:test";
import { bolmeSorunu, kalanAdetler, kargoDurumu, otoDurumunuCevir, tedarikciGruplari, izlenmeliMi, izlemeSuresiDoldu, kargoyaVerildiMi, gonderiDurumEtiketi, gonderiSorunlu, kargoGorunumu, type SiparisKalemi, type Gonderi } from "@/lib/kargo-bolme";

/*
  Bölünmüş kargo hesabı. Sınanan şey "toplama biliyor mu" değil: bir
  siparişin kalemleri farklı firmalara ayrılırken aynı adedin İKİ KEZ
  kargoya verilmemesi. İki kez verilirse müşteriye olmayan ürün için takip
  numarası gider, stok ve iade hesabı bozulur.
*/

const kalemler = [
  { id: "k1", quantity: 3, product_name: "Kupa" },
  { id: "k2", quantity: 1, product_name: "Tabak" },
];

const gonderi = (id: string, status: string, items: { order_item_id: string; quantity: number }[]) =>
  ({ id, status, items });

test("kalan adet · kargoya verilen düşülüyor", () => {
  const kalan = kalanAdetler(kalemler, [gonderi("g1", "created", [{ order_item_id: "k1", quantity: 2 }])]);
  assert.equal(kalan.get("k1"), 1);
  assert.equal(kalan.get("k2"), 1, "dokunulmayan kalem tam kalmalı");
});

test("İPTAL edilen gönderinin kalemleri yeniden bölünebiliyor", () => {
  /*
    Yanlış firmaya verilip iptal edilen gönderi siparişi sonsuza kadar
    kilitlerdi; iptal sayıma girmiyor.
  */
  const kalan = kalanAdetler(kalemler, [
    gonderi("g1", "cancelled", [{ order_item_id: "k1", quantity: 3 }]),
    gonderi("g2", "delivered", [{ order_item_id: "k1", quantity: 1 }]),
  ]);
  assert.equal(kalan.get("k1"), 2);
});

test("siparişte olmayan kalem hesabı durdurmuyor", () => {
  // Veri bozulmuşsa görünen kalemler üzerinden devam edilir.
  const kalan = kalanAdetler(kalemler, [gonderi("g1", "created", [{ order_item_id: "silinmis", quantity: 5 }])]);
  assert.deepEqual([...kalan.entries()], [["k1", 3], ["k2", 1]]);
});

test("boş seçim reddediliyor", () => {
  assert.equal(bolmeSorunu({}, kalemler, []), "Gönderiye en az bir ürün ekleyin.");
  assert.equal(bolmeSorunu({ k1: 0 }, kalemler, []), "Gönderiye en az bir ürün ekleyin.");
});

test("KALANI AŞAN seçim, kaç adet kaldığını söyleyerek reddediliyor", () => {
  const mevcut = [gonderi("g1", "created", [{ order_item_id: "k1", quantity: 2 }])];
  assert.equal(
    bolmeSorunu({ k1: 2 }, kalemler, mevcut),
    "Kupa: kargoya verilebilecek 1 adet kaldı, 2 seçildi.",
  );
});

test("tamamı kargoya verilmiş kalem ayrı mesaj veriyor", () => {
  // "0 adet kaldı, 1 seçildi" demek kullanıcıya bir şey anlatmıyor.
  const mevcut = [gonderi("g1", "created", [{ order_item_id: "k2", quantity: 1 }])];
  assert.equal(bolmeSorunu({ k2: 1 }, kalemler, mevcut), "Tabak: bu ürünün tamamı kargoya verilmiş.");
});

test("geçerli seçim sorunsuz", () => {
  const mevcut = [gonderi("g1", "created", [{ order_item_id: "k1", quantity: 1 }])];
  assert.equal(bolmeSorunu({ k1: 2, k2: 1 }, kalemler, mevcut), null);
});

test("kesirli adet reddediliyor", () => {
  assert.equal(bolmeSorunu({ k1: 1.5 }, kalemler, []), "Kupa: adet tam sayı olmalı.");
});

test("kargo durumu gönderilerden türüyor", () => {
  assert.equal(kargoDurumu(kalemler, []), "yok");
  assert.equal(kargoDurumu(kalemler, [gonderi("g1", "created", [{ order_item_id: "k1", quantity: 3 }])]), "kismi");
  assert.equal(
    kargoDurumu(kalemler, [
      gonderi("g1", "created", [{ order_item_id: "k1", quantity: 3 }]),
      gonderi("g2", "delivered", [{ order_item_id: "k2", quantity: 1 }]),
    ]),
    "tamam",
  );
});

test("hepsi iptal edilmiş sipariş yeniden 'yok' oluyor", () => {
  const iptalli = [gonderi("g1", "cancelled", [{ order_item_id: "k1", quantity: 3 }, { order_item_id: "k2", quantity: 1 }])];
  assert.equal(kargoDurumu(kalemler, iptalli), "yok");
});

test("OTO durumu çevriliyor, BİLİNMEYEN 'yolda' sayılıyor", () => {
  /*
    OTO yeni bir adım eklediğinde gönderi "taslak"a düşüp kullanıcıyı
    yeniden oluşturmaya itmemeli; bilinmeyen adım yolda kabul ediliyor.
  */
  assert.equal(otoDurumunuCevir("pickedUp"), "picked_up");
  assert.equal(otoDurumunuCevir("outForDelivery"), "in_transit");
  assert.equal(otoDurumunuCevir("delivered"), "delivered");
  assert.equal(otoDurumunuCevir("sortingAtHub"), "in_transit", "bilinmeyen adım");
  assert.equal(otoDurumunuCevir(null), "created", "durum gelmediyse oluşturuldu");
});

const kalemlerTedarikcili = [
  { id: "k1", quantity: 3, product_name: "Kupa", supplier: "Tarzyeri" },
  { id: "k2", quantity: 1, product_name: "Tabak", supplier: "Tarzyeri" },
  { id: "k3", quantity: 2, product_name: "Krem", supplier: "LR" },
  { id: "k4", quantity: 1, product_name: "Kaşık", supplier: null },
];

test("bölme önerisi TEDARİKÇİYE göre gruplanıyor", () => {
  /*
    Bölmenin gerçek ekseni kargo firması değil tedarikçi: paketler ayrı
    depolardan çıkıyor ve tek gönderi fiziksel olarak mümkün değil.
  */
  const gruplar = tedarikciGruplari(kalemlerTedarikcili, []);
  assert.deepEqual(gruplar.map((g) => [g.tedarikci, g.toplamAdet]), [
    ["LR", 2],
    ["Tarzyeri", 4],
    [null, 1],
  ]);
});

test("kargoya verilen adet öneriden düşülüyor", () => {
  const mevcut = [gonderi("g1", "created", [{ order_item_id: "k1", quantity: 2 }])];
  const tarzyeri = tedarikciGruplari(kalemlerTedarikcili, mevcut).find((g) => g.tedarikci === "Tarzyeri")!;
  assert.deepEqual(tarzyeri.kalemler, [
    { id: "k1", ad: "Kupa", kalan: 1 },
    { id: "k2", ad: "Tabak", kalan: 1 },
  ]);
});

test("tamamı kargoya verilmiş tedarikçi ÖNERİDE görünmüyor", () => {
  // "0 kalem" başlığı ekranda yalnızca yer kaplar.
  const mevcut = [gonderi("g1", "created", [{ order_item_id: "k3", quantity: 2 }])];
  const gruplar = tedarikciGruplari(kalemlerTedarikcili, mevcut);
  assert.equal(gruplar.some((g) => g.tedarikci === "LR"), false);
});

test("tedarikçisi BELİRSİZ kalem gizlenmiyor, sonda duruyor", () => {
  // Adı olan gruplar işin bilinen kısmı; belirsiz olan dikkat isteyen artık.
  const gruplar = tedarikciGruplari(kalemlerTedarikcili, []);
  assert.equal(gruplar.at(-1)!.tedarikci, null);
  assert.deepEqual(gruplar.at(-1)!.kalemler, [{ id: "k4", ad: "Kaşık", kalan: 1 }]);
});

test("boş tedarikçi adı belirsiz sayılıyor", () => {
  const gruplar = tedarikciGruplari([{ id: "x", quantity: 1, product_name: "X", supplier: "   " }], []);
  assert.equal(gruplar[0].tedarikci, null);
});

test("İZLENECEK GÖNDERİ: taslak, iptal ve teslim sorulmuyor", () => {
  /*
    Üçünü sormak boşa çağrı; zamanlanmış görevde her turda tekrarlanan
    boşa çağrı ve sıra gerçek gönderilere kalmıyor.
  */
  assert.equal(izlenmeliMi("draft"), false);
  assert.equal(izlenmeliMi("cancelled"), false);
  assert.equal(izlenmeliMi("delivered"), false);
  assert.equal(izlenmeliMi("created"), true);
  assert.equal(izlenmeliMi("in_transit"), true);
});

test("İZLEME SÜRESİ dolan gönderi sorulmuyor", () => {
  /*
    Durumu ilerlemeyen gönderi sonsuza kadar sorulmamalı: kargo firması
    kaydı düşürmüş olabilir ve her tur onu yeniden sorarsa kota ve sıra
    gerçek gönderilere kalmaz.
  */
  const simdi = new Date("2026-09-27T12:00:00Z");
  assert.equal(izlemeSuresiDoldu("2026-09-20T12:00:00Z", simdi, 30), false, "7 günlük gönderi izlenir");
  assert.equal(izlemeSuresiDoldu("2026-08-01T12:00:00Z", simdi, 30), true, "57 günlük gönderi izlenmez");
  // Sınırın tam üstü henüz dolmamış sayılıyor.
  assert.equal(izlemeSuresiDoldu("2026-08-28T12:00:00Z", simdi, 30), false);
});

test("kargoya verilme tarihi yoksa süre dolmuş sayılmıyor", () => {
  /*
    Tarihi olmayan kaydı elemek, yeni oluşturulmuş bir gönderiyi hiç
    sormamak olurdu; tanınmayan tarih de aynı şekilde.
  */
  assert.equal(izlemeSuresiDoldu(null, new Date(), 30), false);
  assert.equal(izlemeSuresiDoldu("tarih değil", new Date(), 30), false);
});

test("KARGOYA VERİLDİ yalnızca her kalem gönderiye girince", () => {
  /*
    Bölünmüş kargoda ilk paket çıkınca durumu değiştirmek, müşteriye
    siparişin tamamı yola çıktı demek olurdu; gelmeyen kalemi kayıp
    sanar, panelde de kalan kalemin gönderisi unutulur.
  */
  assert.equal(kargoyaVerildiMi("processing", "tamam", false), true);
  assert.equal(kargoyaVerildiMi("processing", "kismi", false), false);
  assert.equal(kargoyaVerildiMi("processing", "yok", false), false);
});

test("kapanmış sipariş kargoya verilmiş sayılmıyor", () => {
  // Parası geri gitmiş sipariş akışta ilerlemez.
  assert.equal(kargoyaVerildiMi("processing", "tamam", true), false);
});

test("zaten kargoya verilmiş sipariş tekrar yazılmıyor", () => {
  // Tekrar yazmak olay geçmişini aynı satırla kirletirdi.
  assert.equal(kargoyaVerildiMi("fulfilled", "tamam", false), false);
});

test("GÖNDERİ DURUMU kartta gerçek değeriyle görünüyor", () => {
  /*
    Kart eskiden iptal, teslim ve tedarikçi dışındaki HER durumu
    "Etiket üretildi" diye gösteriyordu: cron picked_up/in_transit/failed
    yazıyordu ama ekranda hepsi aynıydı. Kaybolan paket "Etiket
    üretildi" diye duruyordu.
  */
  assert.equal(gonderiDurumEtiketi("failed", "oto"), "Sorunlu");
  assert.equal(gonderiDurumEtiketi("in_transit", "oto"), "Yolda");
  assert.equal(gonderiDurumEtiketi("picked_up", "oto"), "Kuryeye teslim edildi");
  assert.equal(gonderiDurumEtiketi("delivered", "oto"), "Teslim edildi");
  assert.equal(gonderiDurumEtiketi("cancelled", "oto"), "İptal");
});

test("tedarikçinin kendi gönderdiği kayıtta 'etiket üretildi' demiyor", () => {
  // OTO devreye girmiyor, etiketi biz üretmiyoruz.
  assert.equal(gonderiDurumEtiketi("created", "manual"), "Tedarikçi gönderdi");
  assert.equal(gonderiDurumEtiketi("created", "oto"), "Etiket üretildi");
  // Sonraki durumlar kaynaktan bağımsız.
  assert.equal(gonderiDurumEtiketi("delivered", "manual"), "Teslim edildi");
});

test("tanınmayan durum olduğu gibi gösteriliyor", () => {
  // OTO yeni bir durum eklerse ekranda boş değil, ham değer görünür.
  assert.equal(gonderiDurumEtiketi("yepyeni", "oto"), "yepyeni");
});

test("SORUNLU gönderi ayırt ediliyor", () => {
  // OTO'nun returned, lost ve failed durumları buraya düşüyor.
  assert.equal(gonderiSorunlu("failed"), true);
  assert.equal(gonderiSorunlu("in_transit"), false);
  assert.equal(gonderiSorunlu("cancelled"), false);
});

test("TESLİM aşaması: bütün paketler teslim edilince", () => {
  /*
    Cron durumu OTO'dan çekip delivered yazıyordu ama listede hâlâ
    "Kargoda" görünüyordu: sistem biliyor, ekran söylemiyordu.
  */
  const kalemler: SiparisKalemi[] = [{ id: "k1", quantity: 2, product_name: "Kupa" }];
  const teslim: Gonderi[] = [{ id: "g1", status: "delivered", items: [{ order_item_id: "k1", quantity: 2 }] }];
  assert.equal(kargoGorunumu(kalemler, teslim), "teslim");
});

test("TEK PAKET teslim edilse de sipariş teslim sayılmıyor", () => {
  /*
    Üç paketli siparişte birinin teslimi, müşteri kalanını beklerken
    "teslim edildi" demek olurdu.
  */
  const kalemler: SiparisKalemi[] = [{ id: "k1", quantity: 1, product_name: "Kupa" }, { id: "k2", quantity: 1, product_name: "Tabak" }];
  const gonderiler: Gonderi[] = [
    { id: "g1", status: "delivered", items: [{ order_item_id: "k1", quantity: 1 }] },
    { id: "g2", status: "in_transit", items: [{ order_item_id: "k2", quantity: 1 }] },
  ];
  assert.equal(kargoGorunumu(kalemler, gonderiler), "tamam");
});

test("kargoya verilmemiş sipariş teslim sayılmıyor", () => {
  const kalemler: SiparisKalemi[] = [{ id: "k1", quantity: 2, product_name: "Kupa" }];
  assert.equal(kargoGorunumu(kalemler, []), "yok");
});

test("İPTAL edilen gönderi teslim kararını bozmuyor", () => {
  // İptal edilen paket yola çıkmadı; teslim edilenlerin arasında sayılmamalı.
  const kalemler: SiparisKalemi[] = [{ id: "k1", quantity: 1, product_name: "Kupa" }];
  const gonderiler: Gonderi[] = [
    { id: "g0", status: "cancelled", items: [{ order_item_id: "k1", quantity: 1 }] },
    { id: "g1", status: "delivered", items: [{ order_item_id: "k1", quantity: 1 }] },
  ];
  assert.equal(kargoGorunumu(kalemler, gonderiler), "teslim");
});
