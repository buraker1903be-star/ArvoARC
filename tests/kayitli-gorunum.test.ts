import assert from "node:assert/strict";
import test from "node:test";
import {
  EN_FAZLA_GORUNUM,
  gorunumAdi,
  gorunumListesiMi,
  gorunumOzeti,
  gorunumSorgusu,
  gorunumYolu,
  SIPARIS_DURUMLARI,
} from "@/lib/kayitli-gorunum";

/*
  Görünüm, kullanıcıdan gelen bir sorguyu SAKLIYOR ve ekip arkadaşına
  tıklattırıyor. Bu yüzden yazarken yeniden kurulması (tanınmayan her
  şeyin düşmesi) ve iki eşdeğer süzgecin aynı metni vermesi bu
  dosyadaki senaryolarla sabitleniyor.
*/

test("bilinmeyen anahtar ve değerler düşüyor", () => {
  /* Saklanan metin her zaman bu modülün ürettiği bir metin olmalı. */
  assert.equal(gorunumSorgusu("siparisler", "filter=pending&zararli=1"), "filter=pending");
  assert.equal(gorunumSorgusu("siparisler", "filter=uydurma"), "");
  assert.equal(gorunumSorgusu("siparisler", "kargo=hepsi"), "");
  assert.equal(gorunumSorgusu("urunler", "source=tarzyeri&period=7"), "source=tarzyeri");
});

test("varsayılan değerler ve sayfa numarası yazılmıyor", () => {
  /* "all" zaten Tümü çipinin kendisi; sayfa numarası bir süzgeç değil. */
  assert.equal(gorunumSorgusu("siparisler", "filter=all&period=all"), "");
  assert.equal(gorunumSorgusu("siparisler", "filter=pending&page=4"), "filter=pending");
});

test("anahtar sırası sabit: aynı süzgeç tek bir metin veriyor", () => {
  /*
    Adres satırındaki metni doğrudan karşılaştırmak, aynı görünümü iki
    kere kaydettirirdi. Karşılaştırma bu kanonik hâl üzerinden.
  */
  const a = gorunumSorgusu("siparisler", "period=7&filter=pending");
  const b = gorunumSorgusu("siparisler", "filter=pending&period=7");
  assert.equal(a, b);
  assert.equal(a, "filter=pending&period=7");
});

test("arama metni temizleniyor ve boşlukları tekleniyor", () => {
  /* Virgül ve parantez PostgREST süzgeç sözdiziminin parçası. */
  assert.equal(gorunumSorgusu("urunler", "q=kırmızı,elbise"), "q=k%C4%B1rm%C4%B1z%C4%B1+elbise");
  assert.equal(
    gorunumSorgusu("urunler", "q=kırmızı  elbise"),
    gorunumSorgusu("urunler", "q=kırmızı elbise"),
  );
  assert.equal(gorunumSorgusu("urunler", "q=   "), "");
  /* 80 karakterde kesiliyor: sütun kısıtı ve çip genişliği. */
  const uzun = gorunumSorgusu("urunler", "q=" + encodeURIComponent("a".repeat(200)));
  assert.equal(new URLSearchParams(uzun).get("q")?.length, 80);
});

test("URLSearchParams ve nesne de kabul ediliyor", () => {
  /* Sayfa searchParams'ı nesne olarak alıyor, form ise dizgi yolluyor. */
  assert.equal(gorunumSorgusu("siparisler", new URLSearchParams("kargo=sorunlu")), "kargo=sorunlu");
  assert.equal(gorunumSorgusu("siparisler", { filter: "confirmed", page: "2" }), "filter=confirmed");
  assert.equal(gorunumSorgusu("siparisler", { filter: undefined }), "");
  assert.equal(gorunumSorgusu("siparisler", "?filter=pending"), "filter=pending");
});

test("özet uzun etiketi tercih ediyor ve sırayı koruyor", () => {
  assert.equal(gorunumOzeti("siparisler", "filter=pending&period=7"), "Bekliyor · Son 7 gün");
  assert.equal(gorunumOzeti("siparisler", "kargo=sorunlu"), "Sorunlu kargo");
  assert.equal(gorunumOzeti("urunler", "q=serum&filter=draft"), "Arama: “serum” · Taslak");
  assert.equal(gorunumOzeti("siparisler", ""), "");
});

test("yol listeye çıkıyor, süzgeçsizken sorgu eklenmiyor", () => {
  assert.equal(gorunumYolu("siparisler", "filter=pending"), "/siparisler?filter=pending");
  assert.equal(gorunumYolu("urunler", ""), "/urunler");
  /* Bozuk sorgu saklanmış olsa bile yol temiz kuruluyor. */
  assert.equal(gorunumYolu("urunler", "filter=draft&zararli=1"), "/urunler?filter=draft");
});

