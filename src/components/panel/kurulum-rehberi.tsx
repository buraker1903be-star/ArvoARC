import Link from "next/link";
import { Icon } from "./icons";
import type { KurulumDurumu } from "@/lib/kurulum-adimlari";

/*
  KURULUM REHBERİ KARTI.

  Yeni mağazada Genel Bakış sıfırlarla doluydu: boş grafik, dört sıfır
  kutusu, "henüz sipariş yok". Ekran doğruyu söylüyordu ama SIRADAKİ
  İŞİ söylemiyordu.

  Kart, kurulum bitince tamamen kayboluyor (durum.gorunsun). Kapatma
  düğmesi YOK: adımların hepsi müşterinin sipariş verebilmesi için
  gerekli, "sonra" denebilecek şeyler değil.

  Sıradaki adım açık, tamamlananlar tek satıra iniyor: on satırlık bir
  liste, "hangisi sıradaydı" sorusunu kullanıcıya bıraktırırdı.
*/
export function KurulumRehberi({ durum }: { durum: KurulumDurumu }) {
  if (!durum.gorunsun) return null;
  const yuzde = Math.round((durum.tamamlanan / durum.toplam) * 100);
  return (
    <section className="kurulum" aria-label="Kurulum rehberi">
      <div className="kurulum-head">
        <div>
          <span className="panel-kicker">KURULUM</span>
          <h2>Mağazanı satışa hazırla</h2>
          {/* Sıradaki adımın gerekçesi satırın kendisinde duruyor;
              burada tekrarlamak aynı cümleyi iki kez okutuyordu. */}
          <p>Bu adımlar tamamlanmadan müşteri sipariş veremez. Sıradaki iş aşağıda işaretli.</p>
        </div>
        <div className="kurulum-ilerleme">
          <strong>{durum.tamamlanan} / {durum.toplam}</strong>
          <span className="kurulum-bar"><span style={{ width: `${yuzde}%` }} /></span>
          <small>adım tamam</small>
        </div>
      </div>
      <ol className="kurulum-liste">
        {durum.adimlar.map((adim) => {
          const sirada = adim.anahtar === durum.sonraki?.anahtar;
          return (
            <li key={adim.anahtar} data-tamam={adim.tamam ? "" : undefined} data-sirada={sirada ? "" : undefined}>
              <span className="kurulum-isaret" aria-hidden="true">
                {adim.tamam ? <Icon name="check" size={14} /> : null}
              </span>
              <span className="kurulum-metin">
                <b>{adim.baslik}</b>
                {/* Açıklama yalnızca SIRADAKİ adımda: altı satırlık
                    paragraf yığını, listeyi okunmaz yapardı. */}
                {sirada ? <small>{adim.aciklama}</small> : null}
              </span>
              {adim.tamam ? (
                <span className="kurulum-durum">Tamam</span>
              ) : (
                <Link prefetch={false} className={sirada ? "ac-btn ac-btn-primary" : "ac-btn"} href={adim.yol}>
                  {adim.eylem}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
