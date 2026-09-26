import assert from "node:assert/strict";
import test from "node:test";
import { kullaniciMesaji, otoHataMetni, OtoHatasi } from "@/lib/tryoto/hatalar";

/*
  OTO hata çevirisi. Sınanan şey çevirinin güzelliği değil: hatanın
  GİZLENMEMESİ. Çevrilemeyen mesaj olduğu gibi geçmeli, yoksa operasyoncu
  "işlem başarısız" görüp desteği aramak zorunda kalır.
*/

test("hata metni farklı alan adlarından okunuyor", () => {
  assert.equal(otoHataMetni({ message: "Insufficient balance" }), "Insufficient balance");
  assert.equal(otoHataMetni({ errorMessage: "  boşluklu  " }), "boşluklu");
  assert.equal(otoHataMetni({ error: "x" }), "x");
});

test("alan bazlı doğrulama hataları tek satıra getiriliyor", () => {
  assert.equal(
    otoHataMetni({ errors: { city: ["required"], weight: "invalid" } }),
    "city: required · weight: invalid",
  );
});

test("metin yoksa null", () => {
  assert.equal(otoHataMetni({}), null);
  assert.equal(otoHataMetni(null), null);
  assert.equal(otoHataMetni("düz metin"), null);
  assert.equal(otoHataMetni({ message: "   " }), null, "boşluktan ibaret mesaj sayılmaz");
});

test("bilinen durumlar YAPILACAK ŞEYİ söylüyor", () => {
  assert.match(kullaniciMesaji("Insufficient wallet balance"), /bakiye yükleyin/);
  assert.match(kullaniciMesaji("Unauthorized"), /yenileme anahtarını kontrol edin/);
  assert.match(kullaniciMesaji("Pickup location not defined"), /pickup location/i);
});

test("ÇEVRİLEMEYEN mesaj olduğu gibi geçiyor", () => {
  // Genel bir "işlem başarısız" metni gerçek sebebi gizlerdi.
  assert.equal(kullaniciMesaji("Shipment weight exceeds carrier limit of 30kg"), "Shipment weight exceeds carrier limit of 30kg");
});

test("mesaj hiç yoksa durum koduna göre konuşuluyor", () => {
  assert.match(kullaniciMesaji(null, 401), /kimlik doğrulaması reddedildi/);
  assert.match(kullaniciMesaji(null, 503), /yanıt vermiyor/);
  assert.equal(kullaniciMesaji(null), "OTO isteği tamamlanamadı.");
});

test("OtoHatasi ham mesajı da taşıyor", () => {
  // Kullanıcıya çevirisi gösterilir, günlüğe ham metin yazılır.
  const hata = new OtoHatasi("Insufficient balance", 400);
  assert.match(hata.message, /bakiye/);
  assert.equal(hata.hamMesaj, "Insufficient balance");
  assert.equal(hata.durumKodu, 400);
});

test("büyük/küçük harf farkı eşleşmeyi bozmuyor", () => {
  // OTO'nun yazımı uçtan uca tutarlı değil.
  assert.match(kullaniciMesaji("INSUFFICIENT BALANCE"), /bakiye yükleyin/);
});

test("GENEL kelime içeren açıklayıcı mesajlar çevrilmiyor", () => {
  /*
    "weight" ve "city" izleri denendi ve kaldırıldı: OTO'nun kendi mesajı
    zaten anlaşılırken çeviri en işe yarar kısmı (sınır değeri, şehir adı)
    siliyordu. Bu satırlar o kararı sabitliyor.
  */
  const sinir = "Shipment weight exceeds carrier limit of 30kg";
  assert.equal(kullaniciMesaji(sinir), sinir);
  const sehir = "Destination city 'Çankaya' is not served by this carrier";
  assert.equal(kullaniciMesaji(sehir), sehir);
});
