import assert from "node:assert/strict";
import test from "node:test";
import { iadeIstatistikBaslangici, iadeIstatistikleri, type IstatistikIadesi } from "@/lib/iade-istatistik";

/*
  İade kartının hesabı. Pencereler Türkiye gününe göre kesiliyor;
  "an" sabit veriliyor ki test gece yarısı da aynı sonucu versin.

  16 Ekim 2026, 12:00 Türkiye saati (UTC+3) = 09:00Z.
*/
const AN = Date.parse("2026-10-16T09:00:00Z");
const gunOnce = (gun: number, saat = 12) =>
  new Date(AN - gun * 86_400_000 - (12 - saat) * 3_600_000).toISOString();

const talep = (ek: Partial<IstatistikIadesi>): IstatistikIadesi => ({
  status: "tamamlandi",
  refund_amount: 0,
  reason: "Beğenmedim",
  created_at: gunOnce(1),
  resolved_at: null,
  ...ek,
});

test("iade edilen para refund_amount'tan ve yalnızca tamamlanan talepten", () => {
  const sonuc = iadeIstatistikleri([
    talep({ status: "tamamlandi", refund_amount: 12_000 }),
    /* Onaylandı ama para gönderilmedi: kasadan çıkmadı, sayılmamalı. */
    talep({ status: "onaylandi", refund_amount: 99_000 }),
    talep({ status: "reddedildi", refund_amount: 50_000 }),
  ], AN);
  assert.equal(sonuc.iade30, 12_000);
  assert.equal(sonuc.son30, 3);
});

test("ret oranı yalnızca KARAR VERİLMİŞ talepler üzerinden", () => {
  /* Bekleyen talep oranı seyreltirse ekran "red azaldı" der; oysa karar verilmemiş. */
  const sonuc = iadeIstatistikleri([
    talep({ status: "reddedildi" }),
    talep({ status: "tamamlandi" }),
    talep({ status: "beklemede" }),
    talep({ status: "beklemede" }),
  ], AN);
  assert.equal(sonuc.red30, 1);
  assert.equal(sonuc.redOrani, 50, "iki kararın biri ret");
});

test("karar süresi yalnızca sonuçlanmış talepte, bekleyenin yaşı ayrı", () => {
  const sonuc = iadeIstatistikleri([
    talep({ status: "tamamlandi", created_at: gunOnce(3), resolved_at: gunOnce(2) }),
    talep({ status: "beklemede", created_at: gunOnce(5) }),
  ], AN);
  assert.equal(sonuc.ortalamaKararSaati, 24);
  assert.equal(sonuc.enYasliBekleyenSaat, 120, "bekleyen ortalamaya girmez, yaşı ayrı yazılır");
});

test("bozuk ve geriye dönük damga ortalamayı eksiye çekmiyor", () => {
  const sonuc = iadeIstatistikleri([
    talep({ status: "tamamlandi", created_at: gunOnce(2), resolved_at: gunOnce(4) }),
    talep({ status: "tamamlandi", created_at: "bozuk-tarih", resolved_at: gunOnce(1) }),
  ], AN);
  assert.equal(sonuc.ortalamaKararSaati, null, "ölçülebilir karar yok");
  assert.equal(sonuc.son30, 1, "bozuk damga hiç sayılmıyor");
});

test("sebepler çoktan aza, boş sebep 'Belirtilmedi'", () => {
  const sonuc = iadeIstatistikleri([
    talep({ reason: "Bedeni olmadı" }),
    talep({ reason: "Bedeni olmadı" }),
    talep({ reason: "  " }),
  ], AN);
  assert.deepEqual(sonuc.sebepler, [{ sebep: "Bedeni olmadı", adet: 2 }, { sebep: "Belirtilmedi", adet: 1 }]);
});

test("önceki dönem boşken değişim yüzdesi null", () => {
  const sonuc = iadeIstatistikleri([talep({})], AN);
  assert.equal(sonuc.talepDegisimi, null);
  assert.equal(sonuc.iadeDegisimi, null);
});

test("değişim önceki 30 günle karşılaştırılıyor", () => {
  const sonuc = iadeIstatistikleri([
    talep({ created_at: gunOnce(1) }),
    talep({ created_at: gunOnce(2) }),
    talep({ created_at: gunOnce(40) }),
  ], AN);
  assert.equal(sonuc.son30, 2);
  assert.equal(sonuc.onceki30, 1);
  assert.equal(sonuc.talepDegisimi, 100);
});

test("pencere başı altı ayı ve önceki 30 günü kapsıyor", () => {
  const bas = iadeIstatistikBaslangici(AN);
  assert.ok(bas <= AN - 59 * 86_400_000, "önceki 30 gün içeride");
  assert.ok(bas <= Date.parse("2026-05-01T00:00:00+03:00"), "altıncı ayın başı içeride");
});
