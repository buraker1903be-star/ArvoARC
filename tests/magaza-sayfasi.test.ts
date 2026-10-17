import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GOVDE_SINIRI,
  SAYFA_ANAHTARLARI,
  SAYFA_KAYDI,
  paragraflar,
  sssBloklari,
} from "@/lib/magaza-sayfasi";

test("üç sabit sayfa var ve hepsinin açıklaması dolu", () => {
  assert.deepEqual(SAYFA_ANAHTARLARI.sort(), ["hakkimizda", "iletisim", "sss"]);
  for (const [anahtar, tanim] of Object.entries(SAYFA_KAYDI)) {
    assert.ok(tanim.ad.length > 2, `${anahtar} adı yok`);
    /* Açıklama panelde görünüyor; boş bırakmak kiracıya "dene gör"
       demek olurdu. */
    assert.ok(tanim.aciklama.length > 30, `${anahtar} açıklaması yetersiz`);
  }
});

test("SSS blokları ilk satırı soru sayıyor", () => {
  const bloklar = sssBloklari(
    "Kargo ne zaman çıkar?\nSiparişler iki iş günü içinde kargoya verilir.\n\nİade nasıl yapılır?\nOn dört gün içinde\niade talebi açabilirsiniz.",
  );
  assert.equal(bloklar.length, 2);
  assert.equal(bloklar[0].soru, "Kargo ne zaman çıkar?");
  assert.equal(bloklar[0].cevap, "Siparişler iki iş günü içinde kargoya verilir.");
  /* Çok satırlı cevap tek paragrafa iniyor. */
  assert.equal(bloklar[1].cevap, "On dört gün içinde iade talebi açabilirsiniz.");
});

test("cevabı olmayan soru atılıyor", () => {
  /* Başlığı olup içeriği olmayan bir soru, müşteriye yanıtsız bir
     satır göstermek olurdu. */
  assert.deepEqual(sssBloklari("Tek satırlık soru?"), []);
  assert.equal(sssBloklari("Soru?\nCevap.\n\nYalnız soru?").length, 1);
});

test("boş gövde boş liste veriyor", () => {
  assert.deepEqual(sssBloklari(""), []);
  assert.deepEqual(sssBloklari("\n\n   \n"), []);
  assert.deepEqual(paragraflar(""), []);
});

test("paragraflar boş satırla ayrılıyor, satır sonları birleşiyor", () => {
  const p = paragraflar("Birinci\nparagraf devam.\n\nİkinci paragraf.");
  assert.deepEqual(p, ["Birinci paragraf devam.", "İkinci paragraf."]);
});

test("fazla boşluk ve satır sonu metni bozmuyor", () => {
  /* Kiracı kopyala-yapıştır yapıyor; kaynaktan gelen fazla satır
     sonları sayfayı bozmamalı. */
  assert.deepEqual(paragraflar("  Tek paragraf.  \n\n\n\n"), ["Tek paragraf."]);
});

test("gövde sınırı veritabanı kısıtıyla aynı", () => {
  /* Kısıt 8000; panel daha fazlasını kabul ederse kaydetme
     veritabanı hatasıyla düşer ve sebebi kullanıcıya anlaşılmaz
     görünür. */
  assert.equal(GOVDE_SINIRI, 8000);
});
