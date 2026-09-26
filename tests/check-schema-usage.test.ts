import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";

/*
  ŞEMA DENETİMİNİN KENDİSİNİN SINANMASI.

  Denetim sessizce kör kaldığında denetlediği hatadan farksız olur: yeşil
  bir çıktı "sorun yok" diye okunur. 27.09.2026'da denetimin iki kör
  noktası aynı gün, aynı dosyada ortaya çıktı ve ikisi de "zincir bitişik
  metindir" varsayımından geliyordu:

    1. KAÇIRMA — koşullu süzgeç. `let sorgu = supabase.from("…")` sonrası
       gelen `if (x) sorgu = sorgu.gte("yanlis_sutun", …)` satırı hiç
       denetlenmiyordu. Koşullu süzgeç yazmanın en doğal biçimi bu.
    2. YANLIŞ ALARM — sarmalanmış sorgu. `gecmisSorgusu().order("login_at")`
       ifadesi metinde bir SONRAKİ .from()'un zincirine düşüyor ve sütun
       yanlış tabloda aranıyordu.

  Yanlış alarm en az kaçırma kadar zararlı: denetime güven kalmazsa
  çıktısına bakılmaz. Bu yüzden aşağıda ikisi de sabitleniyor.

  Örnek ağaç: tests/fixtures/sema (tsconfig ve eslint dışarıda bırakır).
*/
function denetim(): { cikis: number; cikti: string } {
  const argumanlar = ["scripts/check-schema-usage.mjs", "tests/fixtures/sema", "tests/fixtures/sema/katalog.json"];
  try {
    return { cikis: 0, cikti: execFileSync("node", argumanlar, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (sorun) {
    const hata = sorun as { status?: number; stdout?: string; stderr?: string };
    return { cikis: hata.status ?? 1, cikti: `${hata.stdout ?? ""}${hata.stderr ?? ""}` };
  }
}

const sonuc = denetim();

test("şema denetimi · örnek ağaçtaki hataları bildiriyor", () => {
  assert.equal(sonuc.cikis, 1, "sorun varken çıkış kodu 1 olmalı, yoksa CI yeşil geçer");
});

test("KOŞULLU SÜZGEÇ denetleniyor (eskiden hiç görünmüyordu)", () => {
  /*
    `let sorgu = …from("oturum_kayitlari")` sonra `sorgu = sorgu.eq(…)`.
    Sorgu bir değişkene bağlandığında o ad da tablonun sahibi sayılıyor.
  */
  assert.match(sonuc.cikti, /kosullu-suzgec\.ts:5\s+oturum_kayitlari\.kullanici_id yok/);
  assert.match(sonuc.cikti, /kosullu-suzgec\.ts:6\s+oturum_kayitlari\.giris_zamani yok/);
});

test("SARMALANMIŞ SORGU doğru tabloda aranıyor (eskiden yanlış alarmdı)", () => {
  /*
    `gecmis()` oturum_kayitlari döndürüyor; çağrısındaki .order("login_at")
    o tabloya ait ve geçerli. Denetim bunu komşu .from("personel")
    zincirine yazıp "personel.login_at yok" diyordu.
  */
  assert.doesNotMatch(sonuc.cikti, /personel\.login_at/);
  assert.doesNotMatch(sonuc.cikti, /sarmalanmis-sorgu\.ts/);
});

test("doğru yazılmış dosya hiç bildirilmiyor", () => {
  // Yanlış alarm, kaçırılan hata kadar zararlı: denetime güven kalmaz.
  assert.doesNotMatch(sonuc.cikti, /temiz\.ts/);
});

test("ÇOK TABLOLU fonksiyon bağlanmıyor", () => {
  /*
    İki tabloya birden dokunan bir fonksiyonda hangi sütunun hangi tabloya
    ait olduğu belirsiz. Tahmin yürütmek yanlış alarm üretirdi; bilinçli
    sınır olarak hiç bağlanmıyor.
  */
  assert.doesNotMatch(sonuc.cikti, /cok-tablolu\.ts/);
});

test("denetimin en başından beri yakaladıkları hâlâ yakalanıyor", () => {
  // Sahiplik modeline geçerken eski kapsamın daralmadığının kanıtı.
  assert.match(sonuc.cikti, /klasik\.ts:3\s+tablo yok: olmayan_tablo/);
  assert.match(sonuc.cikti, /klasik\.ts:4\s+personel\.unvan yok \(select\)/);
  assert.match(sonuc.cikti, /klasik\.ts:5\s+personel\.yanlis_sutun yok \(insert\)/);
  assert.match(sonuc.cikti, /klasik\.ts:6\s+fonksiyon yok: olmayan_fonksiyon\(\)/);
});

test("örnek ağaçta yalnızca beklenen altı sorun var", () => {
  // Sayı sabit: yeni bir yanlış alarm sınıfı eklenirse burada görünür.
  assert.match(sonuc.cikti, /✗ Şema sözleşmesi: 6 sorun/);
});
