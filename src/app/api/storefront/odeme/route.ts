import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { paytrConfig } from "@/lib/paytr/config";
import { createServiceClient } from "@/lib/paytr/service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vitrinden gelen ödeme isteği.
 *
 * Akış:
 *   1. Sipariş veritabanında oluşturulur — tutarı sunucu hesaplar.
 *   2. PayTR'dan o tutar için token istenir.
 *   3. Token vitrine döner, iFrame açılır.
 *
 * İstemciden gelen hiçbir tutar kullanılmaz. `create_..._order`
 * fonksiyonu gerçek toplamı döndürür ve PayTR'a giden tutar odur.
 */

const ALLOWED_ORIGINS = [
  process.env.STOREFRONT_URL ?? "https://arvoculture.com",
  "https://www.arvoculture.com",
];

function corsHeaders(origin: string | null) {
  const allowed =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

type Item = { sku: string; quantity: number; name?: string };

export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const address = body.address ?? {};
  const couponCode = body.couponCode ? String(body.couponCode).trim() : null;
  const items = Array.isArray(body.items) ? (body.items as Item[]) : [];

  if (!email || !name || items.length === 0) {
    return NextResponse.json({ error: "invalid" }, { status: 422, headers });
  }

  const supabase = createServiceClient();

  // --- 1. Sipariş oluştur (tutar sunucuda hesaplanır) --------
  const { data, error } = await supabase.rpc(
    "create_arvoculture_storefront_order",
    {
      p_email: email,
      p_name: name,
      p_phone: phone,
      p_address: address,
      p_items: items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
      })),
      p_coupon_code: couponCode,
    },
  );

  if (error || !data?.[0]) {
    console.error("Sipariş oluşturulamadı:", error);
    return NextResponse.json(
      { error: "order_failed", message: error?.message },
      { status: 400, headers },
    );
  }

  const order = data[0] as {
    order_id: string;
    order_number: string;
    total: number;
  };

  // --- 2. PayTR token iste -----------------------------------
  const config = paytrConfig();

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";

  // PayTR sepet formatı: [[ad, birim fiyat, adet], ...]
  const basket = Buffer.from(
    JSON.stringify(
      items.map((item) => [item.name ?? item.sku, "0.00", item.quantity]),
    ),
  ).toString("base64");

  const params = {
    merchant_id: config.merchantId,
    user_ip: ip,
    merchant_oid: order.order_number.replace(/[^A-Za-z0-9]/g, ""),
    email,
    payment_amount: String(order.total), // kuruş
    user_basket: basket,
    no_installment: "0",
    max_installment: "0",
    currency: "TL",
    test_mode: config.testMode,
  };

  // İmza: PayTR'ın beklediği alan sırası birebir korunmalıdır.
  const hashInput =
    params.merchant_id +
    params.user_ip +
    params.merchant_oid +
    params.email +
    params.payment_amount +
    params.user_basket +
    params.no_installment +
    params.max_installment +
    params.currency +
    params.test_mode +
    config.merchantSalt;

  const token = crypto
    .createHmac("sha256", config.merchantKey)
    .update(hashInput)
    .digest("base64");

  const form = new URLSearchParams({
    ...params,
    paytr_token: token,
    debug_on: config.testMode,
    timeout_limit: "30",
    merchant_ok_url: `${config.storeUrl}/siparis/tamam?no=${order.order_number}`,
    merchant_fail_url: `${config.storeUrl}/siparis/hata?no=${order.order_number}`,
    user_name: name,
    user_address: String((address as Record<string, unknown>).line ?? "-"),
    user_phone: phone || "-",
  });

  const response = await fetch("https://www.paytr.com/odeme/api/get-token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });

  const result = (await response.json()) as {
    status: string;
    token?: string;
    reason?: string;
  };

  if (result.status !== "success" || !result.token) {
    console.error("PayTR token alınamadı:", result.reason);
    return NextResponse.json(
      { error: "paytr_failed", message: result.reason },
      { status: 502, headers },
    );
  }

  return NextResponse.json(
    {
      token: result.token,
      orderNumber: order.order_number,
      total: order.total,
      iframeUrl: `https://www.paytr.com/odeme/guvenli/${result.token}`,
    },
    { headers },
  );
}
