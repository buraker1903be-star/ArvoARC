import Link from "next/link";
import { basHarfler } from "./os-apps";
import { OsSimge } from "./os-icons";

/*
  Kullanıcı menüsü. Kaynak: ArvoOS/app/panel/os/os-user-menu.tsx
  (16.10.2026). Eskiden ArvoARC'ın sağ üst çipi kurumun baş harfini ve
  rolü gösteriyordu, çıkış düğmesi kenar menüsünün dibindeydi; kim
  olarak oturum açıldığı hiçbir yerde yazmıyordu.

  ArvoOS'tan farkı: çalışma alanı listesi yok (ArvoARC kişiyi tek
  mağazaya bağlıyor, lib/tenant.ts) ve ekip görünürlüğü yok (varlık
  tablosu yok). JavaScript'siz açılır (details): sunucuda çizilir.
*/
export function OsKullaniciMenusu({
  ad,
  rol,
  kurum,
  paket,
  cikis,
}: {
  ad: string;
  rol: string;
  kurum: string;
  paket: string;
  cikis: () => Promise<void>;
}) {
  return (
    <details className="os-user">
      <summary aria-label={`Hesap: ${ad}`}>
        <span className="os-avatar">{basHarfler(ad)}</span>
      </summary>
      <div className="os-user-menu">
        <div className="os-user-head">
          <span className="os-avatar os-avatar--lg">{basHarfler(ad)}</span>
          <div>
            <b>{ad}</b>
            <small>{rol} · {kurum}</small>
          </div>
        </div>
        <nav className="os-user-links" aria-label="Hesap">
          <Link prefetch={false} href="/ayarlar"><OsSimge ad="settings" boyut={16} />Mağaza ayarları</Link>
          <a href="/magaza" target="_blank" rel="noreferrer"><OsSimge ad="magaza" boyut={16} />Mağazayı görüntüle</a>
        </nav>
        <form action={cikis} className="os-user-logout">
          <button type="submit"><OsSimge ad="logout" boyut={16} />Çıkış yap</button>
        </form>
        {paket ? <p className="os-user-foot">{paket} paket</p> : null}
      </div>
    </details>
  );
}
