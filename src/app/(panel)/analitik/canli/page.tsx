import { GenelBakis } from "@/components/arvo-ui/genel-bakis";
import { PanelModal } from "@/components/arvo-ui/panel-modal";
import { canliVeriOku } from "./veri";
import { CanliHarita } from "./canli-harita";
import { CanliYenile } from "./yenile";
import { DagilimKarti, SeritKutusu } from "../parcalar";
import { saatYaz, sayiYaz, ulkeAdi } from "../bicim";
/* dash-* sınıfları genel-bakis.css'te ve o bileşen CSS'ini kendisi
   import ediyor; buraya dashboard.css eklemek aynı sınıfları ikinci
   bir dosyadan daha getirip sıralamaya bağımlı kılardı. */
import "../analitik.css";

export const metadata = { title: "Canlı · ArvoARC" };

/*
  ANALİTİK · CANLI.

  "Siteye dünyanın neresinden tıklanıyor" ve "en çok hangi ürün
  tıklanıyor" sorularının hiçbir yerde yanıtı yoktu; Raporlar ekranı
  SATIN ALMIŞ müşteriyi anlatıyor ve buradaki soru ondan önceki adım.

  DÜZEN ARVOOS'UN ANALİTİK MODÜLÜNDEN GELDİ (22.10.2026, kurum
  sahibinin isteği). Eski ekran iki büyük sayı ve dört düz liste
  gösteriyordu: ekranın yarısı boştu ve "şu an ne okunuyor" sorusunun
  yanıtı yoktu. Yeni düzen soru sırasıyla diziliyor:
  kaç kişi var (üst şerit) → nereden bağlanıyorlar (harita, en yoğun
  şehirler altında) → ne yapıyorlar (akış, açık sayfalar, kaynaklar).

  VERİ ARVOARC'IN KENDİSİNDEN. ArvoOS kurum sitelerinin trafiğini
  kendi tablolarından okuyor (cihaz, kampanya, form dönüşümü);
  burada kaynak `arc_visits`. Bu yüzden ArvoOS'un "Form gönderimi"
  kutusunun yerinde ÜRÜN SAYFASI AÇILIŞI var — vitrinde form yok ve
  mağazanın dönüşüme en yakın canlı sinyali bu. Cihaz ve kampanya
  kutuları hiç taşınmadı: o veri toplanmıyor ve boş bir kutu, olmayan
  kutudan kötü.

  Tek ekran, sayfa kaymaz (analitik.css → an-ekran): açık bırakılıp
  arada göz atılan bir sayfada kaydırmak zorunda kalmak, onu
  "bakılan" olmaktan çıkarıyor.
*/
export const dynamic = "force-dynamic";

