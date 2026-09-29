import assert from "node:assert/strict";
import test from "node:test";
import { ALT_ALAN_SONEKI, altAlanAdresi, magazaAdresi } from "@/lib/magaza-adresi";

/*
  Önizleme adresi yanlışsa kullanıcı BAŞKA bir mağazayı düzenliyor
  sanır: yedek adres ArvoCulture'ındı ve adresi olmayan her salon
  önizlemede o markanın vitrinini görüyordu.
*/

test("doğrulanmış özel alan adı önce geliyor", () => {
  assert.equal(
    magazaAdresi({ custom_domain: "Salon.com", domain_verified_at: "2026-09-01T00:00:00Z", platform_subdomain: "salon" }),
    "https://salon.com",
  );
});

test("doğrulanmamış özel alan adı kullanılmıyor", () => {
  /* DNS bağlanmadan o adres açılmıyor; önizleme 404 verirdi. */
  assert.equal(magazaAdresi({ custom_domain: "salon.com", platform_subdomain: "salon" }), `https://${altAlanAdresi("salon")}`);
  assert.equal(magazaAdresi({ custom_domain: "salon.com" }), null);
});

test("alt alan adı kiracı açılışında atandığı için yeni salonun adresi var", () => {
  assert.equal(magazaAdresi({ platform_subdomain: "Salon-Beta" }), `https://salon-beta.${ALT_ALAN_SONEKI}`);
});

test("eski mağazanın storefront_url'i son çare", () => {
  assert.equal(magazaAdresi({ storefront_url: "https://eski.com" }), "https://eski.com/");
});

test("dağıtım adresi ve http kabul edilmiyor", () => {
  /* Silinen bir Vercel dağıtımı editörü tamamen kullanılamaz yapıyordu. */
  assert.equal(magazaAdresi({ storefront_url: "https://arc-abc123.vercel.app" }), null);
  assert.equal(magazaAdresi({ storefront_url: "http://salon.com" }), null);
  assert.equal(magazaAdresi({ storefront_url: "salon.com" }), null);
});

test("adresi olmayan mağaza null dönüyor", () => {
  assert.equal(magazaAdresi(null), null);
  assert.equal(magazaAdresi({}), null);
  assert.equal(magazaAdresi({ platform_subdomain: "  ", storefront_url: "  " }), null);
});
