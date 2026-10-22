import assert from "node:assert/strict";
import { test } from "node:test";
import { bildirimMetni, magazaBulgulari, TEDARIKCI_SESSIZLIK_SAATI, type MagazaOlcumu } from "@/lib/oz-denetim";

const SIMDI = new Date("2026-10-18T06:00:00Z");
const saatOnce = (saat: number) => new Date(SIMDI.getTime() - saat * 3_600_000).toISOString();

const SAGLAM: MagazaOlcumu = {
  magazaId: "11111111-1111-4111-8111-111111111111",
  magazaAdi: "Deneme Mağaza",
  vitrinAcik: true,
  odemeYontemiVar: true,
  tedarikciVar: true,
  sonTedarikciTaramasi: saatOnce(0.2),
  vitrinDurumu: 200,
  siteHaritasiUrun: 2876,
  ornekUrunDurumu: 200,
  yurtdisiAcik: false,
  kurDamgasi: null,
};

const kodlar = (olcum: Partial<MagazaOlcumu>) =>
  magazaBulgulari({ ...SAGLAM, ...olcum }, SIMDI).map((b) => b.kod);

test("sağlam mağaza bulgu üretmiyor", () => {
  assert.deepEqual(kodlar({}), []);
});

test("vitrini kapalı mağaza hiç denetlenmiyor", () => {
  /* Kapalı olması zaten bir karar; her gün uyarmak gürültü olurdu. */
  assert.deepEqual(kodlar({ vitrinAcik: false, odemeYontemiVar: false, vitrinDurumu: 500 }), []);
});

test("ödeme yöntemi yoksa bildiriliyor", () => {
  /*
    Müşteri sepete kadar geliyor ve ödeme adımında hiçbir seçenek
    bulamıyor: ekranda hata yok, satış tamamen durmuş.
  */
  assert.deepEqual(kodlar({ odemeYontemiVar: false }), ["odeme_yok"]);
});

test("vitrin açılmıyorsa bildiriliyor", () => {
  assert.deepEqual(kodlar({ vitrinDurumu: 500 }), ["vitrin_kapali"]);
  /* Ölçülemediyse bulgu üretilmiyor: bilmemek ile bozuk olmak ayrı. */
  assert.deepEqual(kodlar({ vitrinDurumu: null }), []);
});

test("boş site haritası bildiriliyor, azalma bildirilmiyor", () => {
  assert.deepEqual(kodlar({ siteHaritasiUrun: 0 }), ["site_haritasi_bos"]);
  /*
    Katalog gerçekten küçülmüş olabilir; her küçülmede uyarmak uyarıyı
    okunmaz yapardı.
  */
  assert.deepEqual(kodlar({ siteHaritasiUrun: 12 }), []);
});

test("site haritasındaki ürün açılmıyorsa bildiriliyor", () => {
  /*
    17.10.2026: bütün ürün sayfaları 500 verirken site haritası 3.407
    adres saymaya devam ediyordu. İkisi çelişiyor ve müşteri arama
    sonucundan kırık sayfaya düşüyor.
  */
  assert.deepEqual(kodlar({ ornekUrunDurumu: 500 }), ["urun_sayfasi_kapali"]);
  assert.deepEqual(kodlar({ ornekUrunDurumu: 404 }), ["urun_sayfasi_kapali"]);
});

test("tedarikçi taraması susarsa bildiriliyor", () => {
  /* Tarama beş dakikada bir koşuyor; altı saat, yetmiş turun kaçması. */
  assert.deepEqual(kodlar({ sonTedarikciTaramasi: saatOnce(TEDARIKCI_SESSIZLIK_SAATI + 1) }), ["tedarikci_durdu"]);
  assert.deepEqual(kodlar({ sonTedarikciTaramasi: saatOnce(TEDARIKCI_SESSIZLIK_SAATI - 1) }), []);
  assert.deepEqual(kodlar({ sonTedarikciTaramasi: null }), ["tedarikci_hic_taranmadi"]);
});

test("tedarikçisi olmayan mağazada tarama beklenmiyor", () => {
  assert.deepEqual(kodlar({ tedarikciVar: false, sonTedarikciTaramasi: null }), []);
});

