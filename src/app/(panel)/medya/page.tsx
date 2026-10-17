import Image from "next/image";
import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { createProductImageUrls } from "@/lib/product-images";
import { productStatusLabel } from "@/lib/commerce-labels";
import { IstatistikKarti } from "@/components/arvo-ui/istatistik-karti";
import { yuzdeOrani } from "@/lib/oran";
import { terimiTemizle } from "@/lib/panel-arama";
import "./medya.css";
import "@/components/arvo-ui/kayit-detay.css";

/*
  MEDYA KİTAPLIĞI.

  Görseller ürün ürün yükleniyordu ve yüklendikten sonra yalnızca o
  ürünün sayfasından görülebiliyordu: "bu fotoğrafı daha önce hangi
  ürüne koymuştuk" sorusunun ekranda karşılığı yoktu.

  KAYNAK AYRI BİR TABLO DEĞİL. Kullanımdaki her görsel zaten
  arc_products.metadata->image_paths içinde; ikinci bir yere yazmak
  iki kaynağın ayrışması demekti. PostgREST jsonb dizisini satırlara
  açamadığı için okuma bir fonksiyondan geliyor (arc_medya_listesi),
  kurum kısıtını da RLS yapıyor.

  SAYFA BAŞINA 48: imzalı adres üretimi tek çağrıda yapılıyor ama her
  görsel bir ağ isteği; yüzlerce küçük resim listeyi ağırlaştırıyordu.
*/

const SAYFA = 48;

type Satir = { yol: string; urun_id: string; urun_adi: string; urun_durumu: string; sira: number; toplam: number };
type Params = { q?: string; page?: string };

