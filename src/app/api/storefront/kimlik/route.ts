import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/paytr/service-client";
import { sendEmail } from "@/lib/email/resend";
import { signupEmail, resetPasswordEmail } from "@/lib/email/auth-emails";

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
const STOREFRONT = process.env.STOREFRONT_URL ?? "https://arvoculture.com";

/*
  Tarayıcı, farklı alan adına giden istekleri sunucu açıkça izin
  vermedikçe engelliyor. Vitrin arvoculture.com'da, bu uç nokta
  arc.arvo-os.com'da; izin başlıkları olmadan istek hiç
  ulaşmıyordu.

  İzin yalnızca vitrine veriliyor; başka bir siteden çağrılamaz.
*/
/*
  Vitrin hem `arvoculture.com` hem `www.arvoculture.com`
  üzerinden açılabiliyor ve tarayıcı bu ikisini farklı köken
  sayıyor. Sabit tek bir adrese izin vermek, www ile gelen
  isteklerin engellenmesine yol açıyordu.
*/
const ALLOWED = new Set([
  STOREFRONT,
  STOREFRONT.replace("https://", "https://www."),
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  return {
    // Yalnızca tanınan köken yansıtılır; bilinmeyen sitelere
    // izin verilmez.
    "Access-Control-Allow-Origin": ALLOWED.has(origin) ? origin : STOREFRONT,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Tarayıcının ön kontrol isteği. */
export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  let body: { islem?: string; email?: string; sifre?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "gecersiz_istek" },
      { status: 400, headers: corsHeaders(request) },
    );
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const islem = body.islem;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
    return NextResponse.json(
      { error: "gecersiz_eposta" },
      { status: 400, headers: corsHeaders(request) },
    );
  }

  const CORS = corsHeaders(request);
  const supabase = createServiceClient();

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
        options: { redirectTo: `${STOREFRONT}/hesap` },
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
        const mail = signupEmail(link);
        await sendEmail({ to: email, ...mail });
      }

      return NextResponse.json({ ok: true }, { headers: CORS });
    }

    if (islem === "sifirla") {
      const { data, error } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${STOREFRONT}/hesap` },
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
        const mail = resetPasswordEmail(link);
        await sendEmail({ to: email, ...mail });
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
