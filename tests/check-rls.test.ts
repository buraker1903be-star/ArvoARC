import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";

/*
  RLS DENETİMİNİN KENDİSİ SINANIYOR.

  Denetim kör kalırsa denetlediği hatadan farksız olur: yeşil çıktı
  "sorun yok" diye okunur. 17.10.2026'da canlıda tam bu hata vardı —
  organization_modules'te RLS açık, politika yok; manuel sipariş, stok
  hareketi ve iade stoğu sessizce ölü.

  Örnek şema üç durumu birden taşıyor: politikalı tablo, politikasız +
  invoker fonksiyonun okuduğu tablo, politikasız ama okunmayan tablo.
*/
function denetim(sema: string, kaynak: string, migrationlar?: string) {
  const argumanlar = ["scripts/check-rls.mjs", sema, kaynak];
  /* Migration dizini verilmezse betik gerçek dizini okuyor; örnek
     dizinler yalnızca gecikme dalını sınamak için. */
  if (migrationlar) argumanlar.push(migrationlar);
  try {
    return { cikis: 0, cikti: execFileSync("node", argumanlar, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (sorun) {
    const hata = sorun as { status?: number; stdout?: string; stderr?: string };
    return { cikis: hata.status ?? 1, cikti: `${hata.stdout ?? ""}${hata.stderr ?? ""}` };
  }
}

test("politikasız tabloyu invoker fonksiyon okuyorsa hata", () => {
  const { cikis, cikti } = denetim("tests/fixtures/rls/sema.sql", "tests/fixtures/rls/src");
  assert.equal(cikis, 1);
  assert.match(cikti, /kurum_modulleri[\s\S]*invoker fonksiyon public\.arc_siparis_olustur/);
});

test("politikasız tabloyu panel kodu okuyorsa da hata", () => {
  const { cikti } = denetim("tests/fixtures/rls/sema.sql", "tests/fixtures/rls/src");
  assert.match(cikti, /kopya_tablo[\s\S]*panel kodu/);
});

test("politikalı tablo sorun sayılmıyor", () => {
  const { cikti } = denetim("tests/fixtures/rls/sema.sql", "tests/fixtures/rls/src");
  assert.ok(!cikti.includes("arc_siparis:"), "politikası olan tablo listelenmemeli");
});

/*
  GECİKME DALI (22.10.2026).

  Migration'lar elle uygulanıyor ve döküm sonra yenileniyor; politikayı
  yerel bir migration kuruyorsa bu olağan akış, hata değil. Ayrım
  olmadığı için `arc_shipping_zones` politika migration'ı yazıldıktan
  sonra CI kırmızı kalıyordu — `check:schema`'da aynı ayrım aynı
  gerekçeyle var.

  İKİ DAL BİRDEN SABİTLENİYOR: gevşek bir eşleşme gerçek kusuru
  "gecikme" diye örterse denetim, denetlediği hatadan farksız olur.
*/
test("politikası yerel migration'da olan tablo gecikme sayılıyor", () => {
  const { cikis, cikti } = denetim(
    "tests/fixtures/rls/sema.sql",
    "tests/fixtures/rls/src",
    "tests/fixtures/rls/migrations",
  );
  /* Gecikme çıkış kodunu düşürmüyor; ama örnek şemada politikası
     HİÇBİR yerde olmayan ikinci bir tablo var ve o hâlâ hata. */
  assert.equal(cikis, 1);
  assert.match(cikti, /kurum_modulleri: politika yerel migration'da/);
  assert.match(cikti, /✖ kopya_tablo: RLS açık ama politika yok/);
  /* Geciken tablo HATA listesinde olmamalı. */
  assert.ok(!/✖ kurum_modulleri/.test(cikti), "geciken tablo hata diye yazılmamalı");
});

test("yalnızca yorumda geçen politika gecikme sayılmıyor", () => {
  /*
    Yorumda adı geçen her tablo kusurdan muaf olsaydı, denetimi
    susturmanın yolu bir yorum yazmak olurdu.
  */
  const { cikis, cikti } = denetim(
    "tests/fixtures/rls/sema.sql",
    "tests/fixtures/rls/src",
    "tests/fixtures/rls/migrations-yorumlu",
  );
  assert.equal(cikis, 1);
  assert.match(cikti, /✖ kurum_modulleri: RLS açık ama politika yok/);
  assert.ok(!/kurum_modulleri: politika yerel/.test(cikti));
});

test("canlı şema temiz", () => {
  const { cikis, cikti } = denetim("supabase/schema/canli-sema.sql", "src");
  assert.equal(cikis, 0, cikti);
  assert.match(cikti, /✓ RLS denetimi/);
});
