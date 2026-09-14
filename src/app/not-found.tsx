import Image from "next/image";
import Link from "next/link";
import "./login/login.css";

/* Panel dışında bulunamayan adres: giriş ekranıyla aynı kabuk. */
export default function NotFound() {
  return (
    <main className="login-shell">
      <section className="login-brand">
        <Image src="/arvo-arc-logo.png" alt="ARVO ARC" width={200} height={39} priority />
        <div>
          <span>ARVO ARC</span>
          <h1>Bu adreste bir sayfa yok.</h1>
          <p>Bağlantı eski ya da hatalı olabilir. Panele dönüp aradığınız kaydı arama ile bulabilirsiniz.</p>
        </div>
        <small>ADAPTIVE RETAIL CORE · ARVOOS ALTYAPISI</small>
      </section>
      <section className="login-form-wrap">
        <div className="login-card">
          <span>404</span>
          <h2>Sayfa bulunamadı</h2>
          <p>İstediğiniz sayfa taşınmış veya kaldırılmış olabilir.</p>
          <Link className="login-action" href="/">Panele dön <b>→</b></Link>
        </div>
      </section>
    </main>
  );
}
