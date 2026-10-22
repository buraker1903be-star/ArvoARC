import "server-only";
import { requireTenant } from "@/lib/tenant";
import { createServiceClient } from "@/lib/paytr/service-client";
import {
  canliOzet,
  type CanliOzet,
  type Nokta,
  type Olay,
  type ZiyaretSatiri,
} from "@/lib/canli-ozet";

/**
 * Canlı ziyaret verisi.
 *
 * OKUMA SERVİS ANAHTARIYLA: `arc_visits` RLS açık ve POLİTİKASIZ,
 * çağıranın yetkisiyle okunursa sessizce BOŞ döner ve ekran "hiç
 * ziyaret yok" der — en kötü hata türü, çünkü doğru görünür.
 * Mağaza kapsamı sorguda ve requireTenant'tan geliyor.
 *
 * HESAP BURADA DEĞİL: bütün sayılar `lib/canli-ozet` içinde ve saf,
 * testi var. Bu dosya yalnızca okuyup ürün adlarını ekliyor —
 * zaman eşikleri (5 dk, 1 saat, 30 dk) ve konuma göre toplama
 * Supabase'e bağlı bir dosyada kalsa sınanamazdı.
 */

export type { Nokta, Olay };

export type CanliVeri = Omit<CanliOzet, "urunSayimi"> & {
  urunler: Array<{ slug: string; ad: string; adet: number }>;
  okunamadi: boolean;
};

const BOS: CanliVeri = {
  noktalar: [],
  suAn: 0,
  gunluk: 0,
  sonSaatZiyaretci: 0,
  sonSaatGoruntuleme: 0,
  sonSaatUrun: 0,
  akis: [],
  acikSayfalar: [],
  ulkeler: [],
  sehirler: [],
  kaynaklar: [],
  urunler: [],
  okunamadi: true,
};

export async function canliVeriOku(): Promise<CanliVeri> {
  const { organization } = await requireTenant();
  const servis = createServiceClient();

  const gunOnce = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  /*
    TEK SORGU, SON 24 SAAT. Sayfa başına birkaç ayrı sayım sorgusu
    atmak yerine satırlar bir kez okunup bellekte özetleniyor; 24
    saatlik hacim bu mağaza için birkaç bin satır.

    SIRA ÖNEMLİ: özet akışı bu sıraya göre kuruyor (yeniden eskiye).
  */
  const { data, error } = await servis
    .from("arc_visits")
    .select("path, product_slug, country, city, lat, lon, ip_hash, source, created_at")
    .eq("organization_id", organization.id)
    .gte("created_at", gunOnce)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    console.error("Canlı ziyaretler okunamadı:", error.message);
    return BOS;
  }

  const { urunSayimi, ...ozet } = canliOzet((data ?? []) as ZiyaretSatiri[], Date.now());

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
      ((urunler ?? []) as Array<{ slug: string; name: string }>).map((u) => [u.slug, u.name]),
    );
  }

  return {
    ...ozet,
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
