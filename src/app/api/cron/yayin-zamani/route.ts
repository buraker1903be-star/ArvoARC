import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/*
  ZAMANLANMIŞ YAYIN — zamanı gelen ürünleri yayına alıp çıkarır.

  Kampanya saatinde birinin panele girip ürünü "Aktif" yapması
  gerekiyordu; gece yarısı başlayan indirimde bu ya birinin gece
  beklemesi ya kampanyanın saatinde başlamaması demekti.

  BEŞ DAKİKADA BİR. Öteki görevler on ve otuz dakikada bir koşuyor ama
  kampanya başlangıcında on dakika gecikme müşterinin göreceği bir
  kusur: "10:00'da başlıyor" diyen bir duyurunun 10:09'da açılması.

  İKİ GÜNCELLEME, PARTİ YOK. İş tek bir SQL güncellemesi (durumu değiş,
  planı temizle) ve planı olan satır sayısı küçük — kısmi indeks zaten
  yalnızca onları okuyor. Satır satır dönmek gereksiz tur demekti.

  PLAN UYGULANINCA TEMİZLENİYOR. Kalsaydı kullanıcı ürünü elle taslağa
  çektiğinde görev onu bir sonraki turda yeniden yayına alırdı.

  Yetki: Vercel Cron "Authorization: Bearer <CRON_SECRET>" gönderir.
  CRON_SECRET tanımlı değilse uç herkese 401 döner (kapalı başarısızlık).
  Servis anahtarı RLS'i atladığı için yetkiyi bu uç kendisi doğruluyor.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function sameSecret(provided: string | null, secret: string | undefined) {
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const bearer = (request: Request) => request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;

export async function GET(request: Request) {
  if (!sameSecret(bearer(request), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const simdi = new Date().toISOString();

  /*
    Durum koşulu ŞART. publish_at'i olan ama arşivlenmiş bir ürünü
    yayına almak, kataloğdan bilerek çekilmiş bir ürünü mağazaya geri
    koymak olurdu. Panel bu çelişkiyi kaydederken de temizliyor
    (lib/yayin-plani.ts); bu ikinci kat, doğrudan SQL'den yazılan bir
    plan için.
  */
  const { data: yayinaGirenler, error: yayinHatasi } = await supabase
    .from("arc_products")
    .update({ status: "active", publish_at: null, updated_at: simdi })
    .eq("status", "draft")
    .lte("publish_at", simdi)
    .select("id,organization_id,name");
  if (yayinHatasi) {
    console.error("[yayin] yayına alma düştü", yayinHatasi.message);
    return NextResponse.json({ error: yayinHatasi.message }, { status: 500 });
  }

  /*
    İkinci güncelleme birincinin ARDINDAN: aynı turda hem başlayıp hem
    biten bir ürün (geçmişte kalmış kısa bir kampanya) önce yayına
    alınıp sonra çıkarılıyor, yani doğru yerde duruyor. Sıra ters
    olsaydı ürün yayında kalırdı.
  */
  const { data: cikanlar, error: cikisHatasi } = await supabase
    .from("arc_products")
    .update({ status: "draft", unpublish_at: null, updated_at: simdi })
    .eq("status", "active")
    .lte("unpublish_at", simdi)
    .select("id,organization_id,name");
  if (cikisHatasi) {
    console.error("[yayin] yayından çıkarma düştü", cikisHatasi.message);
    return NextResponse.json({ error: cikisHatasi.message }, { status: 500 });
  }

  const girdi = yayinaGirenler ?? [];
  const cikti = cikanlar ?? [];
  /* Adlar günlüğe yazılıyor: "ürün neden yayına girdi" sorusunun tek izi. */
  if (girdi.length) console.log("[yayin] yayına alındı:", girdi.map((urun) => urun.name).join(", "));
  if (cikti.length) console.log("[yayin] yayından çıkarıldı:", cikti.map((urun) => urun.name).join(", "));

  return NextResponse.json({ yayinaGiren: girdi.length, yayindanCikan: cikti.length });
}
