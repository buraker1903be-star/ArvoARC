import assert from "node:assert/strict";
import { test } from "node:test";
import { durumWaAnahtari, durumSablonlariTanimli } from "@/lib/whatsapp/durum-anahtari";
import { WA_SABLONLARI, kapiMesaji } from "@/lib/whatsapp/sablonlar";
import { statusUpdateEmail } from "@/lib/email/order-confirmation";
import type { StoreBrand } from "@/lib/store-brand";

const TEST_BRAND: StoreBrand = {
  name: "Test Mağaza",
  logoUrl: null,
  siteUrl: "https://test.example",
  legalName: "TEST LTD. ŞTİ.",
  legalAddress: "Test Mah., İstanbul",
  from: "Test <test@example.com>",
  replyTo: "info@example.com",
};

/* Panelin sipariş durumu açılır listesindeki değerlerin tamamı. */
const DURUMLAR = ["pending", "confirmed", "processing", "fulfilled", "cancelled", "refunded"];

test("e-postanın bildirdiği her durumda WhatsApp da gidiyor", () => {
  /*
    ASIL KORUNAN KURAL. 17.10.2026'da iki kanal ayrışmıştı: personel
    takip numarası girmeden siparişi "kargoya verildi" yapınca
    e-posta gidiyor, WhatsApp gitmiyordu — tek kargo şablonu takip
    numarası istiyordu. Müşteri aynı olayı bir kanalda öğrenip
    ötekinde öğrenemiyordu ve hiçbir yerde hata görünmüyordu.
  */
  for (const durum of DURUMLAR) {
    for (const trackingSent of [false, true]) {
      const posta = statusUpdateEmail(durum, "#AC-1", "Elif", TEST_BRAND, { trackingSent });
      const anahtar = durumWaAnahtari(durum, { trackingSent });
      /*
        TEK YÖNLÜ kural: e-posta gidiyorsa WhatsApp da gitmeli.
        Tersi serbest — "hazırlanıyor" bilerek yalnızca WhatsApp'tan
        gidiyor. E-postada ara durum bildirimi, müşteriyi sonraki
        postaları da görmezden gelmeye alıştırdığı için kapalı
        tutuluyor (order-confirmation.ts'teki gerekçe); WhatsApp ise
        müşterinin ayrıca ONAY VERDİĞİ, kısa ve beklenen bir kanal.
      */
      if (posta) {
        assert.ok(anahtar, `${durum} (takip=${trackingSent}): e-posta gidiyor ama WhatsApp gitmiyor`);
      }
    }
  }
});

test("üretilen her anahtarın Meta'da karşılığı olan bir şablonu var", () => {
  /* Şablonu olmayan anahtar "Template name does not exist" ile düşer. */
  assert.ok(durumSablonlariTanimli());
  for (const durum of DURUMLAR) {
    const anahtar = durumWaAnahtari(durum);
    if (anahtar) assert.ok(WA_SABLONLARI[anahtar], `${durum} → ${anahtar} şablonu yok`);
  }
});

test("hazırlanıyor durumu müşteriye bildiriliyor", () => {
  /*
    Ödeme ile kargo arasında günler geçebiliyor; o boşlukta
    "siparişim ne oldu" sorusu geliyordu.
  */
  assert.equal(durumWaAnahtari("processing"), "siparis_hazirlaniyor");
  /* E-posta bu durumda bilerek susuyor; WhatsApp onaya bağlı ayrı bir kanal. */
  assert.equal(statusUpdateEmail("processing", "#AC-1", "Elif", TEST_BRAND), null);
});

test("takip numarası girildiyse ikinci kargo mesajı gitmiyor", () => {
  assert.equal(durumWaAnahtari("fulfilled", { trackingSent: false }), "siparis_kargolandi");
  assert.equal(durumWaAnahtari("fulfilled", { trackingSent: true }), null);
});

test("müşteriye görünmeyen ara durumlar sessiz", () => {
  /* pending ve confirmed müşteri için sipariş anından ayırt edilemiyor. */
  assert.equal(durumWaAnahtari("pending"), null);
  assert.equal(durumWaAnahtari("confirmed"), null);
  assert.equal(durumWaAnahtari("boyle_bir_durum_yok"), null);
});

test("yeni şablonlar yalnızca ad ve sipariş numarası istiyor", () => {
  /*
    Panel işlemi bu iki değeri her zaman verebiliyor; üçüncü bir
    parametre eklemek mesajın sessizce düşmesi demek olurdu
    (eksik parametre → gönderilmiyor).
  */
  for (const anahtar of ["siparis_hazirlaniyor", "siparis_kargolandi"]) {
    const sonuc = kapiMesaji(anahtar, "05551112233", { musteri: "Elif", siparis_no: "AC-1" });
    assert.ok("mesaj" in sonuc, `${anahtar} kurulamadı`);
    assert.deepEqual(sonuc.mesaj.params, ["Elif", "AC-1"]);
    assert.ok(!/\{\{\d+\}\}/.test(sonuc.mesaj.body));
  }
});
