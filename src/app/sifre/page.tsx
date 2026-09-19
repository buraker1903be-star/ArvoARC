import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requestPasswordReset } from "./actions";
import "../login/login.css";

export const metadata: Metadata = { title: "Şifre belirle" };

const errors: Record<string, string> = {
  "invalid-email": "Geçerli bir e-posta adresi yazın.",
  "link-expired": "Bağlantının süresi dolmuş ya da daha önce kullanılmış. Yeni bir bağlantı isteyin.",
};

export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string; neden?: string }> }) {
  const { error, sent, neden } = await searchParams;
  return (
    <main className="login-shell">
      <section className="login-brand">
        <Image src="/arvo-arc-logo.png" alt="ARVO ARC" width={200} height={39} priority />
        <div>
          <span>ADAPTIVE RETAIL CORE</span>
          <h1>Şifrenizi belirleyin.</h1>
          <p>İlk girişinizde ya da şifrenizi unuttuğunuzda e-postanıza bir bağlantı gönderiyoruz.</p>
        </div>
        <small>ARVOCULTURE GROUP TEKNOLOJİ SANAYİ VE TİCARET LTD. ŞTİ.</small>
      </section>
      <section className="login-form-wrap">
        <form action={requestPasswordReset} className="login-card">
          <span>ŞİFRE BELİRLE / YENİLE</span>
          <h2>E-posta adresinizi yazın</h2>
          {sent ? (
            <div className="login-notice" role="status">Bu adrese kayıtlı bir hesap varsa şifre bağlantısı gönderildi. Gelen kutunuzu (ve istenmeyen klasörünü) kontrol edin.</div>
          ) : (
            <p>Hesabınıza bağlı adrese şifre belirleme bağlantısı gelecek.</p>
          )}
          {error ? <div className="login-error" role="alert">{errors[error] ?? "İşlem tamamlanamadı."}{neden ? <><br /><small>Ayrıntı: {neden}</small></> : null}</div> : null}
          <label>E-posta adresi<input name="email" type="email" autoComplete="email" required placeholder="adiniz@kurum.com" /></label>
          <button type="submit">Bağlantı gönder <b>→</b></button>
          <small><Link href="/login">Girişe dön</Link></small>
        </form>
      </section>
    </main>
  );
}
