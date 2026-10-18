import "server-only";
import { requireTenant } from "@/lib/tenant";
import { createServiceClient } from "@/lib/paytr/service-client";

/**
 * Canlı ziyaret verisi.
 *
 * OKUMA SERVİS ANAHTARIYLA: `arc_visits` RLS açık ve POLİTİKASIZ,
 * çağıranın yetkisiyle okunursa sessizce BOŞ döner ve ekran "hiç
 * ziyaret yok" der — en kötü hata türü, çünkü doğru görünür.
 * Mağaza kapsamı sorguda ve requireTenant'tan geliyor.
 */

export type Nokta = {
  lat: number;
  lon: number;
  city: string | null;
  country: string | null;
  dakika: number;
};

export type CanliVeri = {
  /** Son bir saatin konumlu ziyaretleri (harita noktaları). */
  noktalar: Nokta[];
  /** Son beş dakikada ayrı ziyaretçi sayısı. */
  suAn: number;
  /** Son yirmi dört saatte sayfa açılışı. */
  gunluk: number;
  ulkeler: Array<{ ad: string; adet: number }>;
  sehirler: Array<{ ad: string; adet: number }>;
  urunler: Array<{ slug: string; ad: string; adet: number }>;
  okunamadi: boolean;
};

const BOS: CanliVeri = {
  noktalar: [],
  suAn: 0,
  gunluk: 0,
  ulkeler: [],
  sehirler: [],
  urunler: [],
  okunamadi: true,
};

/** En çok tekrar edenler; eşitlikte ada göre kararlı sıra. */
function enCok<T extends string>(
  degerler: Array<T | null>,
  kac: number,
): Array<{ ad: T; adet: number }> {
  const sayac = new Map<T, number>();
  for (const deger of degerler) {
    if (!deger) continue;
    sayac.set(deger, (sayac.get(deger) ?? 0) + 1);
  }
  return [...sayac.entries()]
    .map(([ad, adet]) => ({ ad, adet }))
    .sort((a, b) => b.adet - a.adet || a.ad.localeCompare(b.ad, "tr"))
    .slice(0, kac);
}

export async function canliVeriOku(): Promise<CanliVeri> {
  const { organization } = await requireTenant();
  const servis = createServiceClient();

  const gunOnce = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  /*
    TEK SORGU, SON 24 SAAT. Sayfa başına birkaç ayrı sayım
    sorgusu atmak yerine satırlar bir kez okunup bellekte
    özetleniyor; 24 saatlik hacim bu mağaza için birkaç bin satır.
    Tavan aşılırsa ekranda yazıyor (kapsam notu).
  */
  const { data, error } = await servis
    .from("arc_visits")
    .select("path, product_slug, country, city, lat, lon, ip_hash, created_at")
    .eq("organization_id", organization.id)
    .gte("created_at", gunOnce)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    console.error("Canlı ziyaretler okunamadı:", error.message);
    return BOS;
  }

  type Satir = {
    path: string;
    product_slug: string | null;
    country: string | null;
    city: string | null;
    lat: number | null;
    lon: number | null;
    ip_hash: string | null;
    created_at: string;
  };
  const satirlar = (data ?? []) as Satir[];
  const simdi = Date.now();

  const noktalar: Nokta[] = [];
  const sonBesDakika = new Set<string>();
  for (const satir of satirlar) {
    const yas = (simdi - Date.parse(satir.created_at)) / 60000;
    if (yas <= 5 && satir.ip_hash) sonBesDakika.add(satir.ip_hash);
    /* Haritada son bir saat: daha eskisi "canlı" değil, geçmiş. */
    if (yas <= 60 && satir.lat !== null && satir.lon !== null) {
      noktalar.push({
        lat: satir.lat,
        lon: satir.lon,
        city: satir.city,
        country: satir.country,
        dakika: Math.max(0, Math.round(yas)),
      });
    }
  }

  const urunSayimi = enCok(
    satirlar.map((s) => s.product_slug),
    8,
  );

  /* Ürün adları: slug listesi kısa, tek sorgu yetiyor. */
  let adlar = new Map<string, string>();
  if (urunSayimi.length > 0) {
    const { data: urunler } = await servis
      .from("arc_products")
      .select("slug, name")
      .eq("organization_id", organization.id)
      .in(
        "slug",
        urunSayimi.map((u) => u.ad),
      );
    adlar = new Map(
      ((urunler ?? []) as Array<{ slug: string; name: string }>).map((u) => [
        u.slug,
        u.name,
      ]),
    );
  }

  return {
    noktalar,
    suAn: sonBesDakika.size,
    gunluk: satirlar.length,
    ulkeler: enCok(
      satirlar.map((s) => s.country),
      6,
    ),
    sehirler: enCok(
      satirlar.map((s) => s.city),
      6,
    ),
    urunler: urunSayimi.map((u) => ({
      slug: u.ad,
      /* Adı bulunamayan ürün silinmiş olabilir; slug'ı gösteriyoruz
         ki sayı kaybolmasın. */
      ad: adlar.get(u.ad) ?? u.ad,
      adet: u.adet,
    })),
    okunamadi: false,
  };
}
