import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

/*
  İŞLEM SONUCU ADRESTE TAŞINMAZ.

  Sonuç eskiden `/siparisler/123?error=...` gibi adrese yazılıyordu ve
  sayfalar onu doğrudan basıyordu (`ERRORS[kod] ?? kod`). Dışarıdan
  gönderilen bir bağlantı, kullanıcıya sistemin ürettiği gibi görünen
  uydurma bir mesaj gösterebiliyordu. Bu test o kalıbın geri gelmesini
  engelliyor; kural kodda gözle görünmediği için tek koruma bu.
*/

const KOK = path.join(process.cwd(), "src", "app");

function dosyalar(dizin: string, uzanti: string[]): string[] {
  const sonuc: string[] = [];
  for (const girdi of fs.readdirSync(dizin, { withFileTypes: true })) {
    const tam = path.join(dizin, girdi.name);
    if (girdi.isDirectory()) sonuc.push(...dosyalar(tam, uzanti));
    else if (uzanti.some((u) => girdi.name.endsWith(u))) sonuc.push(tam);
  }
  return sonuc;
}

const kisa = (yol: string) => path.relative(process.cwd(), yol);

test("hiçbir sayfa adresten işlem sonucu okumuyor", () => {
  /*
    Süzgeç ve sayfalama parametreleri (q, filter, page) serbest: onlar
    listeyi belirliyor, kullanıcıya mesaj göstermiyor.
  */
  const sonucAlanlari = /\b(params|query)\.(error|ok|saved|created|deleted|published|imported|updated|neden)\b/;
  const suclular = dosyalar(KOK, [".tsx"])
    .filter((yol) => sonucAlanlari.test(fs.readFileSync(yol, "utf8")))
    .map(kisa);
  assert.deepEqual(suclular, [], "Bu sayfalar adres satırından sonuç okuyor");
});

/*
  GİRİŞ ve ŞİFRE ekranları dışarıda. Onlar oturum açılmadan görülüyor ve
  yalnızca SABİT kod gönderiyor; sayfaları tanımadıkları kodu basmıyor,
  bilinen metne düşüyor. Yani adresle uydurma metin yazdırılamıyor.
  Aşağıdaki ikinci test bunu sabitliyor — muafiyet, o sayfalar ham değeri
  basmadığı sürece geçerli.
*/
const MUAF = ["src/app/login/actions.ts", "src/app/sifre/actions.ts"];

test("hiçbir işlem sonucu adrese yazmıyor", () => {
  const adreseYazan = /redirect\([^)]*\?(?:error|saved|ok|created|deleted|published|imported|neden)=/;
  const suclular = dosyalar(KOK, [".ts"])
    .filter((yol) => adreseYazan.test(fs.readFileSync(yol, "utf8")))
    .map(kisa)
    .filter((yol) => !MUAF.includes(yol));
  assert.deepEqual(suclular, [], "Bu işlemler sonucu adrese yazıyor; çerez kullanın (lib/panel-bildirim.ts)");
});

test("giriş ve şifre ekranları adresten gelen metni BASMIYOR", () => {
  /*
    Muafiyetin şartı bu. 27.09.2026'da /sifre sayfası ?neden= değerini
    olduğu gibi basıyordu ve o değerin kaynağı gelen adresin kendi
    parametresiydi: herkes şifre sıfırlama ekranına istediği metni
    yazdırabiliyordu. Kimlik avına en açık ekran orası.
  */
  for (const sayfa of ["src/app/login/page.tsx", "src/app/sifre/page.tsx", "src/app/sifre/yeni/page.tsx"]) {
    const icerik = fs.readFileSync(path.join(process.cwd(), sayfa), "utf8");
    // Tanınmayan kodun kendisine düşen bir yedek olmamalı: "?? error" gibi.
    assert.doesNotMatch(icerik, /\?\?\s*(error|neden)\b/, `${sayfa} adresten gelen ham değeri basıyor`);
  }
});

test("bildirim çerezi tek kullanımlık olarak temizleniyor", () => {
  /*
    Silinmezse çerez ömrü boyunca (60 sn) her yenilemede aynı mesaj çıkar
    ve kullanıcı işlemi ikinci kez yaptığını sanar; hata mesajında daha
    da yanıltıcı, düzelttiği hatayı düzelmemiş görür.
  */
  const temizleyici = fs.readFileSync(path.join(process.cwd(), "src/components/panel/bildirim-temizle.tsx"), "utf8");
  assert.match(temizleyici, /Max-Age=0/);
  const bildirim = fs.readFileSync(path.join(process.cwd(), "src/components/panel/bildirim.tsx"), "utf8");
  assert.match(bildirim, /BildirimTemizle/);
});
