import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/paytr/service-client";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { resolveStore, storefrontCorsHeaders } from "@/lib/storefront-origin";

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
/*
  Kupon isteğin geldiği mağazanın indirimlerinde aranır. Eskiden hangi
  vitrinden gelirse gelsin arvoculture'ın kuponlarına bakılıyordu.
*/
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
      { valid: false, message: "Bu adresten kupon sorgulanamıyor.", discountAmount: 0 },
      { status: 403, headers },
    );
  }

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

  const { data, error } = await supabase.rpc("arc_check_coupon", {
    p_organization_id: organizationId,
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
