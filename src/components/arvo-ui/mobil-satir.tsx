import Link from "next/link";
import "./mobil-satir.css";

/*
  Telefonda tablo satırı yerine tek hücrelik özet. Kaynak:
  ArvoOS/app/panel/crm/table-cells.tsx (MobilSatir, kisaTarih; 16.10.2026).
  ArvoOS'taki CRM'e özgü hücreler (müşteri, temsilci, son temas) alınmadı.
*/
export type MobilIsaret = { metin: string; ton?: "sessiz" | "guclu" | "uyari" | "tehlike" | "basari" | "bilgi" };

export function MobilSatir({ href, baslik, durum, alt = [], isaretler = [] }: {
  href?: string | null;
  baslik: string;
  durum?: { etiket: string; ton: string } | null;
  alt?: (string | null | undefined | false)[];
  isaretler?: (MobilIsaret | null | undefined | false)[];
}) {
  const altMetin = alt.filter(Boolean).join(" · ");
  const isaretListesi = isaretler.filter((i): i is MobilIsaret => Boolean(i && i.metin));
  return (
    <td className="mobil-satir">
      <div className="ms-ust">
        {/*
          Başlık metni İÇ bir kapsayıcıda: üç nokta kırpması onda, bağlantı
          serbest kalıyor. Bağlantının kendisinde overflow:hidden olduğu
          sürece satıra yayılan dokunma katmanı (mobil-satir.css) başlığın
          kutusuna kırpılıyordu.
        */}
        {href
          ? <Link className="ms-baslik" href={href}><span className="ms-baslik-metin">{baslik}</span></Link>
          : <span className="ms-baslik"><span className="ms-baslik-metin">{baslik}</span></span>}
        {durum ? <span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span> : null}
      </div>
      {altMetin ? <div className="ms-alt">{altMetin}</div> : null}
      {isaretListesi.length ? (
        <div className="ms-isaretler">
          {isaretListesi.map((i, sira) => <span key={sira} data-ton={i.ton}>{i.metin}</span>)}
        </div>
      ) : null}
    </td>
  );
}

/** "2026-10-28" → "28 Eki". Yalnızca gün: saat dilimi kaydırmasın diye öğlen UTC. */
export function kisaTarih(deger?: string | null) {
  if (!deger) return null;
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${deger.slice(0, 10)}T12:00:00Z`));
}
