import Image from "next/image";
import { login } from "./actions";

const messages: Record<string, string> = {
  "missing-fields": "E-posta ve şifre zorunludur.",
  "invalid-credentials": "E-posta veya şifre hatalı.",
  "no-organization": "Bu kullanıcıya bağlı aktif bir organizasyon bulunamadı.",
  "organization-inactive": "Organizasyon aktif değil.",
  "commerce-disabled": "ARVO ARC erişimi bu organizasyon için aktif değil.",
  "server-error": "Giriş servisine ulaşılamadı. Sistem yöneticisi yapılandırmayı kontrol etmelidir.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand"><Image src="/arvo-arc-logo.png" alt="ARVO ARC" width={220} height={43} priority sizes="220px" style={{display:"block",width:220,height:"auto",maxWidth:"100%"}}/></div>
        <small>ARVO CULTURE · ADAPTIVE RETAIL CORE</small>
        <h1>Operasyon merkezine hoş geldiniz.</h1>
        <p className="login-lead">ArvoOS hesabınızla güvenli biçimde devam edin.</p>
        {error && <p className="alert error" role="alert"><strong>{messages[error] ?? "Oturum açılamadı."}</strong></p>}
        <form action={login} className="form-stack">
          <label>E-posta<input name="email" type="email" autoComplete="email" required /></label>
          <label>Şifre<input name="password" type="password" autoComplete="current-password" required /></label>
          <button type="submit">Giriş yap <span>→</span></button>
        </form>
      </section>
    </main>
  );
}
