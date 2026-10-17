/*
  VİTRİN VERİ API'SİNİN SÖZLEŞMESİ — saf tanım.

  Hangi kaynak hangi veritabanı fonksiyonuna düşüyor ve parametreler
  nasıl kuruluyor. Rotadan AYRI, çünkü burası müşterinin sitesine
  verdiğimiz söz: adlar ve sınırlar testle sabitleniyor
  (tests/vitrin-api.test.ts), rotada kalsaydı sınamak için ağ
  gerekirdi.

  SINIRLI BİR KÜME, bilerek. Veritabanındaki her fonksiyonu açmak,
  her birini sonsuza kadar desteklemeye söz vermek olurdu. Buradaki
  altı kaynak bir vitrinin ihtiyacı: listele, ara, ürünü getir,
  varyantları getir, rafları getir, kuralları öğren.
*/

export type Kaynak =
  | "urunler"
  | "urun"
  | "varyantlar"
  | "koleksiyonlar"
  | "koleksiyon"
  | "arama"
  | "ayarlar";

export type KaynakTanimi = {
  fonksiyon: string;
  aciklama: string;
  parametreler: (sorgu: URLSearchParams, konak: string) => Record<string, unknown>;
};

/* Sayfa boyu tavanı: PostgREST tek istekte 1000 satır döndürüyor ve
   daha fazlasını istemek sessizce kesilen bir liste demek. */
export const AZAMI_SAYFA = 100;
export const VARSAYILAN_SAYFA = 24;

export function sayfaSiniri(sorgu: URLSearchParams): { limit: number; offset: number } {
  const ham = Number(sorgu.get("limit"));
  const limit = Number.isFinite(ham) && ham > 0 ? Math.min(AZAMI_SAYFA, Math.floor(ham)) : VARSAYILAN_SAYFA;
  const hamOfset = Number(sorgu.get("offset"));
  const offset = Number.isFinite(hamOfset) && hamOfset > 0 ? Math.floor(hamOfset) : 0;
  return { limit, offset };
}

const metin = (sorgu: URLSearchParams, ad: string) => {
  const deger = (sorgu.get(ad) ?? "").trim();
  return deger ? deger.slice(0, 200) : null;
};

export const KAYNAKLAR: Record<Kaynak, KaynakTanimi> = {
  urunler: {
    fonksiyon: "arc_storefront_products_page",
    aciklama: "Katalog sayfası. limit, offset, marka, beden, azami_fiyat, sadece_indirimli, sadece_stokta, sirala.",
    parametreler: (sorgu, konak) => {
      const { limit, offset } = sayfaSiniri(sorgu);
      return {
        p_host: konak,
        p_limit: limit,
        p_offset: offset,
        p_brand: metin(sorgu, "marka"),
        p_size: metin(sorgu, "beden"),
        p_max_price: sorgu.get("azami_fiyat") ? Number(sorgu.get("azami_fiyat")) : null,
        p_only_discounted: sorgu.get("sadece_indirimli") === "1",
        p_only_available: sorgu.get("sadece_stokta") === "1",
        p_sort: metin(sorgu, "sirala") ?? "onerilen",
      };
    },
  },
  urun: {
    fonksiyon: "arc_storefront_product",
    aciklama: "Tek ürün. slug zorunlu.",
    parametreler: (sorgu, konak) => ({ p_host: konak, p_slug: metin(sorgu, "slug") ?? "" }),
  },
  varyantlar: {
    fonksiyon: "arc_storefront_variants",
    aciklama: "Ürünün varyantları. slug zorunlu. SEPETE HER ZAMAN SKU yazın; slug ile sipariş açmak müşterinin seçmediği varyantı satar.",
    parametreler: (sorgu, konak) => ({ p_host: konak, p_slug: metin(sorgu, "slug") ?? "" }),
  },
  koleksiyonlar: {
    fonksiyon: "arc_storefront_collections",
    aciklama: "Rafların (koleksiyonların) listesi: slug, başlık ve menü grubu. Ürünleri için koleksiyon kaynağını çağırın.",
    parametreler: (_sorgu, konak) => ({ p_host: konak }),
  },
  koleksiyon: {
    fonksiyon: "arc_storefront_collection_products_page",
    aciklama: "Bir rafın ürünleri. slug zorunlu; sayfalama ve süzgeçler urunler ile aynı.",
    parametreler: (sorgu, konak) => {
      const { limit, offset } = sayfaSiniri(sorgu);
      const slug = metin(sorgu, "slug");
      return {
        p_host: konak,
        p_collection_slugs: slug ? [slug] : null,
        p_limit: limit,
        p_offset: offset,
        p_brand: metin(sorgu, "marka"),
        p_size: metin(sorgu, "beden"),
        p_max_price: sorgu.get("azami_fiyat") ? Number(sorgu.get("azami_fiyat")) : null,
        p_only_discounted: sorgu.get("sadece_indirimli") === "1",
        p_only_available: sorgu.get("sadece_stokta") === "1",
        p_sort: metin(sorgu, "sirala") ?? "onerilen",
      };
    },
  },
  arama: {
    fonksiyon: "arc_storefront_search_index",
    aciklama: "Arama dizini: ad, slug ve etiketler. Eşleştirmeyi kendi sitenizde yapın; dizin sayfalanır.",
    parametreler: (sorgu, konak) => {
      const { limit, offset } = sayfaSiniri(sorgu);
      /* Dizin tek sayfada bitmiyor; müşteri offset'i ilerletmeli. */
      return { p_host: konak, p_limit: Math.max(limit, VARSAYILAN_SAYFA), p_offset: offset };
    },
  },
  ayarlar: {
    fonksiyon: "arc_storefront_settings",
    aciklama: "Kargo ücreti, ücretsiz kargo eşiği, havale indirimi. Tutarlar KURUŞ.",
    parametreler: (_sorgu, konak) => ({ p_host: konak }),
  },
};


/*
  GÖRSEL YOLLARI MUTLAK ADRESE ÇEVRİLİYOR.

  Veritabanı göreli yol tutuyor ("<kurum>/<urun>/image-01.png")
  çünkü kova adresi değişebilir ve her satıra gömmek onu taşınmaz
  kılardı. Ama API'nin müşterisi bizim depolama düzenimizi bilmek
  ZORUNDA DEĞİL: göreli yol dönersek her geliştirici aynı soruyu
  sorar ve yanlış birleştiren herkes kırık görsel yayınlar.

  Mutlak adresler `gorseller` / `gorsel` olarak EKLENİYOR, göreli
  alanlar silinmiyor: biçimi değiştirmek, bugün çalışan bir
  entegrasyonu kırmak olurdu.
*/
const KOVA = "arc-product-images";

export const gorselAdresi = (taban: string, yol: string): string =>
  yol.startsWith("http") ? yol : `${taban.replace(/\/$/, "")}/storage/v1/object/public/${KOVA}/${yol}`;

export function gorselleriMutlaklastir(veri: unknown, taban: string): unknown {
  if (Array.isArray(veri)) return veri.map((satir) => gorselleriMutlaklastir(satir, taban));
  if (!veri || typeof veri !== "object") return veri;

  const satir = { ...(veri as Record<string, unknown>) };

  const yollar = satir.image_paths;
  if (Array.isArray(yollar)) {
    satir.gorseller = yollar
      .filter((y): y is string => typeof y === "string" && y.length > 0)
      .map((y) => gorselAdresi(taban, y));
  }

  const yol = satir.image_path;
  if (typeof yol === "string" && yol.length > 0) satir.gorsel = gorselAdresi(taban, yol);

  return satir;
}