test("bir mağazanın bulguları tek bildirimde toplanıyor", () => {
  /* Üç ayrı bildirim, aynı sabah çekmeceyi dolduran üç satır demekti. */
  const bulgular = magazaBulgulari(
    { ...SAGLAM, odemeYontemiVar: false, vitrinDurumu: 503 },
    SIMDI,
  );
  assert.equal(bulgular.length, 2);
  const mesaj = bildirimMetni(bulgular);
  assert.equal(mesaj?.baslik, "2 sorun bulundu");
  assert.match(mesaj!.metin, /Ödeme yöntemi yok/);
  assert.match(mesaj!.metin, /Vitrin açılmıyor/);
});

test("tek bulguda başlık bulgunun kendisi", () => {
  const mesaj = bildirimMetni(magazaBulgulari({ ...SAGLAM, odemeYontemiVar: false }, SIMDI));
  assert.equal(mesaj?.baslik, "Ödeme yöntemi yok");
});

test("bulgu yoksa bildirim üretilmiyor", () => {
  assert.equal(bildirimMetni([]), null);
});

test("uzun metin cümlenin ortasında kesilmiyor", () => {
  /* Kapı gövdeyi 400 karaktere kırpıyor; kırpmayı burada yapıyoruz. */
  const cok = Array.from({ length: 12 }, (_, i) => ({
    magazaId: "x", magaza: "M", kod: `k${i}`,
    baslik: `Başlık ${i}`, metin: "Uzunca bir açıklama cümlesi burada duruyor.",
  }));
  const mesaj = bildirimMetni(cok);
  assert.ok(mesaj!.metin.length <= 380);
  assert.ok(mesaj!.metin.endsWith("…"));
});

/*
  DONMUŞ KUR, YANLIŞ FİYAT DEMEK — ve sessiz: yurtdışı sayfası fiyat
  göstermeye devam ediyor, yalnızca yanlış gösteriyor. TCMB biçim
  değiştirse ya da zamanlanmış iş düşse hiçbir ekranda hata çıkmaz.
*/
test("yurtdışı açıkken bayat kur bildiriliyor", () => {
  const bulgular = magazaBulgulari(
    {
      ...SAGLAM,
      yurtdisiAcik: true,
      kurDamgasi: new Date(SIMDI.getTime() - 5 * 86_400_000).toISOString(),
    },
    SIMDI,
  );
  assert.deepEqual(bulgular.map((b) => b.kod), ["kur_bayat"]);
  assert.match(bulgular[0].metin, /5 gün/);
});

test("hafta sonunu geçen kur bayat SAYILMIYOR", () => {
  /*
    TCMB bülteni hafta sonu ve resmî tatilde yayımlanmıyor: cuma
    akşamı yazılan kur pazartesi sabahı üç günlüktür ve bu olağan.
    Eşiği bir güne çekmek her hafta sonu yanlış alarm üretirdi ve
    her hafta gelen bir uyarı, okunmayan bir uyarıdır.
  */
  const bulgular = magazaBulgulari(
    {
      ...SAGLAM,
      yurtdisiAcik: true,
      kurDamgasi: new Date(SIMDI.getTime() - 3 * 86_400_000).toISOString(),
    },
    SIMDI,
  );
  assert.deepEqual(bulgular, []);
});

test("yurtdışı KAPALIYSA kura hiç bakılmıyor", () => {
  /* Kapalı mağazada kur kullanılmıyor; olmayan bir fiyatın
     bayatlığı diye bir şey yok. */
  const bulgular = magazaBulgulari(
    { ...SAGLAM, yurtdisiAcik: false, kurDamgasi: null },
    SIMDI,
  );
  assert.deepEqual(bulgular, []);
});

test("yurtdışı açık ama kurun tarihi yoksa bildiriliyor", () => {
  const bulgular = magazaBulgulari(
    { ...SAGLAM, yurtdisiAcik: true, kurDamgasi: null },
    SIMDI,
  );
  assert.deepEqual(bulgular.map((b) => b.kod), ["kur_bilinmiyor"]);
});
