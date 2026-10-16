import { test } from "node:test";
import assert from "node:assert/strict";
import { arcUygulamalari, etkinBolum, etkinUygulama, geriHedefi, kokSayfaMi, osSayfalari } from "@/components/os/os-apps";

const u = arcUygulamalari();

test("açık uygulama en uzun yol önekinden", () => {
  assert.equal(etkinUygulama(u, "/")?.key, "home");
  assert.equal(etkinUygulama(u, "/siparisler/abc")?.key, "siparisler");
  assert.equal(etkinUygulama(u, "/siparisler/iadeler")?.key, "iadeler");
  /* Müşteriler 16.10.2026'da Finans'ın bölümü oldu: ekran para
     tarafını anlatıyor (ömür boyu harcama, ortalama sepet, ciro
     yoğunlaşması) ve başlatıcıda kalması günlük iş için fazla derindi. */
  assert.equal(etkinUygulama(u, "/musteriler/x")?.key, "finans");
  assert.equal(etkinUygulama(u, "/operasyon")?.key, "operasyon");
  assert.equal(etkinUygulama(u, "/analitik")?.key, "finans");
  assert.equal(etkinUygulama(u, "/indirimler")?.key, "indirimler");
  assert.equal(etkinUygulama(u, "/stok")?.key, "katalog");
  assert.equal(etkinUygulama(u, "/tema")?.key, "settings");
  assert.equal(etkinUygulama(u, "/bilinmeyen"), null);
});

test("Siparişler alt menüsüz; Operasyon başlatıcıda, Müşteriler Finans'ın bölümü", () => {
  const siparis = u.find((x) => x.key === "siparisler")!;
  assert.equal(siparis.bolumler, undefined);
  const s = osSayfalari(u).map((x) => x.href);
  assert.ok(s.includes("/operasyon"), "başlatıcı ve Ctrl+K");
  assert.ok(s.includes("/musteriler"), "Finans'ın bölümü olarak Ctrl+K'da");
  const finans = u.find((x) => x.key === "finans")!;
  assert.deepEqual(finans.bolumler?.map((b) => b.href), ["/analitik", "/musteriler"]);
  /* Müşteriler artık ayrı bir uygulama DEĞİL: iki yerde durursa
     etkinUygulama hangisini seçeceğini yol uzunluğundan ayırt edemez. */
  assert.equal(u.some((x) => x.key === "musteriler"), false);
});

test("dock dizilimi kurum sahibinin tarifiyle aynı", () => {
  assert.deepEqual(u.filter((x) => !x.yalnizBaslatici).map((x) => x.label), ["Ana Sayfa", "Siparişler", "İadeler", "İndirimler", "Finans", "Katalog", "Tedarik", "Ayarlar"]);
});

test("telefonda geri: alt sayfadan bölüme, kökte geri yok", () => {
  assert.equal(kokSayfaMi(u, "/siparisler"), true);
  assert.equal(kokSayfaMi(u, "/musteriler"), true);
  assert.equal(kokSayfaMi(u, "/siparisler/3f2a"), false);
  assert.equal(geriHedefi(u, "/siparisler/3f2a"), "/siparisler");
  assert.equal(geriHedefi(u, "/urunler/9"), "/urunler");
});

test("Ctrl+K: bölümler ve bölümsüz uygulamalar", () => {
  const s = osSayfalari(u).map((x) => x.href);
  assert.ok(s.includes("/siparisler/iadeler"));
  assert.ok(s.includes("/analitik"));
  assert.ok(!s.includes("/"));
});

test("rozet yalnızca sıfırdan büyükse", () => {
  assert.equal(arcUygulamalari({ operasyon: 0 }).find((x) => x.key === "siparisler")!.rozet, undefined);
  assert.equal(arcUygulamalari({ operasyon: 3 }).find((x) => x.key === "siparisler")!.rozet, 3);
});

test("Ayarlar bölümleri sorgu değişkeniyle ayrışıyor", () => {
  const ayar = u.find((x) => x.key === "settings")!;
  assert.equal(etkinBolum(ayar.bolumler!, "/ayarlar", "")?.key, "marka");
  assert.equal(etkinBolum(ayar.bolumler!, "/ayarlar", "bolum=kargo")?.key, "kargo");
  assert.equal(etkinBolum(ayar.bolumler!, "/tema", "")?.key, "tema");
});
