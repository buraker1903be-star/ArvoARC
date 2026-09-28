/*
  LİSTE İSKELETİ.

  Panelde tek bir iskelet vardı ve şekli gösterge panelininkiydi:
  başlık, alt başlık, DÖRT ÖLÇÜM KARTI, iki büyük blok. Siparişler ya
  da Ürünler'e girerken önce o şekil çakıyor, sonra yerine bambaşka
  bir liste geliyordu. İskeletin işi "bir şey yükleniyor" demek değil,
  GELECEK ŞEYİN YERİNİ TUTMAK; şekil tutmayınca sayfa yerleşmiş gibi
  görünüp sıçrıyor.

  Bu bileşen liste sayfalarının şeklini tutuyor: araç çubuğu, sekme
  şeridi, sütun başlığı ve satırlar.

  aria-hidden: ekran okuyucuya boş kutular okunmaz; yükleniyor bilgisi
  zaten yönlendirme ilerleme çubuğunda (NavProgress).
*/
export function ListeIskeleti({ satir = 8, sekme = true }: { satir?: number; sekme?: boolean }) {
  return (
    <div className="panel-skeleton" aria-hidden="true">
      <div className="skel skel-title" />
      <div className="skel skel-sub" />
      <div className="skel-toolbar">
        <div className="skel skel-search" />
        <div className="skel skel-pill" />
        <div className="skel skel-pill" />
      </div>
      {sekme ? (
        <div className="skel-tabs">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="skel skel-tab" />)}
        </div>
      ) : null}
      <div className="skel-list">
        <div className="skel skel-list-head" />
        {Array.from({ length: satir }, (_, i) => <div key={i} className="skel skel-list-row" />)}
      </div>
    </div>
  );
}
