import assert from "node:assert/strict";
import test from "node:test";
import { WA_SABLONLARI, mesajGovdesi, numarayiDuzelt } from "@/lib/whatsapp/sablonlar";

/*
  Meta şablonları parametreleri KONUMSAL tutuyor ({{1}}, {{2}}).
  Sıranın kaymasının bedeli hata değil, YANLIŞ MESAJ: müşteriye
  "Siparişiniz Ayşe Yılmaz kargoya verildi" yazar ve kimse fark
  etmez. Bu yüzden sıra testle sabitleniyor.
*/
test("şablon parametre sırası sabit", () => {
  assert.deepEqual(WA_SABLONLARI.siparis_alindi.parametreler, ["musteri", "siparis_no", "tutar"]);
  assert.deepEqual(WA_SABLONLARI.siparis_kargoda.parametreler, ["musteri", "siparis_no", "kargo_firmasi", "takip_no"]);
  assert.deepEqual(WA_SABLONLARI.siparis_iptal.parametreler, ["musteri", "siparis_no"]);
  assert.deepEqual(WA_SABLONLARI.iade_tamamlandi.parametreler, ["musteri", "siparis_no"]);
});

test("Meta'ya yazılan gövdedeki {{n}} sayısı parametre sayısıyla aynı", () => {
  /*
    Gövde metni Meta'ya elle kopyalanıyor. Parametre eklenip gövde
    güncellenmezse Meta şablonu reddeder ya da eksik parametreyle
    gönderim düşer; ikisi de bu testle önce yakalanır.
  */
  for (const [anahtar, sablon] of Object.entries(WA_SABLONLARI)) {
    const yerler = [...sablon.govde.matchAll(/\{\{(\d+)\}\}/g)].map((e) => Number(e[1]));
    assert.deepEqual(
      [...new Set(yerler)].sort((a, b) => a - b),
      sablon.parametreler.map((_, i) => i + 1),
      `${anahtar}: gövdedeki {{n}} ile parametre listesi uyuşmuyor`,
    );
  }
});

test("şablon adı Meta'nın kabul ettiği biçimde", () => {
  for (const [anahtar, sablon] of Object.entries(WA_SABLONLARI)) {
    assert.equal(sablon.ad, anahtar, "kayıt anahtarı ile şablon adı aynı olmalı");
    assert.match(sablon.ad, /^[a-z][a-z0-9_]*$/, `${anahtar}: yalnızca küçük harf ve alt çizgi`);
  }
});

test("telefon numarası E.164'e çevriliyor", () => {
  assert.equal(numarayiDuzelt("+90 555 111 22 33"), "905551112233");
  assert.equal(numarayiDuzelt("0555 111 22 33"), "905551112233");
  assert.equal(numarayiDuzelt("5551112233"), "905551112233");
  assert.equal(numarayiDuzelt("905551112233"), "905551112233");
});

test("tanınmayan biçim reddediliyor, uydurulmuyor", () => {
  /* Yanlış kişiye mesaj göndermektense göndermemek doğru. */
  assert.equal(numarayiDuzelt("123"), null);
  assert.equal(numarayiDuzelt(""), null);
  assert.equal(numarayiDuzelt(null), null);
  assert.equal(numarayiDuzelt("555 111 22"), null);
});

test("gövde Cloud API'nin beklediği şekilde kuruluyor", () => {
  const sonuc = mesajGovdesi("siparis_kargoda", "0555 111 22 33", {
    musteri: "Ayşe Yılmaz",
    siparis_no: "AC261017-0042",
    kargo_firmasi: "Yurtiçi Kargo",
    takip_no: "1234567890",
  });
  assert.ok("body" in sonuc);
  const body = sonuc.body as Record<string, unknown>;
  assert.equal(body.to, "905551112233");
  assert.equal(body.type, "template");
  const sablon = body.template as { name: string; language: { code: string }; components: { parameters: { text: string }[] }[] };
  assert.equal(sablon.name, "siparis_kargoda");
  assert.equal(sablon.language.code, "tr");
  /* Sıra: müşteri, sipariş no, kargo firması, takip no. */
  assert.deepEqual(
    sablon.components[0].parameters.map((p) => p.text),
    ["Ayşe Yılmaz", "AC261017-0042", "Yurtiçi Kargo", "1234567890"],
  );
});

test("eksik parametre hangi alan olduğunu söylüyor", () => {
  /*
    Meta eksik parametreyi reddediyor ama hangisinin eksik olduğunu
    söylemiyor; mesaj hiç gitmiyor ve sebebi anlaşılmıyordu.
  */
  const sonuc = mesajGovdesi("siparis_kargoda", "05551112233", { musteri: "Ayşe", siparis_no: "AC-1" });
  assert.ok("hata" in sonuc);
  assert.match(sonuc.hata, /kargo_firmasi, takip_no/);
});

test("boşluktan oluşan parametre de eksik sayılıyor", () => {
  const sonuc = mesajGovdesi("siparis_iptal", "05551112233", { musteri: "   ", siparis_no: "AC-1" });
  assert.ok("hata" in sonuc);
  assert.match(sonuc.hata, /musteri/);
});

test("tanınmayan şablon ve bozuk numara ayrı ayrı bildiriliyor", () => {
  const a = mesajGovdesi("boyle_sablon_yok", "05551112233", {});
  assert.ok("hata" in a);
  assert.match(a.hata, /Tanınmayan şablon/);

  const b = mesajGovdesi("siparis_iptal", "123", { musteri: "Ayşe", siparis_no: "AC-1" });
  assert.ok("hata" in b);
  assert.match(b.hata, /uygun değil/);
});
