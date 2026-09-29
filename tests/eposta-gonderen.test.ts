import assert from "node:assert/strict";
import test from "node:test";
import { adresiAyikla, gonderenAdresi } from "@/lib/eposta-gonderen";

/*
  Yedek gönderen bir KİRACININ adresiydi: ikinci salonun müşterisi,
  sipariş onayını başka bir markanın adıyla alıyordu. Alan adı
  doğrulaması (DNS) tamamlanmadan adres değişemiyor; görünen ad
  değişebiliyor ve müşterinin okuduğu şey o.
*/

test("görünen ad mağazanın, adres platformun", () => {
  assert.equal(
    gonderenAdresi("Salon Beta", "ArvoCulture <siparis@arvoculture.com>"),
    "Salon Beta <siparis@arvoculture.com>",
  );
});

test("yedek düz adres de olabiliyor", () => {
  assert.equal(gonderenAdresi("Salon Beta", "siparis@arvo-os.com"), "Salon Beta <siparis@arvo-os.com>");
});

test("adı boş mağazada yalnızca adres kalıyor", () => {
  /* "<adres>" biçimi geçersiz olurdu; düz adres geçerli. */
  assert.equal(gonderenAdresi("   ", "Platform <siparis@arvo-os.com>"), "siparis@arvo-os.com");
});

test("başlığı bozacak karakterler ayıklanıyor", () => {
  /*
    Mağaza adındaki <, > ve satır sonu e-posta başlığını bozar; satır
    sonu ayrıca başlık enjeksiyonuna açık kapı bırakırdı.
  */
  assert.equal(
    gonderenAdresi('Sa<lon> "Beta"\r\nBcc: kurban@x.com', "siparis@arvo-os.com"),
    'Sa lon Beta Bcc: kurban@x.com <siparis@arvo-os.com>',
  );
  const uretilen = gonderenAdresi("Salon\r\nBeta", "siparis@arvo-os.com");
  assert.ok(!/[\r\n]/.test(uretilen), "satır sonu kalmamalı");
});

test("adres ayıklama iki biçimi de tanıyor", () => {
  assert.equal(adresiAyikla("Ad <a@b.com>"), "a@b.com");
  assert.equal(adresiAyikla("  a@b.com  "), "a@b.com");
});
