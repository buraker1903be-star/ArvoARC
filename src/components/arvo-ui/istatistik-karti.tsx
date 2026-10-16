/*
  Liste sayfalarının (talepler, teklifler, sözleşmeler) sağındaki
  istatistik kartı. Üstte dört sayı kutusu, altında çubuklu dağılımlar.
  Hesaplar lib/liste-istatistik.ts'te; bu bileşen yalnızca çizer.
*/

export type IstatistikKutusu = { ad: string; deger: string; alt?: string; ton?: "arti" | "uyari" };
export type IstatistikGrubu = { baslik: string; satirlar: { ad: string; adet: number; etiket?: string }[] };

const TON_SINIFI = { arti: "cari-arti", uyari: "talep-uyari" } as const;

export function IstatistikKarti({ kapsam, kutular, gruplar }: { kapsam: string; kutular: IstatistikKutusu[]; gruplar: IstatistikGrubu[] }) {
  return (
    <section className="panel-card talep-musteri talep-istatistik" aria-label="İstatistikler">
      <div className="cari-baslik">
        <h2>İstatistikler</h2>
        <small>{kapsam}</small>
      </div>
      <dl className="istat-kutular">
        {kutular.map((kutu) => (
          <div key={kutu.ad}>
            <dt>{kutu.ad}</dt>
            <dd className={kutu.ton === "uyari" ? TON_SINIFI.uyari : undefined}>{kutu.deger}</dd>
            {kutu.alt ? <small className={kutu.ton === "arti" ? TON_SINIFI.arti : kutu.ton === "uyari" ? TON_SINIFI.uyari : undefined}>{kutu.alt}</small> : null}
          </div>
        ))}
      </dl>
      <div className="istat-gruplar">
      {gruplar.map((grup) => {
        const enBuyuk = Math.max(1, ...grup.satirlar.map((s) => s.adet));
        return (
          <div className="talep-not" key={grup.baslik}>
            <h3>{grup.baslik}</h3>
            {grup.satirlar.length ? (
              <ul className="istat-cubuklar">
                {grup.satirlar.map((satir) => (
                  <li key={satir.ad}>
                    <span title={satir.ad}>{satir.ad}</span>
                    <i aria-hidden="true"><b style={{ width: `${satir.adet ? Math.max(4, Math.round((satir.adet / enBuyuk) * 100)) : 0}%` }} /></i>
                    <strong>{satir.etiket ?? satir.adet}</strong>
                  </li>
                ))}
              </ul>
            ) : <p className="talep-bos cari-not">Veri yok.</p>}
          </div>
        );
      })}
      </div>
    </section>
  );
}

/** "+%23" / "−%5" biçimi; önceki dönem yoksa null. */
export function degisimYazisi(degisim: number | null, donem = "önceki 30 güne göre") {
  return degisim === null ? null : `${donem} ${degisim >= 0 ? "+" : "−"}%${Math.abs(degisim)}`;
}

/** Kuruştan kısa TL: "₺1,2 Mn", "₺480 B". Çubuk etiketleri dar. */
export function kisaPara(kurus: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", notation: "compact", maximumFractionDigits: 1 }).format(kurus / 100);
}

/** Kuruştan kuruşsuz TL: "₺38.000". Sayı kutuları dar; kuruş bilgi taşımıyor. */
export function tamPara(kurus: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(kurus / 100);
}
