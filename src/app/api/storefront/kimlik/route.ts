import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/paytr/service-client";
import { sendEmail } from "@/lib/email/resend";
import { signupEmail, resetPasswordEmail } from "@/lib/email/auth-emails";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { resolveStore, storefrontCorsHeaders } from "@/lib/storefront-origin";
import { getStoreBrand } from "@/lib/store-brand";

/*
  E-posta bombardımanına karşı: IP başına 15 dakikada 10, aynı
  adrese 15 dakikada 3 istek. Vitrin "too many" içeren hatayı
  "Çok fazla deneme yapıldı" diye gösteriyor.
*/
const ipLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60_000 });
const emailLimiter = createRateLimiter({ limit: 3, windowMs: 15 * 60_000 });

const tooMany = (headers: Record<string, string>, retryAfterSeconds: number) =>
  NextResponse.json(
    { error: "too_many_requests" },
    { status: 429, headers: { ...headers, "Retry-After": String(retryAfterSeconds) } },
  );

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Müşteri kimlik doğrulama e-postaları.
 *
 * Supabase'in kendi gönderimi kullanılmıyor: proje geneli SMTP
 * ayarı ArvoARC panelinden giden personel e-postalarını da
 * etkiliyor ve hepsi aynı kimliği taşıyor.
 *
 * Burada `generateLink` ile bağlantı üretilip e-posta Resend
 * üzerinden ArvoCulture kimliğiyle gönderiliyor. `generateLink`
 * service_role yetkisi istiyor; bu yüzden işlem sunucuda.
 */
/*
  CORS ve mağaza çözümlemesi ortak modülde (lib/storefront-origin.ts): izin
  yalnızca arc_store_settings'te alan adı kayıtlı vitrinlere veriliyor.
  Eskiden yalnızca arvoculture.com sabitti; ikinci mağazanın müşterisi üye
  bile olamıyordu.
*/
const cors = (origin: string | null, allow: boolean) => ({
  ...storefrontCorsHeaders(origin, allow),
  "Access-Control-Max-Age": "86400",
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
  const CORS = cors(origin, Boolean(organizationId));

  if (!organizationId) {
    return NextResponse.json({ error: "taninmayan_magaza" }, { status: 403, headers: CORS });
  }

  const byIp = ipLimiter(clientIp(request));
  if (!byIp.ok) return tooMany(CORS, byIp.retryAfterSeconds);

  let body: { islem?: string; email?: string; sifre?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "gecersiz_istek" },
      { status: 400, headers: CORS },
    );
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const islem = body.islem;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
    return NextResponse.json(
      { error: "gecersiz_eposta" },
      { status: 400, headers: CORS },
    );
  }

  const byEmail = emailLimiter(email);
  if (!byEmail.ok) return tooMany(CORS, byEmail.retryAfterSeconds);

  // Marka ve yönlendirme adresi mağazanın kendi kaydından.
  const brand = await getStoreBrand(supabase, organizationId);

  try {
    if (islem === "kayit") {
      const sifre = body.sifre ?? "";
      if (sifre.length < 8) {
        return NextResponse.json(
          { error: "kisa_sifre" },
          { status: 400, headers: CORS },
        );
      }

      const { data, error } = await supabase.auth.admin.generateLink({
        type: "signup",
        email,
        password: sifre,
        options: { redirectTo: `${brand.siteUrl}/hesap` },
      });

      if (error) {
        // Zaten kayıtlı e-posta: kullanıcıya hesabın varlığını
        // sızdırmadan yanıt veriyoruz.
        if (/already registered|already been registered/i.test(error.message)) {
          return NextResponse.json({ ok: true }, { headers: CORS });
        }
        throw error;
      }

      const link = data.properties?.action_link;
      if (link) {
        const mail = signupEmail(link, brand);
        await sendEmail({ to: email, ...mail, from: brand.from, replyTo: brand.replyTo });
      }

      return NextResponse.json({ ok: true }, { headers: CORS });
    }

    if (islem === "sifirla") {
      const { data, error } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${brand.siteUrl}/hesap` },
      });

      /*
        Kayıtlı olmayan e-posta için de başarılı yanıt dönüyoruz.
        Aksi hâlde bu uç nokta hangi adreslerin kayıtlı olduğunu
        öğrenmek için kullanılabilirdi.
      */
      if (error) {
        console.warn("Şifre sıfırlama bağlantısı üretilemedi:", error.message);
        return NextResponse.json({ ok: true }, { headers: CORS });
      }

      const link = data.properties?.action_link;
      if (link) {
        const mail = resetPasswordEmail(link, brand);
        await sendEmail({ to: email, ...mail, from: brand.from, replyTo: brand.replyTo });
      }

      return NextResponse.json({ ok: true }, { headers: CORS });
    }

    return NextResponse.json(
      { error: "bilinmeyen_islem" },
      { status: 400, headers: CORS },
    );
  } catch (error) {
    console.error("Kimlik e-postası hatası:", error);
    return NextResponse.json(
      { error: "islem_basarisiz" },
      { status: 500, headers: CORS },
    );
  }
}
