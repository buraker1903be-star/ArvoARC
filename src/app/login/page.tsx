import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { login } from "./actions";
import "./login.css";

export const metadata: Metadata = {
  title: "Giriş",
  description: "ArvoARC mağaza yönetim paneli girişi.",
};

const messages: Record<string, string> = {
  "missing-fields": "E-posta ve şifre zorunludur.",
  "invalid-credentials": "E-posta veya şifre hatalı.",
  "no-organization": "Bu kullanıcıya bağlı aktif bir organizasyon bulunamadı.",
  "organization-inactive": "Organizasyon aktif değil.",
  "commerce-disabled": "ArvoARC erişimi bu organizasyon için aktif değil.",
  "license-inactive": "ArvoARC aboneliğiniz sona ermiş ya da askıya alınmış. Verileriniz duruyor; abonelik yenilenince kaldığınız yerden devam edersiniz.",
  "server-error": "Giriş servisine şu an ulaşılamıyor. Şifreniz doğru olabilir; birkaç dakika sonra tekrar deneyin.",
  "too-many": "Çok fazla deneme yapıldı. Birkaç dakika bekleyip tekrar deneyin.",
};

/*
  Giriş ekranı ArvoOS'unkiyle aynı (16.10.2026): tek sayfa, ortada kart,
  üstte logo, yasal unvan altta bir kez (login.css). Marka bölümündeki
  slogan stilde gizli; yapı ArvoOS sayfasıyla aynı kalsın diye duruyor.
*/
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-brand">
        <Image src="/arvo-arc-logo.png" alt="ArvoARC" width={200} height={39} priority />
        <div>
          <span>ADAPTIVE RETAIL CORE</span>
          <h1>Mağazanızın tüm operasyonu, tek ve güvenli panelde.</h1>
          <p>Sipariş, ürün, stok, müşteri ve kampanyalarınızı ArvoOS altyapısıyla tek yerden yönetin.</p>
        </div>
        <small>ARVOCULTURE GROUP TEKNOLOJİ SANAYİ VE TİCARET LTD. ŞTİ.</small>
      </section>

      <section className="login-form-wrap">
        <form action={login} className="login-card">
          <span>GÜVENLİ PANEL GİRİŞİ</span>
          <h2>Mağaza paneline hoş geldiniz</h2>
          <p>ArvoOS hesabınızla güvenli biçimde devam edin.</p>
          {error ? <div className="login-error" role="alert">{messages[error] ?? "Oturum açılamadı."}</div> : null}
          <label>E-posta adresi<input name="email" type="email" autoComplete="email" required placeholder="adiniz@kurum.com" /></label>
          <label>Parola<input name="password" type="password" autoComplete="current-password" required placeholder="••••••••" /></label>
          <button type="submit">Giriş Yap <b>→</b></button>
          <Link href="/sifre">Şifremi unuttum / ilk şifremi belirleyeceğim</Link>
          <a href="mailto:info@arvo-os.com?subject=ArvoARC%20erişim%20desteği">Erişim desteği alın</a>
          <small>Hesaplar ArvoOS kurum yöneticisi tarafından oluşturulur. Açık üyelik bulunmaz.</small>
        </form>
      </section>
    </main>
  );
}
