import Image from "next/image";
import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { createProductImageUrls } from "@/lib/product-images";
import { productStatusLabel } from "@/lib/commerce-labels";
import { terimiTemizle } from "@/lib/panel-arama";
import { ListeBos, ListeBosEylem } from "@/components/panel/liste-bos";
import "./medya.css";

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

  const { data, error } = await supabase.rpc("arc_medya_listesi", {
    p_organization_id: organization.id,
    p_arama: arama || null,
    p_limit: SAYFA,
    p_offset: baslangic,
  });
  /* Hata YUTULMUYOR: boş liste "görsel yok" gibi okunur ve kullanıcı
     yüklediklerinin silindiğini sanardı. */
  if (error) throw new Error("Medya kitaplığı okunamadı: " + error.message);

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

  return <>
    <section className="ac-bar">
      <div>
        <h1>Medya</h1>
        <p>{toplam.toLocaleString("tr-TR")} görsel{arama ? ` · “${arama}”` : ""} · ürün sayfalarında kullanılan tüm fotoğraflar</p>
      </div>
    </section>

    <div className="ac-stack">
      <section className="ac ac-pad-sm list-toolbar">
        <form className="ac-filter" role="search">
          <input name="q" defaultValue={arama} placeholder="Ürün adına göre ara" aria-label="Görsellerde ara" />
          <button className="ac-btn ac-btn-primary" type="submit">Ara</button>
          {arama ? <Link prefetch={false} className="ac-btn" href={yol({ q: "", page: 1 })}>Temizle</Link> : null}
        </form>
      </section>

      {satirlar.length ? (
        <section className="ac ac-pad medya-kap" aria-label="Görseller">
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
            <div className="list-pagination">
              <span>{(baslangic + 1).toLocaleString("tr-TR")}–{(baslangic + satirlar.length).toLocaleString("tr-TR")} / {toplam.toLocaleString("tr-TR")} görsel</span>
              <div>
                {sayfa > 1 ? <Link prefetch={false} className="ac-btn" href={yol({ page: sayfa - 1 })}>← Önceki</Link> : <span className="ac-btn" aria-disabled="true">← Önceki</span>}
                <span className="order-page-number">{sayfa} / {sayfaSayisi}</span>
                {sayfa < sayfaSayisi ? <Link prefetch={false} className="ac-btn" href={yol({ page: sayfa + 1 })}>Sonraki →</Link> : <span className="ac-btn" aria-disabled="true">Sonraki →</span>}
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <ListeBos
          baslik={arama ? "Bu aramayla eşleşen görsel yok." : "Henüz görsel yok."}
          aciklama={arama
            ? "Arama ürün adında geçiyor; farklı bir ad deneyin."
            : "Görseller ürün sayfasından yükleniyor ve burada toplanıyor. Kapak görseli olmayan ürün vitrinde boş bir kutu gösterir."}
        >
          {arama
            ? <ListeBosEylem href="/medya">Aramayı temizle</ListeBosEylem>
            : <ListeBosEylem href="/urunler" birincil>Ürünlere git</ListeBosEylem>}
        </ListeBos>
      )}
    </div>
  </>;
}
