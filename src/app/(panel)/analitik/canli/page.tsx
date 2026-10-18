import { canliVeriOku } from "./veri";
import { CanliHarita } from "./canli-harita";
import "@/components/arvo-ui/k-ui";
import "@/components/arvo-ui/crm.css";
import "@/components/arvo-ui/kayit-detay.css";
import "../../modules.css";
import "./canli.css";

export const metadata = { title: "Canlı · ArvoARC" };

/*
  CANLI ZİYARETLER.

  "Siteye dünyanın neresinden tıklanıyor" ve "en çok hangi ürün
  tıklanıyor" sorularının hiçbir yerde yanıtı yoktu. Raporlar
  ekranı siparişi anlatıyor — yani SATIN ALMIŞ müşteriyi; buradaki
  soru ondan önceki adım.

  İlk veri sunucuda okunuyor ki sayfa boş açılmasın; sonrası on
  saniyede bir tazeleniyor (canli-harita.tsx).
*/
export const dynamic = "force-dynamic";

export default async function CanliSayfa() {
  const ilk = await canliVeriOku();

  return (
    <main className="talep cari ekip talepler teklifler liste-sayfa canli-sayfa">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">Finans</small>
          <h1>Canlı</h1>
          <p className="talep-bas-alt">
            Siteye şu an nereden giriliyor ve hangi ürüne bakılıyor.
            On saniyede bir tazeleniyor.
          </p>
        </div>
      </header>

      {ilk.okunamadi ? (
        <p className="canli-bos">
          Ziyaret kaydı okunamadı. Tablo henüz oluşmamış olabilir
          (migration 20261018212040) ya da bağlantı geçici olarak
          düşmüş olabilir.
        </p>
      ) : (
        <CanliHarita ilk={ilk} />
      )}
    </main>
  );
}
