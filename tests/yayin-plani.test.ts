import assert from "node:assert/strict";
import test from "node:test";
import { yayinOzeti, yayinPlani } from "@/lib/yayin-plani";
import { trIsoToLocal, trLocalToIso } from "@/lib/tr-time";

/*
  Plan ile durumun çelişmesi SESSİZ kalamaz: zamanlanmış görev
  sonradan beklenmedik bir şey yapar. En kötüsü arşiv — arşivlediğiniz
  ürünün ertesi sabah mağazada belirmesi.
*/

const SIMDI = "2026-10-05T09:00:00.000Z";
const GECMIS = "2026-10-05T08:00:00.000Z";
const GELECEK = "2026-10-06T09:00:00.000Z";
const DAHA_SONRA = "2026-10-08T09:00:00.000Z";

test("gelecekteki plan taslakta olduğu gibi kalıyor", () => {
  const sonuc = yayinPlani({ durum: "draft", publishAt: GELECEK, unpublishAt: DAHA_SONRA, simdi: SIMDI });
  assert.deepEqual(sonuc, { durum: "draft", publishAt: GELECEK, unpublishAt: DAHA_SONRA });
});

test("arşivlenen ürünün planı kaldırılıyor", () => {
  /* Bırakılsaydı ürün ertesi sabah mağazada geri belirirdi. */
  const sonuc = yayinPlani({ durum: "archived", publishAt: GELECEK, unpublishAt: null, simdi: SIMDI });
  assert.equal(sonuc.publishAt, null);
  assert.equal(sonuc.unpublishAt, null);
  assert.match(sonuc.not ?? "", /arşiv/i);
});

test("geçmiş yayın zamanı hemen uygulanıyor", () => {
  /* Görevi beklemek "kaydettim ama hâlâ taslak" dakikaları yaşatırdı. */
  const sonuc = yayinPlani({ durum: "draft", publishAt: GECMIS, unpublishAt: DAHA_SONRA, simdi: SIMDI });
  assert.equal(sonuc.durum, "active");
  assert.equal(sonuc.publishAt, null);
  assert.equal(sonuc.unpublishAt, DAHA_SONRA, "bitiş zamanı korunmalı");
});

test("geçmiş bitiş zamanı ürünü hemen taslağa alıyor", () => {
  const sonuc = yayinPlani({ durum: "active", publishAt: null, unpublishAt: GECMIS, simdi: SIMDI });
  assert.equal(sonuc.durum, "draft");
  assert.equal(sonuc.unpublishAt, null);
});

test("yayındaki ürünün yayına girme zamanı kaldırılıyor", () => {
  const sonuc = yayinPlani({ durum: "active", publishAt: GELECEK, unpublishAt: DAHA_SONRA, simdi: SIMDI });
  assert.equal(sonuc.durum, "active");
  assert.equal(sonuc.publishAt, null);
  assert.equal(sonuc.unpublishAt, DAHA_SONRA);
  assert.match(sonuc.not ?? "", /yayında/i);
});

test("başlangıcı olmayan taslakta bitiş zamanı kaldırılıyor", () => {
  /* Kullanıcı kampanyanın biteceğini sanır, oysa hiç başlamayacaktı. */
  const sonuc = yayinPlani({ durum: "draft", publishAt: null, unpublishAt: GELECEK, simdi: SIMDI });
  assert.equal(sonuc.unpublishAt, null);
  assert.match(sonuc.not ?? "", /yayına girme zamanı verilmediği/i);
});

test("ters aralık kaydedilmiyor", () => {
  const sonuc = yayinPlani({ durum: "draft", publishAt: DAHA_SONRA, unpublishAt: GELECEK, simdi: SIMDI });
  assert.match(sonuc.hata ?? "", /sonra olmalı/i);
  /* Eşitlik de reddediliyor: sıfır saniyelik yayın bir kusurdur. */
  assert.match(yayinPlani({ durum: "draft", publishAt: GELECEK, unpublishAt: GELECEK, simdi: SIMDI }).hata ?? "", /sonra olmalı/i);
});

test("planı olmayan ürün olduğu gibi kalıyor", () => {
  for (const durum of ["active", "draft", "archived"] as const) {
    const sonuc = yayinPlani({ durum, publishAt: null, unpublishAt: null, simdi: SIMDI });
    assert.equal(sonuc.durum, durum);
    assert.equal(sonuc.publishAt, null);
    assert.equal(sonuc.not, undefined);
  }
});

test("özet metni Türkiye saatiyle yazılıyor", () => {
  /* 06:00Z = Türkiye'de 09:00; sunucu UTC'de çalışıyor. */
  const metin = yayinOzeti("2026-10-06T06:00:00.000Z", null);
  assert.match(metin, /09:00/);
  assert.match(metin, /yayına girecek/);
  assert.match(yayinOzeti(null, "2026-10-06T06:00:00.000Z"), /yayından çıkacak/);
  assert.match(yayinOzeti("2026-10-06T06:00:00.000Z", "2026-10-08T06:00:00.000Z"), /arası yayında/);
  assert.equal(yayinOzeti(null, null), "");
});

test("form alanı ile ISO arasındaki çevrim kayıpsız", () => {
  /*
    Alan Türkiye saati gösteriyor, veritabanı UTC tutuyor. Tek yönlü
    çevrim yeterli değil: kayıtlı zaman alana yazılamazsa, forma
    dokunmadan Kaydet'e basmak planı SİLER.
  */
  const iso = trLocalToIso("2026-10-06T09:00");
  assert.equal(iso, "2026-10-06T06:00:00.000Z");
  assert.equal(trIsoToLocal(iso), "2026-10-06T09:00");
  assert.equal(trIsoToLocal(null), "");
  assert.equal(trIsoToLocal("bozuk"), "");
});
