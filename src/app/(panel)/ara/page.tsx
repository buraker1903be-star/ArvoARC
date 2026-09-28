import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { panelAra, type AramaSonucu } from "@/lib/panel-arama";
import { Icon, type IconName } from "@/components/panel/icons";
import "./search.css";

/* Biçimlendirme lib/panel-arama.ts'te: tutar ve tarih metinleri sonuçla birlikte geliyor. */

type Hit = { key: string; href: string; icon: IconName; title: string; detail: string; side?: React.ReactNode };

function Section({ title, hits, more }: { title: string; hits: Hit[]; more?: { href: string; label: string } }) {
  if (!hits.length) return null;
  return (
    <section className="ac table list-table search-list">
      <div className="ac-head ac-pad-sm list-table-head">
        <div><h3>{title}</h3><p>{hits.length} sonuç</p></div>
        {more ? <Link prefetch={false} href={more.href}>{more.label} →</Link> : null}
      </div>
      {hits.map((hit) => (
        <div className="list-row" key={hit.key}>
          <span className="sr-icon"><Icon name={hit.icon} size={16} /></span>
          <span className="sr-main"><Link prefetch={false} className="list-row-link" href={hit.href}><b>{hit.title}</b></Link><small>{hit.detail}</small></span>
          <span className="sr-side">{hit.side}</span>
        </div>
      ))}
    </section>
  );
}

/*
  Genel arama sonuçları. Her tür kendi sorgusuyla ve sınırıyla
  aranır; ayrıntılı filtreleme için ilgili sayfaya bağlantı verilir.
  Metin PostgREST filtresine yazıldığı için filtre sözdiziminin
  parçaları (virgül, parantez, joker) temizlenir.
*/
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { supabase, organization } = await requireTenant();
  const term = (q ?? "").replace(/[,()*\\"%_]/g, " ").trim().slice(0, 80);

  if (!term) {
    return <>
      <section className="ac-bar"><div><h1>Arama</h1><p>Sipariş numarası, müşteri adı veya e-postası, ürün adı, SKU ya da koleksiyon adı yazın.</p></div></section>
      <section className="ac list-empty"><b>Aramak istediğiniz kelimeyi yazın.</b><p>İpucu: üst çubuktaki kutuya ⌘K (Windows’ta Ctrl+K) veya “/” ile hızlıca geçebilirsiniz.</p></section>
    </>;
  }

  /*
    Sorgular lib/panel-arama.ts'te ve ⌘K komut paletiyle PAYLAŞILIYOR.
    İkinci bir kopya yazmak, birinde düzeltilen bir sorgunun ötekinde
    eskimesi demekti.
  */
  const sonuc = await panelAra(supabase, organization.id, term);

  const rozet = (deger?: { metin: string; ton?: string }) =>
    deger ? <em className="ac-tag" data-tone={deger.ton}>{deger.metin}</em> : null;
  const hit = (satir: AramaSonucu, ikon: IconName, yanTarz?: string): Hit => ({
    key: satir.anahtar,
    href: satir.yol,
    icon: ikon,
    title: satir.baslik,
    detail: satir.detay,
    side: <>{satir.yan ? <span className={yanTarz}>{satir.yan}</span> : null}{rozet(satir.rozet)}</>,
  });

  const orderHits = sonuc.siparisler.map((satir) => hit(satir, "box", "sr-amount"));
  const customerHits = sonuc.musteriler.map((satir) => hit(satir, "users", "sr-muted"));
  const productHits = sonuc.urunler.map((satir) => hit(satir, "tag"));
  const collectionHits = sonuc.koleksiyonlar.map((satir) => hit(satir, "layers"));

  const total = sonuc.toplam;
  const encoded = encodeURIComponent(term);

  return <>
    <section className="ac-bar">
      <div>
        <h1>“{term}”</h1>
        <p>{total ? `${total} sonuç · sipariş, müşteri, ürün ve koleksiyonlarda arandı` : "Sonuç bulunamadı"}</p>
      </div>
    </section>

    <div className="ac-stack">
      {total ? <>
        <Section title="Siparişler" hits={orderHits} more={sonuc.dahaFazlaSiparis ? { href: `/siparisler?q=${encoded}`, label: "Tüm siparişlerde" } : undefined} />
        <Section title="Müşteriler" hits={customerHits} more={{ href: `/musteriler?q=${encoded}`, label: "Müşteri listesinde" }} />
        <Section title="Ürünler" hits={productHits} more={{ href: `/urunler?q=${encoded}`, label: "Katalogda" }} />
        <Section title="Koleksiyonlar" hits={collectionHits} />
      </> : (
        <section className="ac list-empty">
          <b>Bu aramayla eşleşen kayıt yok.</b>
          <p>Sipariş numarasını (#AC-1048), müşteri adını veya e-postasını, ürün adını ya da SKU’yu deneyin.</p>
        </section>
      )}
    </div>
  </>;
}
