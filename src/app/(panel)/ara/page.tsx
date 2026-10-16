import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { panelAra, type AramaSonucu } from "@/lib/panel-arama";
import { KKart, KListe, KOge } from "@/components/arvo-ui/k-ui";
import { rozetTonu } from "@/lib/rozet-tonu";
import "@/components/arvo-ui/kayit-detay.css";
import "./search.css";

/* Biçimlendirme lib/panel-arama.ts'te: tutar ve tarih metinleri sonuçla birlikte geliyor. */

/* Bir sonuç grubu: ArvoOS kartı + iOS listesi (16.10.2026). Sonuç yoksa hiç çizilmez. */
function Bolum({ baslik, satirlar, daha }: { baslik: string; satirlar: AramaSonucu[]; daha?: { href: string; label: string } }) {
  if (!satirlar.length) return null;
  return (
    <KKart baslik={baslik} aciklama={`${satirlar.length} sonuç`} sag={daha ? <Link prefetch={false} className="panel-secondary" href={daha.href}>{daha.label} →</Link> : undefined}>
      <KListe>
        {satirlar.map((satir) => (
          <KOge
            key={satir.anahtar}
            href={satir.yol}
            simge={satir.baslik}
            baslik={satir.baslik}
            alt={satir.detay}
            durum={satir.rozet ? { etiket: satir.rozet.metin, ton: rozetTonu(satir.rozet.ton) } : null}
            deger={satir.yan}
          />
        ))}
      </KListe>
    </KKart>
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

  const baslik = (h1: React.ReactNode, alt: string) => (
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">Arama</small>
        <h1>{h1}</h1>
        <p className="talep-bas-alt">{alt}</p>
      </div>
    </header>
  );

  if (!term) {
    return (
      <main className="talep arama-sayfasi">
        {baslik("Arama", "Sipariş numarası, müşteri adı veya e-postası, ürün adı, SKU ya da koleksiyon adı yazın.")}
        <div className="panel-card crm-empty-state talep-bos-kutu">
          <h2>Aramak istediğiniz kelimeyi yazın</h2>
          <p>İpucu: üst çubuktaki arama kutusunu Ctrl+K (Mac&apos;te ⌘K) ile açabilirsiniz.</p>
        </div>
      </main>
    );
  }

  /*
    Sorgular lib/panel-arama.ts'te: ikinci bir kopya yazmak, birinde
    düzeltilen bir sorgunun ötekinde eskimesi demekti.
  */
  const sonuc = await panelAra(supabase, organization.id, term);
  const total = sonuc.toplam;
  const encoded = encodeURIComponent(term);

  return (
    <main className="talep arama-sayfasi">
      {baslik(`“${term}”`, total ? `${total} sonuç · sipariş, müşteri, ürün ve koleksiyonlarda arandı` : "Sonuç bulunamadı")}
      {total ? <>
        <Bolum baslik="Siparişler" satirlar={sonuc.siparisler} daha={sonuc.dahaFazlaSiparis ? { href: `/siparisler?q=${encoded}`, label: "Tüm siparişlerde" } : undefined} />
        <Bolum baslik="Müşteriler" satirlar={sonuc.musteriler} daha={{ href: `/musteriler?q=${encoded}`, label: "Müşteri listesinde" }} />
        <Bolum baslik="Ürünler" satirlar={sonuc.urunler} daha={{ href: `/urunler?q=${encoded}`, label: "Katalogda" }} />
        <Bolum baslik="Koleksiyonlar" satirlar={sonuc.koleksiyonlar} />
      </> : (
        <div className="panel-card crm-empty-state talep-bos-kutu">
          <h2>Bu aramayla eşleşen kayıt yok</h2>
          <p>Sipariş numarasını (AC261016-…), müşteri adını veya e-postasını, ürün adını ya da SKU&apos;yu deneyin.</p>
        </div>
      )}
    </main>
  );
}
