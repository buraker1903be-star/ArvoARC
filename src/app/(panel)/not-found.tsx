import Link from "next/link";

/*
  Panel içinde bulunamayan kayıt (silinmiş sipariş, başka mağazaya
  ait ürün bağlantısı…). Menü ve üst çubuk yerinde kalır.
*/
export default function PanelNotFound() {
  return (
    <section className="ac ac-pad panel-error-card">
      <small className="panel-kicker">404 · BULUNAMADI</small>
      <h1>Aradığınız kayıt bulunamadı</h1>
      <p>Kayıt silinmiş, taşınmış ya da bu mağazaya ait olmayabilir. Adresi kontrol edin veya panelde arayın.</p>
      <div className="panel-error-actions">
        <Link className="ac-btn ac-btn-primary" href="/">Genel Bakış’a dön</Link>
        <Link className="ac-btn" href="/ara">Panelde ara</Link>
      </div>
    </section>
  );
}
