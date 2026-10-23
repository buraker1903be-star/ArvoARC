import { test } from "node:test";
import assert from "node:assert/strict";
import { urunSlugu } from "@/lib/supplier/urun-slugu";

/*
  23.10.2026: tedarikçi kodu "TR- 11006" boşluklu geldi, adres
  "…-siyah-tr- 11006" oldu; ürün sayfası 404 verdi, site haritasına
  bozuk adres girdi.
*/
test("boşluklu tedarikçi kodu adrese boşluk sokmaz", () => {
  const slug = urunSlugu("10 Kasım Atatürk Anma Günü Siluet Baskılı T-Shirt - Siyah", "TR- 11006");
  assert.doesNotMatch(slug, /\s/);
  assert.match(slug, /-tr-11006$/);
});

test("düzgün kodların adresi değişmiyor (eski ürünlerle uyumlu)", () => {
  /* Eskiden: `${slugify(ad)}-${kod.toLowerCase()}` — düzgün kodda aynı sonuç. */
  assert.equal(urunSlugu("Kadın Şort - Yeşil", "TR-11090"), "kadin-sort-yesil-tr-11090");
});

test("adres yalnızca küçük harf, rakam ve tire", () => {
  assert.match(urunSlugu("Erkek Gömlek / Çizgili", "AB_12.3 x"), /^[a-z0-9-]+$/);
});
