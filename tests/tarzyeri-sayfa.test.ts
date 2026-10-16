import { test } from "node:test";
import assert from "node:assert/strict";
import { canliKarar, sayfaStoklari } from "@/lib/supplier/tarzyeri-sayfa";

/* 16.10.2026'da tarzyeri.com'dan alınan gerçek bloğun kısaltılmışı. */
const SAYFA = `<script type="text/javascript"> const PRODUCT_PAGE_DATA = {
             price: '326,00 TL',
                                                                variants: {"count":2,"summary":{"Siyah":{"S":{"in_stock":true,"quantity":"349","price_dif":false,"price_list":0,"barcode":"869-7010-11627-Siyah-S"},"L":{"in_stock":true,"quantity":"3","price_dif":false,"price_list":0,"barcode":"869-7010-11627-Siyah-L"},"XL":{"in_stock":false,"quantity":"0","price_dif":false,"price_list":0,"barcode":"869-7010-11627-Siyah-XL"}}}}
                    }
        $(".social-share-special").jsSocials({ showLabel: false });
</script>`;

const sayfa = (durumKodu = 200, html = SAYFA) => ({ durumKodu, stoklar: sayfaStoklari(html) });

test("sayfadaki blok barkod bazında okunuyor", () => {
  const tablo = sayfaStoklari(SAYFA);
  assert.ok(tablo);
  assert.equal(tablo.size, 3);
  assert.deepEqual(tablo.get("869-7010-11627-Siyah-S"), { inStock: true, quantity: 349 });
  assert.deepEqual(tablo.get("869-7010-11627-Siyah-XL"), { inStock: false, quantity: 0 });
});

test("blok yoksa ya da bozuksa 'bilinmiyor' — 'stok yok' değil", () => {
  assert.equal(sayfaStoklari("<html>bakım çalışması</html>"), null);
  assert.equal(sayfaStoklari("const PRODUCT_PAGE_DATA = { variants: {\"summary\": {"), null);
  assert.deepEqual(canliKarar(sayfa(200, "<html></html>"), "869-7010-11627-Siyah-S", 1, 5), { durum: "bilinmiyor" });
  assert.deepEqual(canliKarar(null, "869-7010-11627-Siyah-S", 1, 5), { durum: "bilinmiyor" });
  assert.deepEqual(canliKarar(sayfa(503), "869-7010-11627-Siyah-S", 1, 5), { durum: "bilinmiyor" });
});

test("stokta olan satılır", () => {
  assert.deepEqual(canliKarar(sayfa(), "869-7010-11627-Siyah-S", 2, 5), { durum: "uygun", satilabilir: 349 });
});

test("Tarzyeri'de kapanan, kaldırılan ya da sayfası silinen satılmaz", () => {
  assert.equal(canliKarar(sayfa(), "869-7010-11627-Siyah-XL", 1, 5).durum, "tukendi");
  assert.equal(canliKarar(sayfa(), "869-9157-12306-GülKurusu-L", 1, 5).durum, "tukendi");
  assert.equal(canliKarar(sayfa(404), "869-7010-11627-Siyah-S", 1, 5).durum, "tukendi");
});

test("tamponun altı satılmaz; tarama ile aynı kural", () => {
  // Tarzyeri'de 3 adet, tampon 5 → kapalı.
  assert.equal(canliKarar(sayfa(), "869-7010-11627-Siyah-L", 1, 5).durum, "tukendi");
  assert.deepEqual(canliKarar(sayfa(), "869-7010-11627-Siyah-L", 2, 0), { durum: "uygun", satilabilir: 3 });
  assert.deepEqual(canliKarar(sayfa(), "869-7010-11627-Siyah-L", 4, 0), { durum: "yetersiz", satilabilir: 3 });
});
