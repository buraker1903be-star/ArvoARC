import assert from "node:assert/strict";
import test from "node:test";
import { NOTR_ANA, NOTR_ARKA, NOTR_VURGU, temaVarsayilanlari } from "@/lib/tema-varsayilanlari";

/*
  Varsayılan tema, HİÇ DOKUNULMADAN yayınlansa da doğru olmalı.
  Eskiden ArvoCulture'ın metinleriydi: yeni bir salon Mağaza
  Tasarımı'nı açtığında o markanın adını, sloganlarını ve — en
  kötüsü — o markanın kupon kodunu (ARVO10) görüyor, "Taslağı
  kaydet"e bastığında kendi temasına yazıyordu.
*/

const HEPSI = (deger: ReturnType<typeof temaVarsayilanlari>) =>
  Object.values(deger).filter((v): v is string => typeof v === "string");

test("hiçbir varsayılanda başka markanın izi yok", () => {
  const metinler = HEPSI(temaVarsayilanlari({ magazaAdi: "Salon Beta" })).join(" ").toLocaleLowerCase("tr-TR");
  for (const yasak of ["arvoculture", "arvo10", "apparel", "kendini giy", "yaşam kültürü"]) {
    assert.ok(!metinler.includes(yasak), `varsayılanda "${yasak}" kalmış`);
  }
});

test("bağlantılar mağazanın kendi köküne gidiyor", () => {
  /* Yeni salonun koleksiyonu yok; /koleksiyon/giyim 404 verirdi. */
  const v = temaVarsayilanlari({ magazaAdi: "Salon Beta" });
  assert.equal(v.primary_cta_href, "/");
  assert.equal(v.secondary_cta_href, "/");
});

test("metinler mağaza adından türüyor", () => {
  const v = temaVarsayilanlari({ magazaAdi: "Salon Beta" });
  assert.ok(v.announcement.includes("Salon Beta"));
  assert.ok(v.footer_tagline.includes("Salon Beta"));
  assert.equal(v.hero_eyebrow, "SALON BETA");
});

test("büyük harfe çevirme Türkçe", () => {
  /* "i" İngilizce kurallarla "I" olurdu; salonun adı yanlış yazılırdı. */
  assert.equal(temaVarsayilanlari({ magazaAdi: "işıl güzellik" }).hero_eyebrow, "İŞIL GÜZELLİK");
});

test("adı boş olan mağaza da çökmüyor", () => {
  const v = temaVarsayilanlari({ magazaAdi: "   " });
  assert.equal(v.hero_eyebrow, "MAĞAZA");
  assert.ok(v.announcement.startsWith("Mağaza"));
});

test("kampanya bölümü kapalı başlıyor", () => {
  /* Açık olsaydı yeni mağaza, olmayan bir indirimi duyururdu. */
  assert.equal(temaVarsayilanlari({ magazaAdi: "Salon Beta" }).show_campaign, false);
});

test("renk kiracıdan, yoksa nötr", () => {
  const kendi = temaVarsayilanlari({ magazaAdi: "Salon", anaRenk: "#1a2b3c", vurguRenk: "#abcdef", arkaRenk: "#fffffe" });
  assert.equal(kendi.primary_color, "#1A2B3C");
  assert.equal(kendi.accent_color, "#ABCDEF");
  assert.equal(kendi.background_color, "#FFFFFE");

  const bos = temaVarsayilanlari({ magazaAdi: "Salon" });
  assert.equal(bos.primary_color, NOTR_ANA);
  assert.equal(bos.accent_color, NOTR_VURGU);
  assert.equal(bos.background_color, NOTR_ARKA);
});

test("bozuk renk nötre düşüyor", () => {
  /* Kısa ya da adıyla yazılmış renk CSS'e sızarsa vitrin bozulur. */
  for (const bozuk of ["#fff", "red", "", "  ", "#12345g"]) {
    assert.equal(temaVarsayilanlari({ magazaAdi: "Salon", anaRenk: bozuk }).primary_color, NOTR_ANA, bozuk);
  }
});

test("yapılandırılmış mağazanın kendi config'i üste biniyor", () => {
  /*
    Sayfadaki yayılımın kuralı: { ...varsayilan, ...draft.config }.
    ArvoCulture gibi kurulu bir mağaza hiçbir metnini kaybetmemeli.
  */
  const varsayilan = temaVarsayilanlari({ magazaAdi: "Salon Beta" });
  const kendi = { hero_title: "Kendini", hero_emphasis: "giy.", primary_color: "#111210" };
  const birlesik = { ...varsayilan, ...kendi };
  assert.equal(birlesik.hero_title, "Kendini");
  assert.equal(birlesik.primary_color, "#111210");
  assert.equal(birlesik.trust_one, varsayilan.trust_one, "config'de olmayan anahtar varsayılandan gelmeli");
});
