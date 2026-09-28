import Link from "next/link";

/*
  BOŞ LİSTE EKRANI.

  Her liste kendi boş durumunu yazıyordu ve çoğu tek bir cümle
  söylüyordu: "Bu ölçütlere uygun kayıt yok." İki sorunu vardı.

  1. İKİ DURUMU AYIRMIYORDU. Deposu bomboş yeni bir mağazaya da
     "aramayı veya filtreleri değiştirin" diyordu — oysa ortada
     değiştirilecek bir filtre yok, eklenecek ürün var. Koleksiyonlar
     ekranı bu ayrımı zaten yapıyordu; buradaki bileşen onu genelleştiriyor.

  2. EYLEM YOKTU. Kullanıcı ne yapacağını okuyor ama nereye gideceğini
     kendi buluyordu. Boş ekran, bir sonraki adımı gösterebileceği tek
     yerdir; düğmeyi oraya koymamak o fırsatı harcamaktı.
*/

export function ListeBos({
  baslik,
  aciklama,
  children,
}: {
  baslik: string;
  aciklama: string;
  /** Eylem düğmeleri; ListeBosEylem ya da düz bağlantı/düğme. */
  children?: React.ReactNode;
}) {
  return (
    <div className="list-empty">
      <b>{baslik}</b>
      <p>{aciklama}</p>
      {children ? <div className="list-empty-actions">{children}</div> : null}
    </div>
  );
}

/**
 * Boş ekrandaki bağlantı düğmesi.
 *
 * prefetch kapalı: boş ekranda duran bir düğme, kullanıcı ona
 * basmadıkça hedef sayfayı indirmemeli — panelin her yerinde kural bu.
 */
export function ListeBosEylem({
  href,
  children,
  birincil,
}: {
  href: string;
  children: React.ReactNode;
  birincil?: boolean;
}) {
  return (
    <Link prefetch={false} className={birincil ? "ac-btn ac-btn-primary" : "ac-btn"} href={href}>
      {children}
    </Link>
  );
}
