import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { BILDIRIM_CEREZI } from "@/lib/panel-bildirim-cerez";

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
  /* Adres önce tamamlanıyor: NextResponse.redirect çağrıldığı andaki
     adresi alıyor, sonradan eklenen parametreyi görmüyor. */
  if (neden) {
    console.error("ARC_PASSWORD_LINK_ERROR", neden);
    target.searchParams.set("error", "link-expired");
    /*
      AYRINTI ÇEREZDE, ADRESTE DEĞİL. Önceden ?neden=… olarak taşınıyordu
      ve sayfa onu olduğu gibi basıyordu; üstelik değerin kaynağı gelen
      adresin kendi parametresiydi (error_description). Yani herkes
      şifre sıfırlama ekranına istediği metni yazdırabiliyordu —
      "Hesabınız askıya alındı, şu numarayı arayın" gibi. Bu ekran
      kimlik avına en açık yer olduğu için ayrıntı artık adresten
      okunmuyor.
    */
    return NextResponse.redirect(target, {
      headers: {
        "set-cookie": `${BILDIRIM_CEREZI}=hata:${encodeURIComponent(neden.slice(0, 80))}; Path=/; Max-Age=60; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
      },
    });
  }
  return NextResponse.redirect(target);
}
