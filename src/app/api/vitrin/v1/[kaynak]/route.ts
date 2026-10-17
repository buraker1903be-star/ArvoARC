import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/paytr/service-client";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { normalizeHost, resolveStore, storefrontCorsHeaders } from "@/lib/storefront-origin";
import { KAYNAKLAR, sayfaSiniri, type Kaynak } from "@/lib/vitrin-api";

/*
  VİTRİN VERİ API'Sİ — müşterinin KENDİ sitesi için.

  NEDEN VAR: mağazaların bir kısmı vitrini bizden almıyor, sitesini
  kendi yapıyor ve panelden yalnızca ürünlerini ve siparişlerini
  yönetiyor. O sitenin katalogu bir yerden okuması gerekiyor.

  Veritabanı fonksiyonlarını (arc_storefront_*) doğrudan çağırmak da
  teknik olarak mümkündü ama o yol bir ÜRÜN değil: sürümü yok,
  belgesi yok, alan adları değişince kıyamet kopar ve müşterinin
  sitesine bizim Supabase anahtarımızı gömmek gerekir. Burası ince
  bir kabuk — fonksiyonları sarıyor, adları ve biçimi sabitliyor.

  MAĞAZA ORIGIN'DEN ÇÖZÜLÜYOR, tıpkı ödeme ve kupon uçlarında
  olduğu gibi (lib/storefront-origin): alan adı panele kayıtlı olmak
  zorunda. Tarayıcıdan gelmeyen çağrılar (müşterinin sunucusu)
  Origin göndermiyor; onlar için `?magaza=<alan-adi>` kabul
  ediliyor. Okunanlar zaten herkese açık katalog verisi — burada
  korunan şey gizlilik değil, YANLIŞ MAĞAZANIN verisini vermemek.

  YAZMA YOK. Sipariş ve kupon kendi uçlarında kalıyor; onlar para
  ve stok kararı veriyor, ayrı yüzeyler olmaları doğru.
*/

/* Katalog okuması ucuz ama bedava değil: IP başına dakikada 120. */
const limiter = createRateLimiter({ limit: 120, windowMs: 60_000 });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cors = (origin: string | null, allow: boolean) => ({
  ...storefrontCorsHeaders(origin, allow),
  /* Okuma ucu: tarayıcı GET atıyor. */
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  Vary: "Origin",
});

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  const magaza = await resolveStore(createServiceClient(), origin);
  return new NextResponse(null, { status: 204, headers: cors(origin, Boolean(magaza)) });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kaynak: string }> },
) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const supabase = createServiceClient();

  /*
    Mağaza önce Origin'den, yoksa açık parametreden. Sunucudan
    sunucuya çağrıda tarayıcı yok, Origin de yok; o isteğin
    reddedilmesi API'yi yalnızca tarayıcıya hapsederdi.
  */
  const istenenKonak = url.searchParams.get("magaza");
  const konak = origin ?? (istenenKonak ? `https://${normalizeHost(istenenKonak)}` : null);
  const magazaId = await resolveStore(supabase, konak);
  const basliklar = cors(origin, Boolean(magazaId && origin));

  if (!magazaId) {
    /*
      Tanınmayan alan adı: hangi mağazanın verisini vereceğimizi
      bilmiyoruz. Varsayılan bir mağazaya düşmek, yanlış kataloğu
      doğru gibi sunmak olurdu.
    */
    return NextResponse.json(
      { hata: "Mağaza tanınmadı. Alan adını ArvoARC panelinden kaydedin ya da ?magaza=<alan-adi> gönderin." },
      { status: 404, headers: basliklar },
    );
  }

  const kaynak = (await params).kaynak as Kaynak;
  const tanim = KAYNAKLAR[kaynak];
  if (!tanim) {
    return NextResponse.json(
      { hata: `Bilinmeyen kaynak: ${kaynak}`, kaynaklar: Object.keys(KAYNAKLAR) },
      { status: 404, headers: basliklar },
    );
  }

  const sinir = limiter(clientIp(request));
  if (!sinir.ok) {
    return NextResponse.json(
      { hata: "Çok fazla istek. Biraz sonra tekrar deneyin." },
      { status: 429, headers: { ...basliklar, "Retry-After": String(sinir.retryAfterSeconds) } },
    );
  }

  /* Konak fonksiyona ham gidiyor; arc_storefront_org şemayı ve
     www'yi kendisi sadeleştiriyor. */
  const parametreler = tanim.parametreler(url.searchParams, konak ?? "");

  const { data, error } = await supabase.rpc(tanim.fonksiyon, parametreler);
  if (error) {
    console.error(`[vitrin-api] ${kaynak} okunamadı:`, error.message);
    return NextResponse.json({ hata: "Veri okunamadı." }, { status: 502, headers: basliklar });
  }

  return NextResponse.json(
    { kaynak, sayfa: sayfaSiniri(url.searchParams), veri: data ?? [] },
    {
      headers: {
        ...basliklar,
        /*
          Katalog verisi uçta 60 saniye saklanabilir: müşterinin
          sitesi her ziyaretçide bize gelmesin. Fiyat ve stok bu
          süre kadar bayat olabilir — sepet ve ödeme tutarı zaten
          ArvoARC'ta yeniden hesaplanıyor, taahhüt eden rakam
          burada değil.
        */
        "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
