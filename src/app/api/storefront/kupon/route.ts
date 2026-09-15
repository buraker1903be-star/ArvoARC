import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/paytr/service-client";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

/* Kupon kodlarının deneme yanılmayla aranmasına karşı: IP başına 10 dakikada 30 deneme. */
const couponLimiter = createRateLimiter({ limit: 30, windowMs: 10 * 60_000 });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Kupon doğrulama.
 *
 * Sepet kuponu doğrulamadan kaydediyordu: "Kod kaydedildi"
 * diyor ama geçerlilik kontrolü ödeme adımında yapılıyordu.
 * Geçersiz kod sessizce yok sayılıyor, müşteri indirim aldığını
 * sanıp ödeme sayfasında tam tutarı görüyordu.
 */
const STOREFRONT = process.env.STOREFRONT_URL ?? "https://arvoculture.com";

const ALLOWED = new Set([
  STOREFRONT,
  STOREFRONT.replace("https://", "https://www."),
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED.has(origin) ? origin : STOREFRONT,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  const headers = corsHeaders(request);

  const limited = couponLimiter(clientIp(request));
  if (!limited.ok) {
    return NextResponse.json(
      { valid: false, message: "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.", discountAmount: 0 },
      { status: 429, headers: { ...headers, "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  let body: { code?: string; subtotal?: number; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { valid: false, message: "Geçersiz istek." },
      { status: 400, headers },
    );
  }

  const code = (body.code ?? "").trim();
  if (!code) {
    return NextResponse.json(
      { valid: false, message: "Kupon kodu girin." },
      { headers },
    );
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc("check_arvoculture_coupon", {
    p_code: code,
    p_subtotal: Math.round(Number(body.subtotal ?? 0)),
    p_email: body.email ? String(body.email).trim() : null,
  });

  if (error) {
    console.error("Kupon doğrulanamadı:", error.message);
    return NextResponse.json(
      { valid: false, message: "Kod şu anda doğrulanamıyor." },
      { headers },
    );
  }

  const row = Array.isArray(data) ? data[0] : data;

  return NextResponse.json(
    {
      valid: Boolean(row?.valid),
      message: row?.message ?? "Kod geçerli değil.",
      discountAmount: Number(row?.discount_amount ?? 0),
    },
    { headers },
  );
}
