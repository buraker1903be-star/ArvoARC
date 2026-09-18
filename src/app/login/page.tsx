import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { login } from "./actions";
import "./login.css";

export const metadata: Metadata = {
  title: "Giriş",
  description: "ARVO ARC mağaza yönetim paneli girişi.",
};

const messages: Record<string, string> = {
  "missing-fields": "E-posta ve şifre zorunludur.",
  "invalid-credentials": "E-posta veya şifre hatalı.",
  "no-organization": "Bu kullanıcıya bağlı aktif bir organizasyon bulunamadı.",
  "organization-inactive": "Organizasyon aktif değil.",
  "commerce-disabled": "ARVO ARC erişimi bu organizasyon için aktif değil.",
  "license-inactive": "Arc aboneliğiniz sona ermiş ya da askıya alınmış. Verileriniz duruyor; abonelik yenilenince kaldığınız yerden devam edersiniz.",
  "server-error": "Giriş servisine ulaşılamadı. Sistem yöneticisi yapılandırmayı kontrol etmelidir.",
};

/*
  Giriş ekranı ArvoOS ile aynı dilde: solda gece mavisi marka
  paneli, sağda altın vurgulu form kartı. Panel ve giriş aynı
  ürünün parçası gibi görünsün.
*/
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-brand">
        <Image src="/arvo-arc-logo.png" alt="ARVO ARC" width={200} height={39} priority />
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
          <h2>Operasyon merkezine hoş geldiniz</h2>
          <p>ArvoOS hesabınızla güvenli biçimde devam edin.</p>
          {error ? <div className="login-error" role="alert">{messages[error] ?? "Oturum açılamadı."}</div> : null}
          <label>E-posta adresi<input name="email" type="email" autoComplete="email" required placeholder="adiniz@kurum.com" /></label>
          <label>Parola<input name="password" type="password" autoComplete="current-password" required placeholder="••••••••" /></label>
          <button type="submit">Giriş yap <b>→</b></button>
          <small><Link href="/sifre">Şifremi unuttum / ilk şifremi belirleyeceğim</Link></small>
          <small>Hesaplar ArvoOS kurum yöneticisi tarafından oluşturulur. Açık üyelik bulunmaz.</small>
        </form>
      </section>
    </main>
  );
}
