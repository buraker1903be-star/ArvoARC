// Veritabanı testlerinin ortamı: canlı şema dökümü (supabase/schema/canli-sema.sql)
// ve ardından döküm sonrası eklenen migration'lar PGlite'a kurulur; üstüne
// Supabase'in sağladığı parçalar (roller, auth) taklit edilir. Supabase'in yeni
// tablo ve fonksiyonları anon/authenticated'a açan varsayılan yetkileri de
// taklit ediliyor: bir migration "revoke … from public, anon" yazmayı
// unutursa testte görünsün (19.09.2026'da tam bu oldu).
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";

const KOK = path.resolve(import.meta.dirname, "../../supabase");
/*
  Döküm 19.09.2026'da alındı ama yetki migration'larından ÖNCEki durumu taşıyor:
  fonksiyonlar oluşturulurken Supabase'in varsayılanı onları anon'a açıyor ve
  dökümdeki "revoke … from public" bunu geri almıyor (ARC'taki açığın kökü).
  Bu yüzden yetkileri düzelten migration (20260919114636) dökümün üzerine
  yeniden uygulanır; yalnızca grant/revoke içerir, tekrar çalıştırılabilir.
  Ondan eski migration'lar dökümde zaten var, tekrar uygulanamaz (politika
  çakışır). Yeni migration eklendikçe buradaki sürüm ileri alınır.
*/
const ILK_UYGULANAN = "20260919114636";

const SUPABASE_KABUGU = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema if not exists auth;
create schema if not exists extensions;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth, extensions, public to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
`;

/*
  Döküm fonksiyon yetkilerini olduğu gibi taşıyor (revoke + grant satırları),
  tablo yetkilerini taşımıyor. Bu yüzden döküm kurulduktan SONRA Supabase'in
  tablo varsayılanları verilir; fonksiyonlara dokunulmaz, yoksa dökümdeki
  gerçek yetkiler bozulur ve testler canlıdan gevşek bir dünyayı sınar.
*/
const SUPABASE_TABLO_VARSAYILANI = `
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
`;

/*
  Bundan sonra (migration'larla) oluşan tablo ve fonksiyonlar için Supabase'in
  varsayılanı: yeni fonksiyon anon'a da açık doğar. Migration "revoke … from
  public, anon, authenticated" yazmayı unutursa yetki testinde görünür —
  19.09.2026'da ARC'ta tam olarak bu oldu.
*/
const SUPABASE_YENI_NESNE_VARSAYILANI = `
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

/** Canlı şema + sonraki migration'lar uygulanmış, boş bir veritabanı. */
export async function veritabani() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_KABUGU);
  const uygula = async (dosya) => {
    try {
      await db.exec(fs.readFileSync(dosya, "utf8"));
    } catch (hata) {
      throw new Error(`${path.basename(dosya)}: ${hata.message}`);
    }
  };

  await uygula(path.join(KOK, "schema", "canli-sema.sql"));
  await db.exec(SUPABASE_TABLO_VARSAYILANI);
  await db.exec(SUPABASE_YENI_NESNE_VARSAYILANI);

  const sonrakiler = fs.readdirSync(path.join(KOK, "migrations"))
    .filter((f) => f.endsWith(".sql") && f.slice(0, 14) >= ILK_UYGULANAN)
    .sort();
  for (const dosya of sonrakiler) await uygula(path.join(KOK, "migrations", dosya));
  return db;
}

/** Tek işlem içinde rol değiştirerek ilerleyen akışlar; sonunda geri alınır. */
export async function islem(db, isle) {
  await db.exec("begin");
  try {
    return await isle();
  } finally {
    await db.exec("rollback");
  }
}

/** "postgres" = veritabanı sahibi (tohum ve doğrulama). */
export async function rol(db, ad, kullaniciId = null) {
  await db.exec("reset role");
  const claims = ad === "postgres" ? "" : JSON.stringify({ sub: kullaniciId ?? "", role: ad });
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
  if (ad !== "postgres") await db.exec(`set local role ${ad}`);
}

/** Sorgunun hata vermesini bekler; işlemi bozmadan (savepoint) döner. */
export async function reddedilir(db, sql, params, desen) {
  await db.exec("savepoint beklenen_hata");
  try {
    await db.query(sql, params);
  } catch (hata) {
    await db.exec("rollback to savepoint beklenen_hata");
    if (!desen.test(hata.message)) throw new Error(`Beklenmeyen hata: ${hata.message} (beklenen ${desen})`);
    return;
  }
  await db.exec("release savepoint beklenen_hata");
  throw new Error(`Hata bekleniyordu (${desen}), sorgu başarılı oldu: ${sql}`);
}
