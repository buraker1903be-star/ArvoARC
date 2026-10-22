import type { CSSProperties, ReactNode } from "react";
import { PanelModal } from "@/components/arvo-ui/panel-modal";
import { sayiYaz } from "./bicim";
import "./analitik.css";

/*
  ANALİTİK EKRANLARININ ORTAK PARÇALARI.

  ArvoOS'un analitik modülünden taşındı (22.10.2026, kurum sahibinin
  isteği): ArvoARC'ın canlı ekranı iki büyük sayı ve dört düz liste
  gösteriyordu; ekranın yarısı boştu ve "şu an ne okunuyor" sorusunun
  yanıtı yoktu. İki panel aynı jeton sözlüğünü kullandığı için
  parçalar neredeyse olduğu gibi geçti.

  DAĞILIM KARTININ SATIRLARI BAĞLANTI DEĞİL: "Instagram 42"
  tıklanacak bir kayıt değil, bir pay. Payı satırın arkasındaki soluk
  dolgu gösteriyor — sayıyı okumadan oranı görmek için.

  TEK EKRAN KURALI: panel sayfası aşağı kaymaz (kayit-detay.css →
  tek-ekran). Kart en fazla `sinir` satır gösterir, fazlası
  başlıktaki düğmeyle açılır pencerede.
*/
export function DagilimKarti({
  baslik,
  alt,
  bos,
  satirlar,
  toplam,
  sinir,
  sinif,
}: {
  baslik: string;
  alt: string;
  bos: string;
  satirlar: Array<{ ad: ReactNode; anahtar: string; adet: number }>;
  /** Pay hesabının paydası (genelde ziyaretçi sayısı). */
  toplam: number;
  /** Kartta gösterilecek en fazla satır; fazlası pencerede. */
  sinir?: number;
  sinif?: string;
}) {
  const gorunen = sinir ? satirlar.slice(0, sinir) : satirlar;
  const tasan = sinir ? satirlar.length > sinir : false;

  return (
    <article className={["dash-card dash-col an-dagilim", sinif].filter(Boolean).join(" ")}>
      <header className="dash-card-head an-kart-bas">
        <div>
          <h2>{baslik}</h2>
          <p>{alt}</p>
        </div>
        {tasan ? (
          <PanelModal
            triggerLabel={`Tümü (${satirlar.length})`}
            triggerClassName="an-tumu"
            title={baslik}
            description={alt}
            boy="genis"
          >
            <div className="an-pencere">
              <DagilimKarti
                baslik={baslik}
                alt={alt}
                bos={bos}
                satirlar={satirlar}
                toplam={toplam}
                sinif="an-pencere-kart"
              />
            </div>
          </PanelModal>
        ) : null}
      </header>
      {gorunen.length ? (
        <ul className="an-satirlar">
          {gorunen.map((satir) => (
            <li
              className="an-satir"
              key={satir.anahtar}
              /* Pay en az %2: tek ziyaretli satırın da bir izi olsun,
                 yoksa dolgu hiç görünmüyor. */
              style={{ "--pay": toplam ? Math.min(1, Math.max(0.02, satir.adet / toplam)) : 0 } as CSSProperties}
            >
              <span className="an-satir-ad">{satir.ad}</span>
              <b>{sayiYaz(satir.adet)}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dash-empty">{bos}</p>
      )}
    </article>
  );
}

/*
  ÜST ŞERİT KUTUSU. Canlı sayıyı taşıyan kutuda nabız atıyor: "bu
  rakam şu an" ile "bu rakam son bir saat" arasındaki farkı yazıyla
  anlatmak yerine gösteriyor.
*/
export function SeritKutusu({
  deger,
  etiket,
  alt,
  ton,
  canli,
}: {
  deger: string;
  etiket: string;
  alt?: string;
  ton?: "success";
  canli?: boolean;
}) {
  return (
    <div className={canli ? "an-serit-kutu is-canli" : "an-serit-kutu"} data-tone={ton}>
      {canli ? <span className="an-nabiz" aria-hidden="true" /> : null}
      <small className="an-serit-etiket">{etiket}</small>
      <strong>{deger}</strong>
      {alt ? <small className="an-serit-alt">{alt}</small> : null}
    </div>
  );
}
