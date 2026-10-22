import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { magazaAdresi } from "@/lib/magaza-adresi";
import { trToday } from "@/lib/tr-time";
import { arvoosBildirimi } from "@/lib/arvoos-bildirim";
import { bildirimMetni, tumBulgular, type MagazaOlcumu } from "@/lib/oz-denetim";

/*
  GÜNLÜK ÖZ DENETİM.

  NEDEN VAR: bu depoda bulunan kusurların çoğu SESSİZDİ. Site haritası
  bir saatten uzun süre eski listeyi verdi, koleksiyon rafları boş
  kaldı, bütün ürün sayfaları 500 verdi, bildirim hiç gitmedi —
  hiçbiri hata üretmedi, hepsi birinin gözüne çarpana kadar sürdü.
  Her sabah sistem kendini sınıyor ve sapmayı kurum sahibine
  bildiriyor.

  ÖLÇÜM BURADA, KARAR lib/oz-denetim.ts'te. Eşikleri değiştirmek ağ
  isteği gerektirmesin ve karar test edilebilsin diye.

  MÜŞTERİNİN GÖZÜNDEN ÖLÇÜLÜYOR: vitrin gerçekten HTTP ile
  isteniyor, site haritası gerçekten indiriliyor, oradaki bir ürün
  adresi gerçekten açılıyor. Veritabanına sorup "her şey yerinde"
  demek, 17.10.2026'da ürün sayfaları 500 verirken veritabanının
  gayet sağlam olduğu gerçeğini kaçırırdı.

  Yetki: Vercel Cron "Authorization: Bearer <CRON_SECRET>" gönderir.
  CRON_SECRET tanımlı değilse uç herkese 401 döner (kapalı
  başarısızlık). Servis anahtarı RLS'i atladığı için yetkiyi bu uç
  kendisi doğruluyor.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function yetkili(istek: Request) {
  const sir = process.env.CRON_SECRET?.trim();
  const baslik = istek.headers.get("authorization") ?? "";
  if (!sir || !baslik.startsWith("Bearer ")) return false;
  const beklenen = Buffer.from(sir);
  const gelen = Buffer.from(baslik.slice("Bearer ".length).trim());
  return beklenen.length === gelen.length && timingSafeEqual(beklenen, gelen);
}

/* Ölçüm ağ isteği; yanıt vermeyen adres bütün denetimi bekletmesin. */
async function durumKodu(adres: string): Promise<number | null> {
  try {
    const yanit = await fetch(adres, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(15_000) });
    return yanit.status;
  } catch {
    return null;
  }
}

/*
  Site haritasından ürün adresleri. Sayı ve ÖRNEK bir adres birlikte
  alınıyor: sayının dolu olması sayfaların açıldığını göstermiyor.
*/
async function siteHaritasi(taban: string): Promise<{ sayi: number | null; ornek: string | null }> {
  try {
    const yanit = await fetch(`${taban}/sitemap.xml`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!yanit.ok) return { sayi: null, ornek: null };
    const metin = await yanit.text();
    const adresler = [...metin.matchAll(/<loc>([^<]*\/urun\/[^<]*)<\/loc>/g)].map((e) => e[1]);
    /* Örnek RASTGELE: hep ilk adres seçilseydi, yalnızca o ürünün
       sayfası sağlamken ötekiler bozuk olduğunda denetim susardı. */
    const ornek = adresler.length ? adresler[Math.floor(Math.random() * adresler.length)] : null;
    return { sayi: adresler.length, ornek };
  } catch {
    return { sayi: null, ornek: null };
  }
}

