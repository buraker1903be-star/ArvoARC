import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { kurKarari, tcmbUsdKuru } from "@/lib/kur/tcmb";
import { arvoosBildirimi } from "@/lib/arvoos-bildirim";
import { trToday } from "@/lib/tr-time";

/*
  DOLAR KURU — TCMB bülteninden günlük.

  Kur elle güncelleniyordu ve bu sürdürülebilir değil: her gün oynuyor,
  güncellenmeyen kur kataloğu yanlış fiyatlıyor ve yanlışlığı hiçbir
  ekranda görünmüyor.

  YALNIZCA `usd_rate_auto` AÇIK MAĞAZALAR. Kuru elle sabitlemiş bir
  kiracının kararını bu iş ezmiyor.

  SERVİS DÜŞERSE HİÇBİR ŞEY OLMUYOR: son bilinen kur yerinde kalıyor,
  sıfırlanmıyor, tahmin edilmiyor. Bayatlığı panel (kurun yaşı) ve
  günlük öz denetim söylüyor. Bülten hafta sonu ve resmî tatilde
  yayımlanmıyor; TCMB o günler 404 veriyor ve bu bir ARIZA DEĞİL.

  BÜYÜK DEĞİŞİM UYGULANIYOR, haber veriliyor (lib/kur/tcmb):
  reddetmek, lirada yüzde onluk bir günde kataloğu olduğundan ucuza
  satmak olurdu.

  Yetki: Vercel Cron "Authorization: Bearer <CRON_SECRET>" gönderir.
  CRON_SECRET tanımlı değilse uç herkese 401 döner (kapalı
  başarısızlık). Servis anahtarı RLS'i atladığı için yetkiyi bu uç
  kendisi doğruluyor.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TCMB = "https://www.tcmb.gov.tr/kurlar/today.xml";

function sameSecret(provided: string | null, secret: string | undefined) {
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const bearer = (request: Request) =>
  request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;

export async function GET(request: Request) {
  if (!sameSecret(bearer(request), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  /* Otomatik kipte olan mağazalar. Hiç yoksa TCMB'ye hiç gitmiyoruz:
     kimsenin kullanmadığı bir veriyi her gün indirmek gereksiz. */
  const { data: magazalar, error: okumaHatasi } = await supabase
    .from("arc_store_settings")
    .select("organization_id, usd_rate, usd_rate_updated_at")
    .eq("usd_rate_auto", true);

  if (okumaHatasi) {
    console.error("[kur] mağaza ayarları okunamadı", okumaHatasi.message);
    return NextResponse.json({ error: okumaHatasi.message }, { status: 500 });
  }
  if (!magazalar?.length) {
    return NextResponse.json({ magaza: 0, not: "otomatik kip açık mağaza yok" });
  }

  let xml: string;
  try {
    /*
      ÖNBELLEKSİZ: bülten günde bir değişiyor ama Next'in fetch
      önbelleği bir kez indirdiğini günlerce tutabilir ve o zaman iş
      her gün aynı eski kuru yazar — "çalışıyor" görünen, sonucu
      yanlış bir görev.
    */
    const yanit = await fetch(TCMB, { cache: "no-store" });
    if (!yanit.ok) {
      /*
        404 HAFTA SONU VE TATİL: bülten yayımlanmıyor. Bu bir arıza
        değil, o yüzden 500 dönülmüyor — 500 dönmek zamanlayıcı
        geçmişinde işi "bozuk" gösterir ve gerçekten bozulduğu gün
        fark edilmez (öz denetimle aynı gerekçe).
      */
      console.log(`[kur] TCMB bülteni yok (${yanit.status}); kur olduğu gibi kaldı.`);
      return NextResponse.json({ magaza: magazalar.length, guncellenen: 0, bulten: yanit.status });
    }
    xml = await yanit.text();
  } catch (sorun) {
    console.error("[kur] TCMB'ye ulaşılamadı", sorun instanceof Error ? sorun.message : sorun);
    return NextResponse.json({ magaza: magazalar.length, guncellenen: 0, hata: "ulasilamadi" });
  }

  const okunan = tcmbUsdKuru(xml);
  if (!okunan) {
    /*
      AYRIŞTIRMA DÜŞTÜYSE SESSİZ KALINMIYOR. TCMB biçimi değiştirirse
      kur donar ve fiyat sessizce bayatlar; bu satır o günün tek izi.
      500 dönülüyor çünkü bu GERÇEKTEN arıza — tatil değil.
    */
    console.error("[kur] TCMB yanıtında USD kuru bulunamadı; biçim değişmiş olabilir.");
    return NextResponse.json({ error: "usd-kuru-okunamadi" }, { status: 500 });
  }

  const simdi = new Date().toISOString();
  let guncellenen = 0;
  const atlanan: string[] = [];

  for (const magaza of magazalar) {
    const karar = kurKarari(okunan.kur, magaza.usd_rate === null ? null : Number(magaza.usd_rate));
    if (!karar.uygula) {
      atlanan.push(`${magaza.organization_id}:${karar.sebep}`);
      continue;
    }

    const { error } = await supabase
      .from("arc_store_settings")
      .update({
        usd_rate: karar.kur,
        usd_rate_updated_at: simdi,
        usd_rate_source: "tcmb",
      })
      .eq("organization_id", magaza.organization_id);

    if (error) {
      console.error(`[kur] ${magaza.organization_id} yazılamadı`, error.message);
      atlanan.push(`${magaza.organization_id}:yazilamadi`);
      continue;
    }
    guncellenen += 1;

    /*
      BÜYÜK OYNAMADA KURUM SAHİBİNE HABER. Kur uygulandı ama fiyat
      listesi bir günde yüzde on oynadıysa bu insanın bilmesi
      gereken bir şey: kâr payını ya da kampanyayı gözden geçirmek
      isteyebilir.

      Tekrar anahtarında TÜRKİYE GÜNÜ var: iş günde bir koşuyor ama
      elle tetiklenirse aynı gün ikinci bildirim gitmesin.
    */
    if (karar.uyar) {
      await arvoosBildirimi({
        organizationId: magaza.organization_id,
        kategori: "arc-kur",
        baslik: "Dolar kuru belirgin değişti",
        metin:
          `Kur ${karar.kur.toFixed(4)} TL oldu (${karar.degisimYuzde! > 0 ? "+" : ""}` +
          `${karar.degisimYuzde}%). Yurtdışı fiyatları bu kurla hesaplanıyor; ` +
          `kâr payını gözden geçirmek isteyebilirsiniz.`,
        adres: "/ayarlar?bolum=yurtdisi",
        tekrarAnahtari: `arc-kur-${magaza.organization_id}-${trToday()}`,
      });
    }
  }

  console.log(
    `[kur] TCMB ${okunan.tarih ?? "?"} · 1 USD = ${okunan.kur} TL · ` +
      `${guncellenen}/${magazalar.length} mağaza güncellendi` +
      (atlanan.length ? ` · atlanan: ${atlanan.join(", ")}` : ""),
  );

  return NextResponse.json({
    kur: okunan.kur,
    bultenTarihi: okunan.tarih,
    magaza: magazalar.length,
    guncellenen,
    atlanan,
  });
}
