import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/*
  Şifre bağlantısının dönüş adresi. İki biçimi de kabul eder:
   - ?code=… (PKCE; bağlantı aynı tarayıcıdan istendiyse)
   - ?token_hash=…&type=recovery (e-posta şablonu token_hash ile
     yazıldıysa; bağlantı başka cihazda açılsa da çalışır)
  Başarılıysa oturum açılır ve yeni şifre sayfasına gidilir.

  Başarısızlıkta neden de taşınır (?neden=…). İlk canlı denemede sayfa
  yalnızca "süresi dolmuş" diyordu; Supabase'in döndürdüğü asıl neden
  (kod yok, doğrulayıcı çerez yok, bağlantı kullanılmış…) görünmüyordu.
*/
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabaseHatasi = url.searchParams.get("error_code") ?? url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const supabase = await createClient();

  let neden = "";
  if (supabaseHatasi) {
    neden = `supabase:${supabaseHatasi}`;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) neden = `pkce:${error.code ?? error.message}`;
  } else if (tokenHash && (type === "recovery" || type === "invite")) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) neden = `otp:${error.code ?? error.message}`;
  } else {
    neden = "parametre-yok";
  }

  const target = url.clone();
  target.search = "";
  target.pathname = neden ? "/sifre" : "/sifre/yeni";
  if (neden) {
    console.error("ARC_PASSWORD_LINK_ERROR", neden);
    target.searchParams.set("error", "link-expired");
    target.searchParams.set("neden", neden.slice(0, 80));
  }
  return NextResponse.redirect(target);
}