test("ad tek satıra iniyor ve 40 karakterde kesiliyor", () => {
  assert.equal(gorunumAdi("  Bugün\n  kargolanacaklar  "), "Bugün kargolanacaklar");
  assert.equal(gorunumAdi("x".repeat(60)).length, 40);
  assert.equal(gorunumAdi(""), "");
  assert.equal(gorunumAdi(null), "");
});

test("liste adı denetleniyor", () => {
  assert.ok(gorunumListesiMi("siparisler"));
  assert.ok(gorunumListesiMi("urunler"));
  /* "musteriler" 16.10.2026'da görünümlere açıldı; tanınmayan ad
     örneği olarak kullanılıyordu, gerçekten olmayan bir adla
     değiştirildi. */
  assert.ok(gorunumListesiMi("musteriler"));
  assert.equal(gorunumListesiMi("yok-boyle-liste"), false);
  assert.equal(gorunumListesiMi(undefined), false);
});

test("sayfadaki durum listesi ile görünümün tanıdığı liste aynı", () => {
  /*
    Sayfa bu diziyi import ediyor; kopyası olsaydı yeni bir durum
    eklendiğinde görünüm onu tanımaz ve sessizce düşürürdü.
  */
  for (const [anahtar] of SIPARIS_DURUMLARI) {
    const beklenen = anahtar === "all" ? "" : `filter=${anahtar}`;
    assert.equal(gorunumSorgusu("siparisler", `filter=${anahtar}`), beklenen);
  }
  assert.ok(EN_FAZLA_GORUNUM > 0);
});

/*
  İADE GÖRÜNÜMLERİ (16.10.2026). İade listesi sipariş listesinin
  kalıbına geçtiğinde kaydedilmiş görünümler de ona açıldı.
*/
test("iade görünümünün yolu /siparisler/iadeler", () => {
  /*
    Yol adından TÜRETİLMİYOR: iadeler siparişlerin altında duruyor ve
    "/iadeler" diye bir sayfa yok. Kaydedilmiş her iade görünümü o
    adrese gitse 404 olurdu.
  */
  assert.equal(gorunumYolu("iadeler", "filter=onaylandi"), "/siparisler/iadeler?filter=onaylandi");
  assert.equal(gorunumYolu("iadeler", ""), "/siparisler/iadeler");
  assert.equal(gorunumYolu("urunler", "filter=draft"), "/urunler?filter=draft");
});

test("iade görünümünde varsayılan durum 'beklemede' yazılmıyor", () => {
  /*
    Liste bekleyenlerle açılıyor; "beklemede" varsayılan olduğu için
    sorguya girmez, yoksa aynı süzgeç iki ayrı görünüm gibi görünürdü.
  */
  assert.equal(gorunumSorgusu("iadeler", "filter=beklemede"), "");
  assert.equal(gorunumSorgusu("iadeler", "filter=tamamlandi"), "filter=tamamlandi");
  assert.equal(gorunumSorgusu("iadeler", "filter=yok-boyle"), "", "tanınmayan durum düşer");
  assert.equal(gorunumSorgusu("iadeler", "period=7&q=ARC26"), "q=ARC26&period=7", "anahtar sırası sabit");
});

test("iade görünümünün özeti okunur", () => {
  assert.equal(gorunumOzeti("iadeler", "filter=onaylandi&period=7"), "Onaylandı · ürün bekleniyor · Son 7 gün");
});

test("ÇEVİRİSİ EKSİK süzgeci kaydedilmiş görünümde de geçerli", () => {
  /*
    Süzgeç listede var ama şemada yoksa, kaydedilmiş görünüm onu
    sessizce DÜŞÜRÜYOR: kullanıcı "çevirisi eksik" görünümünü
    kaydediyor, açtığında bütün katalog geliyor ve neden olduğunu
    hiçbir yerde göremiyor. Şema bu yüzden tek kaynak.
  */
  assert.equal(gorunumSorgusu("urunler", "ceviri=eksik"), "ceviri=eksik");
  /* Bayrak yalnızca tanımlı değeriyle geçiyor. */
  assert.equal(gorunumSorgusu("urunler", "ceviri=1"), "");
  assert.equal(gorunumOzeti("urunler", "ceviri=eksik"), "Çevirisi eksik");
  /* Öteki süzgeçlerle birlikte sırası sabit. */
  assert.equal(
    gorunumSorgusu("urunler", "ceviri=eksik&filter=active"),
    gorunumSorgusu("urunler", "filter=active&ceviri=eksik"),
  );
});
