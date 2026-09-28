/*
  SAYFA İSKELETLERİ.

  Panelde tek bir iskelet vardı ve şekli gösterge panelininkiydi:
  başlık, alt başlık, DÖRT ÖLÇÜM KARTI, iki büyük blok. Siparişler ya
  da Ürünler'e girerken önce o şekil çakıyor, sonra yerine bambaşka
  bir liste geliyordu. İskeletin işi "bir şey yükleniyor" demek değil,
  GELECEK ŞEYİN YERİNİ TUTMAK.

  ŞEKİL ARTIK TAHMİN EDİLMİYOR, AYNI KAPSAYICILARDAN GELİYOR.
  Liste iskeleti boşluklarını kendi ölçüleriyle kuruyordu (başlık
  32px, araç çubuğu 38px, aralık 16px) ve 28.09.2026'da ölçüldüğünde
  ilk satırı gerçek sayfadan 65 PİKSEL yukarıdaydı: sayfa gelince
  içerik aşağı sıçrıyordu — iskeletin önlemesi gereken şeyin ta
  kendisi. Artık ac-bar, ac-stack ve .ac kartları gerçek sınıflarıyla
  kullanılıyor; boşluklar tek bir CSS'ten okunuyor, iki yerde ayrı
  ayarlanmıyor.

  aria-hidden: ekran okuyucuya boş kutular okunmaz; yükleniyor bilgisi
  zaten yönlendirme ilerleme çubuğunda (NavProgress).
*/

/** Sayfa başlığının yerini tutar; ac-bar'ın kendi boşluklarını kullanır. */
function IskeletBaslik() {
  return (
    <section className="ac-bar" aria-hidden="true">
      <div>
        <div className="skel skel-title" />
        <div className="skel skel-sub" />
      </div>
    </section>
  );
}

/** Liste sayfaları: araç çubuğu, sekme şeridi, sütun başlığı, satırlar. */
export function ListeIskeleti({ satir = 8, sekme = true }: { satir?: number; sekme?: boolean }) {
  return (
    <>
      <IskeletBaslik />
      <div className="ac-stack" aria-hidden="true">
        <section className="ac ac-pad-sm list-toolbar">
          <div className="skel skel-search" />
          <div className="skel skel-pill" />
          <div className="skel skel-pill" />
        </section>
        {/* Sekme şeridi gerçek nav.ac-filter kabında: bölümlü seçicinin
            iç boşluğu ve kenarlığı oradan geliyor, burada tahmin
            edilmiyor. Serbest kutularla çizilince şerit 12px kısaydı. */}
        {sekme ? (
          <nav className="ac-filter skel-tabs">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="skel skel-tab" />)}
          </nav>
        ) : null}
        <section className="ac table list-table skel-list">
          <div className="skel skel-list-head" />
          {Array.from({ length: satir }, (_, i) => <div key={i} className="skel skel-list-row" />)}
        </section>
      </div>
    </>
  );
}

/*
  IZGARA İSKELETİ — medya kitaplığı gibi kart ızgarası olan sayfalar.
  Liste iskeleti burada YANLIŞ şekil olurdu: satırlar değil kare
  görseller geliyor.
*/
export function IzgaraIskeleti({ kutu = 18 }: { kutu?: number }) {
  return (
    <>
      <IskeletBaslik />
      <div className="ac-stack" aria-hidden="true">
        <section className="ac ac-pad-sm list-toolbar">
          <div className="skel skel-search" />
          <div className="skel skel-pill" />
        </section>
        <section className="ac ac-pad">
          <div className="skel-izgara">
            {Array.from({ length: kutu }, (_, i) => <div key={i} className="skel skel-kare" />)}
          </div>
        </section>
      </div>
    </>
  );
}

/*
  KART İSKELETİ — operasyon merkezi ve analitik gibi kutu/kart
  yerleşimleri: ölçüm kartları ve geniş bloklar.
*/
export function KartIskeleti({ olcum = 4, blok = 2 }: { olcum?: number; blok?: number }) {
  return (
    <>
      <IskeletBaslik />
      <div className="ac-stack" aria-hidden="true">
        <div className="panel-skeleton-metrics">
          {Array.from({ length: olcum }, (_, i) => <div key={i} className="skel skel-card" />)}
        </div>
        {Array.from({ length: blok }, (_, i) => <div key={i} className="skel skel-block" />)}
      </div>
    </>
  );
}
