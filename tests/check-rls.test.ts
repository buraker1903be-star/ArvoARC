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
function denetim(sema: string, kaynak: string) {
  try {
    return { cikis: 0, cikti: execFileSync("node", ["scripts/check-rls.mjs", sema, kaynak], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
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

test("canlı şema temiz", () => {
  const { cikis, cikti } = denetim("supabase/schema/canli-sema.sql", "src");
  assert.equal(cikis, 0, cikti);
  assert.match(cikti, /✓ RLS denetimi/);
});
