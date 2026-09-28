import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

/*
  METİN İLE KAPININ AYRIŞMASINI ÖNLEYEN DENETİM.

  Yetki mesajı sekiz ayrı yerde elle yazılmıştı ve ikisi YANLIŞTI:
  tema ile mağaza ayarlarının kapısı owner/admin/manager olduğu hâlde
  metin "yönetici yetkisi gerekir" diyordu. Müdür rolündeki kullanıcı,
  yapabileceği bir işi yapamayacağını sanıyordu.

  Metinler lib/yetki-metni.ts'ye alındı. Bu dosya, birinin yarın yeni
  bir ekranda yeniden elle yazmasını yakalıyor: derleme ve lint bunu
  görmez, çünkü ortada yalnızca bir dizgi var.
*/

const KOK = path.resolve(import.meta.dirname, "../src");

function dosyalar(dizin: string, uzanti: RegExp): string[] {
  return fs.readdirSync(dizin, { withFileTypes: true }).flatMap((girdi) => {
    const tam = path.join(dizin, girdi.name);
    if (girdi.isDirectory()) return dosyalar(tam, uzanti);
    return uzanti.test(girdi.name) ? [tam] : [];
  });
}

/* Elle yazılmış yetki cümlesinin izleri. */
const ELLE_YAZIM = /yetkiniz yok|yetkisine sahip değil|yetkisi gerek(ir|iyor)|yönetici olmalısınız/;

test("yetki cümlesi hiçbir ekranda elle yazılmıyor", () => {
  const suclular: string[] = [];
  for (const yol of dosyalar(KOK, /\.tsx?$/)) {
    /* Kaynağın kendisi ve sınavı doğal olarak bu cümleleri içeriyor. */
    if (yol.endsWith(path.join("lib", "yetki-metni.ts"))) continue;
    const icerik = fs.readFileSync(yol, "utf8");
    for (const [sira, satir] of icerik.split("\n").entries()) {
      /* Yorum satırları serbest: kusurun tarihçesi anlatılıyor. */
      const kirpik = satir.trim();
      if (kirpik.startsWith("//") || kirpik.startsWith("*") || kirpik.startsWith("/*")) continue;
      if (ELLE_YAZIM.test(satir)) suclular.push(`${path.relative(KOK, yol)}:${sira + 1}`);
    }
  }
  assert.deepEqual(suclular, [], `Yetki metni lib/yetki-metni.ts'den gelmeli:\n${suclular.join("\n")}`);
});

test("forbidden tanımlayan her mesaj dosyası yetkiYok kullanıyor", () => {
  const eksik: string[] = [];
  for (const yol of dosyalar(KOK, /^mesajlar\.ts$/)) {
    const icerik = fs.readFileSync(yol, "utf8");
    if (!/\bforbidden/.test(icerik)) continue;
    if (!icerik.includes('from "@/lib/yetki-metni"')) eksik.push(path.relative(KOK, yol));
  }
  assert.deepEqual(eksik, [], `Bu dosyalar forbidden tanımlıyor ama metni kendisi yazıyor:\n${eksik.join("\n")}`);
});

test("denetimin kendisi çalışıyor", () => {
  /* Süzgeç bozulursa sınav sessizce yeşil kalırdı. */
  assert.ok(ELLE_YAZIM.test('forbidden: "Bu işlem için yetkiniz yok."'));
  assert.ok(ELLE_YAZIM.test("Temayı değiştirmek için yönetici yetkisi gerekir."));
  assert.equal(ELLE_YAZIM.test('forbidden: yetkiYok("stok hareketi")'), false);
  /* Taranan ağaçta gerçekten mesaj dosyası bulunuyor mu? */
  assert.ok(dosyalar(KOK, /^mesajlar\.ts$/).length >= 10);
});
