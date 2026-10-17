import assert from "node:assert/strict";
import test from "node:test";
import { yuzdeOrani } from "@/lib/oran";

/* Tedarik kartında ölçüldü: 3.257/3.264 "%100 vitrinde" diyordu,
   oysa yedi ürün yayında değildi (17.10.2026). */
test("yuvarlama uçları uydurmuyor", () => {
  assert.equal(yuzdeOrani(3_257, 3_264), 99, "tamamı değilse %100 yazılmaz");
  assert.equal(yuzdeOrani(1, 10_000), 1, "sıfır değilse %0 yazılmaz");
  assert.equal(yuzdeOrani(3_264, 3_264), 100, "gerçekten hepsi");
  assert.equal(yuzdeOrani(0, 3_264), 0, "gerçekten sıfır");
});

test("olağan değerler en yakına yuvarlanıyor", () => {
  assert.equal(yuzdeOrani(1, 3), 33);
  assert.equal(yuzdeOrani(2, 3), 67);
  assert.equal(yuzdeOrani(45, 100), 45);
});

test("taban sıfırsa oran yok", () => {
  assert.equal(yuzdeOrani(0, 0), null);
  assert.equal(yuzdeOrani(5, 0), null);
});
