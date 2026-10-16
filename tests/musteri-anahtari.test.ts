import assert from "node:assert/strict";
import test from "node:test";
import { anahtarSuzgeci, likeDeseni } from "@/app/(panel)/musteriler/customer-data";

/*
  Müşteri detayı anahtarı `ilike` ile arıyor. Değerden `%` ve `_`
  SİLİNİYORDU: ikisi de e-postada geçerli karakter ve "_" çok yaygın,
  yani o müşteri kendi liste satırından 404 alıyordu. Doğrusu silmek
  değil kaçırmak.
*/
test("joker karakterler siliNMİYOR, kaçırılıyor", () => {
  assert.equal(likeDeseni("ali_veli@example.com"), "ali\\_veli@example.com");
  assert.equal(likeDeseni("%indirim%@example.com"), "\\%indirim\\%@example.com");
  assert.equal(likeDeseni("ters\\egik@example.com"), "ters\\\\egik@example.com");
});

test("jokeri olmayan değer hiç değişmiyor", () => {
  /* Olağan e-postada davranış birebir eskisi gibi kalmalı. */
  const eposta = "dogaden2015@gmail.com";
  assert.equal(likeDeseni(eposta), eposta);
});

test("anahtar hangi sütunda aranacağını söylüyor", () => {
  assert.deepEqual(anahtarSuzgeci("a@b.com"), { alan: "customer_email", desen: "a@b.com" });
  /* E-postası olmayan müşteri "name:" ile anahtarlanıyor. */
  assert.deepEqual(anahtarSuzgeci("name:ayşe yılmaz"), { alan: "customer_name", desen: "ayşe yılmaz" });
  assert.deepEqual(anahtarSuzgeci("name:ali_veli"), { alan: "customer_name", desen: "ali\\_veli" });
});