export default async function Medya({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { supabase, organization } = await requireTenant();

  /* Joker karakterler burada temizleniyor: fonksiyon metni ilike'a
     veriyor ve "%" yazan biri bütün kataloğu çekerdi. */
  const arama = terimiTemizle(params.q);
  const sayfa = Math.min(1000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const baslangic = (sayfa - 1) * SAYFA;

  /*
    ÖZET AYRI SORGUDA (17.10.2026). "Kaç ürünün görseli yok" sayfadan
    hesaplanamıyor: liste sayfalanıyor ve her satır bir GÖRSEL, ürün
    değil. Fonksiyon üç sayıyı tek turda veriyor (arc_medya_ozeti).

    HATA YUTULMUYOR AMA SAYFAYI DA DÜŞÜRMÜYOR: migration canlıya
    uygulanana kadar fonksiyon yok ve medya listesi onsuz da çalışıyor;
    kart o zaman "—" gösteriyor.
  */
  const ozetSozu = supabase.rpc("arc_medya_ozeti", { p_organization_id: organization.id });
  const { data, error } = await supabase.rpc("arc_medya_listesi", {
    p_organization_id: organization.id,
    p_arama: arama || null,
    p_limit: SAYFA,
    p_offset: baslangic,
  });
  /* Hata YUTULMUYOR: boş liste "görsel yok" gibi okunur ve kullanıcı
     yüklediklerinin silindiğini sanardı. */
  if (error) throw new Error("Medya kitaplığı okunamadı: " + error.message);

  const { data: ozetSatirlari, error: ozetHatasi } = await ozetSozu;
  if (ozetHatasi) console.error("[medya] özet okunamadı:", ozetHatasi.message);
  type Ozet = { urun_toplam: number; gorselli: number; gorsel_toplam: number };
  const ozet = (Array.isArray(ozetSatirlari) ? (ozetSatirlari[0] as Ozet | undefined) : (ozetSatirlari as Ozet | null) ?? undefined) ?? null;
  const gorselsiz = ozet ? Math.max(0, Number(ozet.urun_toplam) - Number(ozet.gorselli)) : null;
  /* Yuvarlama uçları uydurmasın (lib/oran): bir ürünün görseli yoksa
     "görselli ürün %100" yazılmamalı. */
  const ozetOrani = (deger: number | null) => (ozet && deger !== null ? yuzdeOrani(deger, Number(ozet.urun_toplam)) : null);
  const sayiYaz = (deger: number | null | undefined) => (deger === null || deger === undefined ? "—" : Number(deger).toLocaleString("tr-TR"));

  const satirlar = (data ?? []) as Satir[];
  const toplam = satirlar.length ? Number(satirlar[0].toplam) : 0;
  const sayfaSayisi = Math.max(1, Math.ceil(toplam / SAYFA));

  /*
    Tedarikçi görselleri CDN adresi, kendi ürünlerimizinki depo yolu:
    yalnızca ikincisi imzalanıyor. Hepsini imzalamaya çalışmak
    galeriyi boş bırakıyordu (ürün detayında da aynı ayrım var).
  */
  const uzak = (yol: string) => yol.startsWith("http");
  const depoYollari = satirlar.map((satir) => satir.yol).filter((yol) => !uzak(yol));
  const imzali = await createProductImageUrls(supabase, depoYollari);
  const adresler = new Map(depoYollari.map((yol, sira) => [yol, imzali[sira]]));

  const adres = (yol: string) => (uzak(yol) ? yol : adresler.get(yol));

  const yol = (yama: { q?: string; page?: number }) => {
    const sorgu = new URLSearchParams();
    const q = yama.q ?? arama;
    const s = yama.page ?? sayfa;
    if (q) sorgu.set("q", q);
    if (s > 1) sorgu.set("page", String(s));
    const metin = sorgu.toString();
    return metin ? `/medya?${metin}` : "/medya";
  };

  /* ArvoOS liste kalıbı (16.10.2026): başlık, arama ve ızgara tek kartta; sayfalayıcı ArvoOS'unki. */
  return (
    <main className="talep liste-sayfa medya-sayfasi">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">Katalog</small>
          <h1>Medya</h1>
          <p className="talep-bas-alt">{toplam.toLocaleString("tr-TR")} görsel{arama ? ` · “${arama}”` : ""} · ürün sayfalarında kullanılan tüm fotoğraflar</p>
        </div>
      </header>

      {/* Solda galeri, sağda medya sağlığı: katalogun öteki ekranlarıyla aynı ızgara. */}
      <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label="Görseller">
        <div className="ekip-suzgec talep-suzgec">
          <form className="talep-ara" role="search">
            <input name="q" defaultValue={arama} placeholder="Ürün adına göre ara" aria-label="Görsellerde ara" />
          </form>
        </div>
        {satirlar.length ? (
          <>
          <div className="medya-izgara">
            {satirlar.map((satir) => {
              const kaynak = adres(satir.yol);
              return (
                <Link prefetch={false} className="medya-kart" key={`${satir.urun_id}-${satir.sira}`} href={`/urunler/${satir.urun_id}`} title={`${satir.urun_adi} · ${satir.sira}. görsel`}>
                  <span className="medya-gorsel">
                    {kaynak ? <Image src={kaynak} alt="" width={320} height={320} sizes="(max-width:760px) 45vw, 160px" /> : <span className="medya-yok">Görsel açılamadı</span>}
                    {/* Kapak işareti: galeride ilk sıradaki görsel listelerde
                        ve vitrinde kapak olarak kullanılıyor. */}
                    {satir.sira === 1 ? <em>Kapak</em> : null}
                  </span>
                  <span className="medya-ad">{satir.urun_adi}</span>
                  <span className="medya-alt">{productStatusLabel(satir.urun_durumu)} · {satir.sira}. görsel</span>
                </Link>
              );
            })}
          </div>
            {sayfaSayisi > 1 ? (
              <nav className="liste-sayfalar" aria-label="Sayfalar">
                {sayfa > 1 ? <Link prefetch={false} href={yol({ page: sayfa - 1 })}>← Önceki</Link> : <span aria-disabled="true">← Önceki</span>}
                <b>{sayfa} / {sayfaSayisi} · {toplam.toLocaleString("tr-TR")} görsel</b>
                {sayfa < sayfaSayisi ? <Link prefetch={false} href={yol({ page: sayfa + 1 })}>Sonraki →</Link> : <span aria-disabled="true">Sonraki →</span>}
              </nav>
            ) : null}
          </>
        ) : (
          <div className="crm-empty-state talep-bos-kutu">
            <h2>{arama ? "Bu aramayla eşleşen görsel yok" : "Henüz görsel yok"}</h2>
            <p>{arama
              ? "Arama ürün adında geçiyor; farklı bir ad deneyin."
              : "Görseller ürün sayfasından yükleniyor ve burada toplanıyor. Kapak görseli olmayan ürün vitrinde boş bir kutu gösterir."}</p>
            <div className="crm-empty-actions">
              {arama
                ? <Link prefetch={false} className="panel-secondary" href="/medya">Aramayı temizle</Link>
                : <Link prefetch={false} className="panel-primary" href="/urunler">Ürünlere git</Link>}
            </div>
          </div>
        )}
      </section>

      <IstatistikKarti
        kapsam={ozet ? "katalogun tamamı · aramadan bağımsız" : "özet okunamadı"}
        kutular={[
          { ad: "Görsel", deger: sayiYaz(ozet ? Number(ozet.gorsel_toplam) : null), alt: "ürün galerilerindeki toplam" },
          { ad: "Görselli ürün", deger: sayiYaz(ozet ? Number(ozet.gorselli) : null), oran: ozetOrani(ozet ? Number(ozet.gorselli) : null), alt: ozet ? `${Number(ozet.urun_toplam).toLocaleString("tr-TR")} üründen` : "—" },
          {
            /* Görseli olmayan ürün vitrinde boş bir kutu: fiilen
               satılamayan stok. */
            ad: "Görselsiz ürün",
            deger: sayiYaz(gorselsiz),
            oran: ozetOrani(gorselsiz),
            alt: "vitrinde boş kutu gösterir",
            ton: gorselsiz ? "uyari" : undefined,
          },
          { ad: "Ürün başına", deger: ozet && Number(ozet.gorselli) ? (Number(ozet.gorsel_toplam) / Number(ozet.gorselli)).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) : "—", alt: "görselli ürünlerin ortalaması" },
        ]}
        gruplar={[]}
      />
      </div>
    </main>
  );
}