export default async function CanliSayfa() {
  const veri = await canliVeriOku();

  if (veri.okunamadi) {
    return (
      <GenelBakis gizliBaslik="Analitik · Canlı" sinif="an-ekran an-ekran--canli">
        <p className="dash-empty">
          Ziyaret kaydı okunamadı. Tablo henüz oluşmamış olabilir
          (migration 20261018212040) ya da bağlantı geçici olarak
          düşmüş olabilir.
        </p>
      </GenelBakis>
    );
  }

  /* Şehirler haritadaki noktalardan: aynı veri, iki görünüm. */
  const sehirler = [...veri.noktalar].sort((a, b) => b.adet - a.adet);
  const sehirToplami = veri.noktalar.reduce((toplam, n) => toplam + n.adet, 0);

  return (
    <GenelBakis gizliBaslik="Analitik · Canlı" sinif="an-ekran an-ekran--canli">
      <CanliYenile />

      <section className="an-serit" aria-label="Şu an">
        <SeritKutusu
          canli
          etiket="Şu an sitede"
          deger={sayiYaz(veri.suAn)}
          alt="son 5 dakikada hareket eden"
        />
        <SeritKutusu
          etiket="Ziyaretçi"
          deger={sayiYaz(veri.sonSaatZiyaretci)}
          alt="son 1 saat"
        />
        <SeritKutusu
          etiket="Sayfa görüntüleme"
          deger={sayiYaz(veri.sonSaatGoruntuleme)}
          alt="son 1 saat"
        />
        <SeritKutusu
          etiket="Ürün sayfası"
          deger={sayiYaz(veri.sonSaatUrun)}
          alt="son 1 saat"
          ton={veri.sonSaatUrun ? "success" : undefined}
        />
      </section>

      <section className="an-canli" aria-label="Canlı">
        <article className="dash-card an-harita-kart">
          <header className="dash-card-head an-kart-bas">
            <div>
              <h2>Ziyaretçi haritası</h2>
              <p>Son 1 saat · yeni ziyaret parlak, eskisi soluk</p>
            </div>
            {sehirler.length ? (
              <PanelModal
                triggerLabel={`Şehirler (${sehirler.length})`}
                triggerClassName="an-tumu"
                title="Şehirler"
                description="Son 1 saat · yaklaşık konum"
                boy="genis"
              >
                <div className="an-pencere">
                  <DagilimKarti
                    baslik="Şehirler"
                    alt="Ziyaret"
                    bos="Son bir saatte konumlu ziyaret yok."
                    toplam={sehirToplami}
                    sinif="an-pencere-kart"
                    satirlar={sehirler.map((n) => ({
                      anahtar: `${n.lat},${n.lon}`,
                      ad: (
                        <>
                          {n.city ?? "Bilinmeyen şehir"} <small>{ulkeAdi(n.country)}</small>
                        </>
                      ),
                      adet: n.adet,
                    }))}
                  />
                </div>
              </PanelModal>
            ) : null}
          </header>
          <CanliHarita noktalar={veri.noktalar} />
          {sehirler.length ? (
            <ul className="an-sehir-etiketleri" aria-label="En çok ziyaret gelen şehirler">
              {sehirler.slice(0, 5).map((n) => (
                <li key={`${n.lat},${n.lon}`}>
                  {n.city ?? "Bilinmeyen"} <b>{sayiYaz(n.adet)}</b>
                </li>
              ))}
            </ul>
          ) : null}
        </article>

        <article className="dash-card dash-col an-akis">
          <header className="dash-card-head">
            <div>
              <h2>Son hareketler</h2>
              <p>Son 30 dakika · 10 saniyede bir yenilenir</p>
            </div>
          </header>
          {veri.akis.length ? (
            <ul className="an-akis-liste">
              {veri.akis.map((olay, sira) => (
                <li key={`${olay.zaman}-${sira}`} data-tur={olay.tur}>
                  <time dateTime={olay.zaman}>{saatYaz(olay.zaman)}</time>
                  <span className="an-akis-ana">
                    <b>
                      <code>{olay.yol}</code>
                    </b>
                    <small>
                      {[
                        olay.kaynak,
                        olay.sehir ?? (olay.ulke ? ulkeAdi(olay.ulke) : null),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dash-empty">Son otuz dakikada ziyaret yok.</p>
          )}
        </article>

        {/*
          EN ÇOK TIKLANAN ÜRÜN eski ekranın en değerli parçasıydı ve
          kaldı — ArvoOS'un "şu an açık sayfalar" kutusunun yerinde
          değil, ONUN YANINDA: sayfa yolu teknik bir bilgi, ürün adı
          mağazacının okuduğu şey.
        */}
        <DagilimKarti
          sinif="an-canli-urun"
          baslik="En çok tıklanan ürün"
          alt="Son 24 saat"
          bos="Henüz ürün sayfası açılmamış."
          toplam={veri.urunler[0]?.adet ?? 0}
          sinir={4}
          satirlar={veri.urunler.map((u) => ({ anahtar: u.slug, ad: u.ad, adet: u.adet }))}
        />
        <DagilimKarti
          sinif="an-canli-kaynak"
          baslik="Nereden geldiler"
          alt="Son 24 saat"
          bos="Kaynak bilgisi gelmemiş."
          toplam={veri.gunluk}
          sinir={4}
          satirlar={veri.kaynaklar.map((k) => ({ anahtar: k.ad, ad: k.ad, adet: k.adet }))}
        />
      </section>
    </GenelBakis>
  );
}
