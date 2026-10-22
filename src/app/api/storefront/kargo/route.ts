import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/paytr/service-client";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { resolveStore, storefrontCorsHeaders } from "@/lib/storefront-origin";

/*
  YURTDIŞI KARGO FİYATI — vitrinin ödeme adımı soruyor.

  Vitrin bu ücreti TypeScript'te kendisi hesaplıyordu ve bu, SQL'deki
  hesabın ikiziydi. Ağırlık kademesi eklenince ikizin bedeli görünür
  oldu: vitrin sepetteki ürünlerin AĞIRLIĞINI bilmiyor — ürün kartı ve
  sepet kalemi ağırlık taşımıyor — yani taban ücreti gösterecek,
  ArvoARC kademeli ücreti tahsil edecekti. Müşteri 22 $ görüp 45 $
  ödeyecekti; ekranla tahsilatın ayrışması bu depodaki en pahalı kusur
  (17 Eylül 2026).

  Hesap artık tek yerde (`arc_kargo_senti`) ve sipariş fonksiyonu da
  onu çağırıyor. Bu uç yalnızca soruyu iletiyor.

  NEDEN UÇ, DOĞRUDAN RPC DEĞİL: işlev yalnızca `service_role`'a açık ve
  vitrinin elinde yalnızca anon anahtarı var. Anon'a açmak, sepet
  içeriğiyle serbestçe çağrılabilen bir fiyat sorgusu demekti —
  kupon ve sipariş fonksiyonlarıyla aynı gerekçe. Vitrin siparişi de
  bu yoldan geçiriyor (api/storefront/odeme).

  SEPET İÇERİĞİNE GÜVENİLMİYOR: gelen yalnızca SKU ve adet; fiyatı,
  ağırlığı ve tarifeyi veritabanı söylüyor.
*/

/* Fiyat sorgusu ucuz ama sepet içeriğiyle serbestçe çağrılabiliyor:
   IP başına dakikada 60 — ülke değiştirdikçe sorulan bir uç. */
const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cors = (origin: string | null, allow: boolean) => ({
  ...storefrontCorsHeaders(origin, allow),
  Vary: "Origin",
});

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  const organizationId = await resolveStore(createServiceClient(), origin);
  return new Response(null, { status: 204, headers: cors(origin, Boolean(organizationId)) });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const supabase = createServiceClient();
  const organizationId = await resolveStore(supabase, origin);
  const headers = cors(origin, Boolean(organizationId));

  if (!organizationId) {
    return NextResponse.json(
      { engel: "bolge", mesaj: "Bu adresten kargo sorgulanamıyor." },
      { status: 403, headers },
    );
  }

  const limited = limiter(clientIp(request));
  if (!limited.ok) {
    return NextResponse.json(
      { engel: "kur", mesaj: "Çok fazla sorgu yapıldı. Birkaç saniye sonra tekrar deneyin." },
      { status: 429, headers: { ...headers, "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  let body: { country?: string; items?: Array<{ sku?: string; quantity?: number }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ engel: "bolge", mesaj: "Geçersiz istek." }, { status: 400, headers });
  }

  /* Kalem sayısı sınırlı: sipariş fonksiyonundaki sınırla aynı (50). */
  const items = (body.items ?? [])
    .filter((item) => typeof item?.sku === "string" && Number(item.quantity) > 0)
    .slice(0, 50)
    .map((item) => ({ sku: item.sku, quantity: Math.min(20, Math.max(1, Number(item.quantity))) }));

  const { data, error } = await supabase
    .rpc("arc_vitrin_kargo_fiyati", {
      p_organization_id: organizationId,
      p_country: String(body.country ?? "TR"),
      p_items: items,
    })
    .maybeSingle();

  if (error) {
    /*
      HATA YUTULMUYOR. Okunamayan bir tarife "kargo yok" demek değil;
      vitrin engeli gösterip siparişi durduruyor ve sebebi günlüğe
      düşüyor — sessizce sıfır kargo göstermek, o siparişin maliyetini
      üstlenmek olurdu.
    */
    console.error("[kargo] tarife okunamadı", error.message);
    return NextResponse.json(
      { engel: "kur", mesaj: "Kargo ücreti şu anda hesaplanamıyor." },
      { status: 503, headers },
    );
  }

  const satir = (data ?? {}) as {
    fee_cents: number | null;
    fee_try: number | null;
    weight_grams: number | null;
    goods_try: number | null;
    engel: string | null;
  };

  return NextResponse.json(
    {
      /* Tutarlar vitrinin birimlerinde: sent ve KURUŞ. */
      sent: satir.fee_cents === null ? null : Number(satir.fee_cents),
      kurus: satir.fee_try === null ? null : Number(satir.fee_try),
      agirlikGram: satir.weight_grams === null ? null : Number(satir.weight_grams),
      malKurus: satir.goods_try === null ? null : Number(satir.goods_try),
      engel: satir.engel,
    },
    { headers },
  );
}
