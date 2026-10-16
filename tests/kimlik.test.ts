import assert from "node:assert/strict";
import test from "node:test";
import { kimlikMi } from "@/lib/kimlik";

/*
  Bozuk kimlik çökme ekranı veriyordu: Postgres uuid olmayan değeri
  22P02 ile reddediyor, sayfa da onu okuma hatası sayıp fırlatıyordu
  (16.10.2026, sipariş/ürün/koleksiyon detayında canlıda ölçüldü).
*/
test("uuid biçimi tanınıyor", () => {
  assert.equal(kimlikMi("0ec27b14-be76-4412-972b-02817c9ce749"), true);
  assert.equal(kimlikMi("0EC27B14-BE76-4412-972B-02817C9CE749"), true, "büyük harf de uuid");
});

test("kırpılmış ve bozuk değerler kimlik değil", () => {
  // Satır sonuna denk gelip yarım giden sipariş bağlantısı.
  assert.equal(kimlikMi("0ec27b14-be76-4412-972b"), false);
  assert.equal(kimlikMi("bozuk-kimlik"), false);
  assert.equal(kimlikMi("0ec27b14-xxxx-4412-972b-02817c9ce749"), false);
  assert.equal(kimlikMi("0ec27b14-be76-4412-972b-02817c9ce749 "), false, "boşluk sorguya gitmemeli");
  assert.equal(kimlikMi(""), false);
  assert.equal(kimlikMi(undefined), false);
  assert.equal(kimlikMi(null), false);
});
