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
  Dökümde ZATEN OLAN migration'lar tekrar uygulanamaz: create policy ve
  create trigger "if not exists" kabul etmiyor, ikinci uygulama çakışıyor.
  Bu yüzden yalnızca dökümden SONRA eklenenler kuruluyor ve döküm her
  yenilendiğinde buradaki sürüm ileri alınır.

  27.09.2026'da döküm önce bölünmüş kargo (20260926231939), ardından
  gönderi kaynağı/tedarikçi (20260926235322) migration'ını içerecek şekilde
  yenilendi; sürüm her seferinde sonuncunun bir ardına alındı.

  Not: 19.09.2026 dökümünde yetkiler eksikti (fonksiyonlar oluşturulurken
  Supabase'in varsayılanı onları anon'a açıyor ve dökümdeki "revoke …
  from public" bunu geri almıyordu — ArvoARC'taki açığın kökü). Yeni döküm
  fonksiyon yetkilerini olduğu gibi taşıyor, yani o migration'ı yeniden
  uygulamaya gerek kalmadı.
*/
/*
  11.10.2026 dökümü canlının o günkü TAMAMINI taşıyor: 54 migration'ın
  sonuncusu (20261007132449, Garanti sanal pos) dahil. İmleç bu yüzden
  sonuncunun bir ardında.

  Eskiden imleç 20260929090233'teydi, yani döküm sonrası bir avuç
  migration her testte yeniden uygulanıyordu. Sebebi dökümün kendisiydi:
  dışa aktarma betiği, yalnızca sahibinde yetki kalmış bir fonksiyonu
  yetki bölümünden tamamen düşürüyordu — tetikleyici fonksiyonlarının
  "revoke all … from public" satırları dökümde yoktu ve dökümden
  kurulan veritabanı canlıdan DAHA AÇIK kalıyordu (19.09.2026'da
  ArvoARC'ta siparişi "ödendi" yapan fonksiyon anon'a açık kalmıştı;
  yetki testi bu yüzden var). Betik düzeltildi; 11.10 dökümü 88
  fonksiyonun yetki satırını olduğu gibi taşıyor, imleç de ileri
  alındı.

  17.10.2026 anlık görüntüsü günün on migration'ını içeriyor: modül
  okuma politikası, silinen siparişin satış hareketi, medya özeti,
  vitrinde uygunluğun tek kurala bağlanması, kiracı vitrininin
  sayfalaması, tedarikçi tamponunun eşik olarak uygulanması,
  sitemap'in yalnızca indekslenebilir ürünü listelemesi ve koleksiyon
  rafının dört adımı, çok kiracılı varyant sınırı ve vitrin gövdelerinin
  tek yere taşınması (pilot, on beş çift, geri alma, yeniden bağlama)
  ve tedarikçi miktar denetimi. İmleç sonuncunun (20261017144835)
  bir ardında; döküm yenilendiğinde aynı
  şekilde ileri alın.

  İMLEÇ GERİDE KALIRSA NE OLUR: harness, görüntüde ZATEN olan bir
  fonksiyonu eski gövdesiyle yeniden kurmaya çalışır. Dönüş tipi
  daralmışsa "cannot change return type" ile bütün paket düşer
  (20261017133904'ten sonra yaşandı).

  İmleci ileri almak testlerin dişini sökmüyor: kuralı artık
  migration dosyası değil DÖKÜM taşıyor, yani testler canlıda ne
  varsa onu sınıyor. Düşürdüğü tek şey "migration dosyası bu kuralı
  gerçekten kuruyor mu" sorusu; o soru uygulanmadan önce
  yanıtlanıyor (her migration'ı dosya yerinde ve yerinden alınmış
  hâlde koşturarak).
*/
const ILK_UYGULANAN = "20261017213836";

/*
  PGLITE'TA PGCRYPTO YOK.

  Canlıda var (Supabase açık getiriyor) ve döküm onu kullanıyor:
  arc_orders.public_token varsayılanı encode(gen_random_bytes(16),'hex').
  PGlite eklentiyi tanımadığı için dökümün YÜKLENMESİ düşüyordu —
  `alter column ... set default` ifadeyi çözümlerken fonksiyonu
  arıyor, henüz hiçbir satır eklenmeden.

  Çözüm iki adımlı: dökümü yükleyebilmek için geçici bir vekil
  tanımlanıyor, yükleme biter bitmez varsayılan PGlite'ın KENDİ
  çekirdek fonksiyonuna çevrilip vekil siliniyor. Böylece düzenekte
  fazladan bir fonksiyon KALMIYOR — ilk denemede kalmıştı ve
  "anon/authenticated neyi çağırabiliyor" listesini sabitleyen yetki
  testine sızıp onu kırdı.

  Üretilen değer her iki yolda da aynı biçimde: 32 haneli onaltılık.
  Testlerde aranan şey zaten biçim; tahmin edilemezlik canlıdaki
  pgcrypto'nun işi.
*/
const PGCRYPTO_VEKILI = `
create or replace function public.gen_random_bytes(n integer)
returns bytea language sql as $vekil$
  select decode(string_agg(lpad(to_hex((random() * 255)::int), 2, '0'), ''), 'hex')
  from generate_series(1, n)
$vekil$;
`;

const PGCRYPTO_VEKILINI_KALDIR = `
alter table public.arc_orders
  alter column public_token set default replace(gen_random_uuid()::text, '-', '');
drop function if exists public.gen_random_bytes(integer);
`;

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

  await db.exec(PGCRYPTO_VEKILI);
  await uygula(path.join(KOK, "schema", "canli-sema.sql"));
  await db.exec(SUPABASE_TABLO_VARSAYILANI);
  await db.exec(SUPABASE_YENI_NESNE_VARSAYILANI);

  const sonrakiler = fs.readdirSync(path.join(KOK, "migrations"))
    .filter((f) => f.endsWith(".sql") && f.slice(0, 14) >= ILK_UYGULANAN)
    .sort();
  for (const dosya of sonrakiler) await uygula(path.join(KOK, "migrations", dosya));
  /* Vekil EN SONDA kaldırılıyor: döküm gibi migration'lar da onu çağırıyor. */
  await db.exec(PGCRYPTO_VEKILINI_KALDIR);
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
