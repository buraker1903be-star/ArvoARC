import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/*
  Şifre bağlantısının dönüş adresi. İki biçimi de kabul eder:
   - ?code=… (PKCE; bağlantı aynı tarayıcıdan istendiyse)
   - ?token_hash=…&type=recovery (e-posta şablonu token_hash ile
     yazıldıysa; bağlantı başka cihazda açılsa da çalışır)
  Başarılıysa oturum açılır ve yeni şifre sayfasına gidilir.
*/
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && (type === "recovery" || type === "invite")) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  const target = url.clone();
  target.search = "";
  target.pathname = ok ? "/sifre/yeni" : "/sifre";
  if (!ok) target.searchParams.set("error", "link-expired");
  return NextResponse.redirect(target);
}