export async function GET(istek: Request) {
  if (!yetkili(istek)) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "sunucu anahtarı yok" }, { status: 503 });
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const [{ data: magazalar, error: magazaHatasi }, { data: tedarikciler }] = await Promise.all([
    supabase
      .from("arc_store_settings")
      .select("organization_id,store_name,custom_domain,domain_verified_at,platform_subdomain,storefront_url,paytr_enabled,garanti_enabled,bank_transfer_enabled,international_enabled,usd_rate_updated_at"),
    supabase.from("arc_suppliers").select("organization_id,active,last_synced_at"),
  ]);

  if (magazaHatasi) {
    console.error("[öz-denetim] mağazalar okunamadı:", magazaHatasi.message);
    return NextResponse.json({ error: magazaHatasi.message }, { status: 500 });
  }

  /* Mağaza başına EN TAZE tedarikçi taraması: biri akarken öteki
     durmuşsa bu denetim onu yakalamaz, ama "hiçbiri akmıyor"u
     yakalar — asıl müşteri etkisi orada. */
  const sonTarama = new Map<string, string | null>();
  const tedarikcisiVar = new Set<string>();
  for (const t of (tedarikciler ?? []) as Array<{ organization_id: string; active: boolean | null; last_synced_at: string | null }>) {
    if (!t.active) continue;
    tedarikcisiVar.add(t.organization_id);
    const mevcut = sonTarama.get(t.organization_id) ?? null;
    if (!mevcut || (t.last_synced_at && t.last_synced_at > mevcut)) sonTarama.set(t.organization_id, t.last_synced_at);
  }

  const olcumler: MagazaOlcumu[] = [];
  for (const magaza of magazalar ?? []) {
    const taban = magazaAdresi(magaza);
    const vitrinAcik = Boolean(taban);

    let vitrinDurumu: number | null = null;
    let harita: { sayi: number | null; ornek: string | null } = { sayi: null, ornek: null };
    let ornekUrunDurumu: number | null = null;
    if (taban) {
      vitrinDurumu = await durumKodu(taban);
      harita = await siteHaritasi(taban);
      if (harita.ornek) ornekUrunDurumu = await durumKodu(harita.ornek);
    }

    olcumler.push({
      magazaId: magaza.organization_id as string,
      magazaAdi: (magaza.store_name as string) || "Mağaza",
      vitrinAcik,
      /* Yurtdışı satışı kapalıysa kur hiç kullanılmıyor; bayatlığı
         diye bir şey de yok (lib/oz-denetim). */
      yurtdisiAcik: magaza.international_enabled === true,
      kurDamgasi: (magaza.usd_rate_updated_at as string | null) ?? null,
      odemeYontemiVar: Boolean(magaza.paytr_enabled || magaza.garanti_enabled || magaza.bank_transfer_enabled),
      tedarikciVar: tedarikcisiVar.has(magaza.organization_id as string),
      sonTedarikciTaramasi: sonTarama.get(magaza.organization_id as string) ?? null,
      vitrinDurumu,
      siteHaritasiUrun: harita.sayi,
      ornekUrunDurumu,
    });
  }

  const bulgular = tumBulgular(olcumler, new Date());

  /*
    MAĞAZA BAŞINA TEK BİLDİRİM, GÜNDE BİR KEZ. Tekrar anahtarına
    Türkiye günü giriyor: iş iki kez koşarsa (elle tetikleme,
    zamanlayıcının yeniden denemesi) aynı sabah ikinci bildirim
    düşmüyor, ertesi gün sorun sürüyorsa yeniden hatırlatıyor.
  */
  const gun = trToday();
  const magazaBasina = new Map<string, typeof bulgular>();
  for (const bulgu of bulgular) {
    const liste = magazaBasina.get(bulgu.magazaId) ?? [];
    liste.push(bulgu);
    magazaBasina.set(bulgu.magazaId, liste);
  }

  let bildirilen = 0;
  for (const [magazaId, liste] of magazaBasina) {
    const mesaj = bildirimMetni(liste);
    if (!mesaj) continue;
    const sonuc = await arvoosBildirimi({
      organizationId: magazaId,
      kategori: "arc_oz_denetim",
      baslik: `Günlük denetim · ${mesaj.baslik}`,
      metin: mesaj.metin,
      tekrarAnahtari: `oz-denetim-${magazaId}-${gun}`,
      ekBilgi: { gun, kodlar: liste.map((b) => b.kod) },
    });
    if (sonuc === "yazildi") bildirilen += 1;
  }

  /*
    Bulgu VARKEN de 200 dönülüyor: bulgu, işin başarısızlığı değil
    SONUCU. 500 dönmek Vercel'in zamanlayıcı geçmişinde işi "bozuk"
    gösterir ve gerçekten bozulduğu gün fark edilmez.
  */
  if (bulgular.length) console.warn("[öz-denetim] bulgular", bulgular.map((b) => `${b.magaza}: ${b.kod}`));
  return NextResponse.json(
    { magaza: olcumler.length, bulgu: bulgular.length, bildirilen, kodlar: bulgular.map((b) => b.kod) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
