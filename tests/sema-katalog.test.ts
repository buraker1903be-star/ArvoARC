/*
  KATALOG GÖRÜNÜMLERİ DE TANIYOR.

  Katalog yalnızca "create table" arıyordu; görünümler hiç girmiyordu.
  Oysa ArvoOS'un kodu ops_contracts, ops_opportunities ve ops_proposals'ı
  okuyor. 01.10.2026'da ortaya çıktı: döküm yenilenince üç görünüm birden
  kataloğdan düştü ve `check:schema` çalışan kodu "tablo yok" diye
  reddetti. Önceki katalogda duruyorlardı — bir kez elle eklenmişler,
  yani her döküm yenilemede yeniden eklenmeleri gerekiyordu ve denetim
  sessizce kendi kendini yanıltır hâle gelmişti.

  Asıl zorluk sütun adlarının SELECT listesinden çıkarılması: ifadelerin
  içindeki virgüller sütun ayırıcı değil.
*/
import assert from "node:assert/strict";
import test from "node:test";
import { buildCatalog } from "../scripts/sema-katalog.mjs";

const dokum = (govde: string) => `create or replace view public.ops_test as\n${govde}\n   FROM crm_opportunities o\n  WHERE true;`;

test("görünümün düz sütunları kataloğa giriyor", () => {
  const k = buildCatalog(dokum(" SELECT id,\n    organization_id,\n    o.customer_name"));
  assert.deepEqual(k.tables.ops_test, ["customer_name", "id", "organization_id"]);
});

test("ifadenin takma adı sütun adı sayılıyor", () => {
  const k = buildCatalog(dokum(" SELECT id,\n    count(*) AS adet"));
  assert.deepEqual(k.tables.ops_test, ["adet", "id"]);
});

test("ifade içindeki virgüller sütun ayırıcı değil", () => {
  /* jsonb_build_object(...) sekiz virgül taşıyor; naif bir split
     burada sekiz uydurma sütun üretirdi. */
  const k = buildCatalog(
    dokum(" SELECT id,\n    jsonb_build_object('a', x ->> 'a'::text, 'b', x ->> 'b'::text) AS kunye"),
  );
  assert.deepEqual(k.tables.ops_test, ["id", "kunye"]);
});

test("tırnak içindeki virgül de bölmüyor", () => {
  const k = buildCatalog(dokum(" SELECT id,\n    concat(a, ', ', b) AS tam_ad"));
  assert.deepEqual(k.tables.ops_test, ["id", "tam_ad"]);
});

test("tablolar eskisi gibi okunuyor", () => {
  /* Görünüm desteği tabloları bozmamalı: kataloğun asıl işi o. */
  const k = buildCatalog('create table if not exists public.deneme (\n  id uuid not null,\n  ad text\n);');
  assert.deepEqual(k.tables.deneme, ["ad", "id"]);
});
