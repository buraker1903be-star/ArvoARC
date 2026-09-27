import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/paytr/service-client";
import { lrTaramasiniKaydet } from "@/lib/lr/kaydet";

/*
  LR'IN HERKESE AÇIK FİYATLARININ ZAMANLANMIŞ TARANMASI.

  LR kendi kampanyalarını haber vermiyor; fiyat düştüğünde bizim
  tavanımız da düşüyor ve vitrindeki fiyat eskimiş oluyor. Günde bir
  tarama listeyi taze tutuyor.

  TARAMA FİYAT YAZMIYOR: liste panelde önizlenip onaylanıyor. Otomatik
  yazmak, LR kalıbını değiştirdiği gün bütün kataloğa yanlış fiyat
  yazmak demekti.

  Kapsam: daha önce LR listesi toplanmış mağazalar. Özelliği hiç
  kullanmamış bir mağazanın panelinde birdenbire fiyat listesi
  belirmesin diye; panelden bir kez çalıştırılınca kendiliğinden
  tazelenmeye başlıyor.

  Yetki: Vercel Cron "Authorization: Bearer <CRON_SECRET>" gönderir;
  değişken yoksa uç herkese 401 döner (kapalı başarısızlık).
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
  Bütün katalog tek turda geziliyor: 27.09.2026'da ölçüldü — 82 sayfa,
  23,7 sn, 145 ürün. Sınırlar ölçülenin üstünde ama 60 sn'lik işlev
  süresinin altında; LR sayfa eklerse tarama kesilir, kalan bir
  sonraki güne kalmaz (her tur baştan geziyor).
*/
const SAYFA = 120;
const SURE_MS = 45_000;

function sameSecret(provided: string | null, secret: string | undefined) {
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const verilen = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!sameSecret(verilen, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("arc_price_collections")
    .select("organization_id")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("[lr] mağaza listesi okunamadı", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const magazalar = [...new Set(((data ?? []) as { organization_id: string }[]).map((s) => s.organization_id))];
  if (!magazalar.length) {
    return NextResponse.json({ magaza: 0, satir: 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  const sonuc = await lrTaramasiniKaydet(supabase, magazalar, { enFazlaSayfa: SAYFA, sureMs: SURE_MS });
  if (sonuc.hata) {
    /*
      200 dönmek, tamamen kopmuş bir taramayı Vercel'in geçmişinde
      "sorun yok" gösteriyordu (kargo zamanlayıcısında aynı ders).
    */
    console.error("[lr] tarama başarısız", sonuc.hata);
    return NextResponse.json({ hata: sonuc.hata, gezilen: sonuc.gezilen }, { status: 500 });
  }
  return NextResponse.json(
    { magaza: sonuc.yazilan, satir: sonuc.satir, gezilen: sonuc.gezilen },
    { headers: { "Cache-Control": "no-store" } },
  );
}
