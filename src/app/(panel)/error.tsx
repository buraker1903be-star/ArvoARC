"use client";

import Link from "next/link";
import { useEffect } from "react";

/*
  Bir sayfa hata verdiğinde Next'in genel "Application error" ekranı
  yerine bu gösterilir; menü ve üst çubuk yerinde kalır. Üretimde
  sunucu hata mesajı güvenlik gereği gizli, asıl mesaj yalnızca
  geliştirmede görünür.
*/
export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const detail = process.env.NODE_ENV !== "production" ? error.message : null;

  return (
    <section className="ac ac-pad panel-error-card" role="alert">
      <small className="panel-kicker">İŞLEM TAMAMLANAMADI</small>
      <h1>Bir sorun oluştu</h1>
      <p>Son işleminiz kaydedilmemiş olabilir. Bilgileri kontrol edip tekrar deneyin. Sorun sürerse bu ekranın görüntüsünü yöneticinize iletin.</p>
      {detail ? <pre>{detail}</pre> : null}
      {error.digest ? <p><small>Hata kodu: {error.digest}</small></p> : null}
      <div className="panel-error-actions">
        <button className="ac-btn ac-btn-primary" type="button" onClick={() => reset()}>Tekrar dene</button>
        <Link className="ac-btn" href="/">Genel Bakış’a dön</Link>
      </div>
    </section>
  );
}
