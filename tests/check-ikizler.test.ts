import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";

/*
  Vitrin fonksiyonlarının iki ailesi var ve gövdeleri aynı olmak
  zorunda. 17.10.2026'da ayrışmış hâlde bulundular: çok kiracılı
  arama dizini ve sitemap, ArvoCulture ikizleri düzeltilirken
  dışarıda kalmıştı; aynı gün varyant listesinin sınırı da ikizde
  200'e çıkarken burada 60'ta kaldı. Denetim ilk koşusunda bunu
  yakaladı.
*/
const denetim = (sema: string) => {
  const sonuc = spawnSync(process.execPath, ["scripts/check-ikizler.mjs", sema], {
    encoding: "utf8",
  });
  return { cikis: sonuc.status ?? 1, cikti: `${sonuc.stdout}${sonuc.stderr}` };
};

test("ayrışmış ikiz yakalanıyor", () => {
  const { cikis, cikti } = denetim("tests/fixtures/ikizler/ayrisik.sql");
  assert.equal(cikis, 1);
  assert.match(cikti, /arc_storefront_ornek ↔ get_arvoculture_storefront_ornek/);
  assert.match(cikti, /ayrışmış/);
});

test("kiracı çözümü ve yorum farkı ayrışma sayılmıyor", () => {
  const { cikis, cikti } = denetim("tests/fixtures/ikizler/ayni.sql");
  assert.equal(cikis, 0, cikti);
  assert.match(cikti, /1 çift gövdece aynı/);
});

test("ikizi olmayan çok kiracılı fonksiyon bildiriliyor", () => {
  /* Yeni bir kiracı fonksiyonu yazıp ikizini unutmak da ayrışmadır;
     bilinçli istisnalar betikteki listede gerekçesiyle duruyor. */
  const { cikis, cikti } = denetim("tests/fixtures/ikizler/ikizsiz.sql");
  assert.equal(cikis, 1);
  assert.match(cikti, /arc_storefront_yeni_sey: ArvoCulture ikizi yok/);
});

test("canlı şemadaki bütün çiftler aynı", () => {
  const { cikis, cikti } = denetim("supabase/schema/canli-sema.sql");
  assert.equal(cikis, 0, cikti);
});
