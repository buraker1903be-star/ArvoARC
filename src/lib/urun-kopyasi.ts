/*
  ÜRÜN KOPYALAMA — adlandırma ve kod üretimi.

  Benzer ürün eklemenin en kısa yolu var olanı çoğaltmak: on beş alanı
  (marka, tür, SEO, Merchant bilgileri) yeniden doldurmak yerine
  değişen iki alanı düzeltmek. Shopify'daki "Duplicate"in karşılığı
  yoktu.

  KOPYANIN SKU'LARI YENİ OLMAK ZORUNDA. SKU yalnızca ürün içinde değil,
  SALON GENELİNDE kimlik gibi kullanılıyor:

    stok/actions.ts   .eq("sku", …).maybeSingle() — aynı koddan iki
                      varyant olursa stok girişi/çıkışı hata veriyor,
    fiyat-aktarimi    yazmayı .eq("sku", …) ile yapıyor; iki kayda
                      birden yazardı (28.09.2026'da canlıda bu oldu).

  Yani kaynağın kodlarını olduğu gibi taşımak, kopyayı oluşturur
  oluşturmaz stok ekranını ve fiyat aktarımını bozardı. Kodlar
  "-K" ekiyle üretiliyor ve boş olan ilk aday seçiliyor.

  Saf dosya; testi tests/urun-kopyasi.test.ts.
*/

import { slugla } from "./slug";

/** Kopya adresinin tabanı: "kupa" → "kupa-kopya". */
export const kopyaSlugTabani = (ad: string, mevcutSlug?: string | null): string =>
  `${slugla(mevcutSlug || ad, 140) || "urun"}-kopya`;

/**
 * Kopyanın adı, seçilen adresle AYNI sırayı taşıyor: "Kupa (kopya)",
 * ikincisinde "Kupa (kopya 2)". Adres "kupa-kopya-2" iken adın
 * "(kopya)" kalması, listede iki özdeş satır gösterirdi.
 */
export function kopyaAdi(ad: string, sira: number): string {
  const taban = String(ad ?? "").trim() || "Ürün";
  const ek = sira > 1 ? `(kopya ${sira})` : "(kopya)";
  /* 200: arc_products.name alanının sınırı. Ek her zaman korunuyor;
     kırpılan taraf ad, çünkü kopyanın kopya olduğu bilgisi daha değerli. */
  return `${taban.slice(0, 200 - ek.length - 1)} ${ek}`;
}

/** Adresin sonundaki sırayı okur: "kupa-kopya" → 1, "kupa-kopya-3" → 3. */
export function slugSirasi(taban: string, slug: string): number {
  if (slug === taban) return 1;
  const kalan = slug.startsWith(`${taban}-`) ? slug.slice(taban.length + 1) : "";
  const sayi = Number.parseInt(kalan, 10);
  return Number.isInteger(sayi) && sayi > 1 && String(sayi) === kalan ? sayi : 0;
}

/** Bir SKU için denenecek kopya kodları; sırayla ilk boş olan seçiliyor. */
export function skuAdaylari(sku: string, enFazla = 20): string[] {
  const taban = String(sku ?? "").trim().toUpperCase();
  if (!taban) return [];
  const adaylar = [`${taban}-K`];
  for (let sayac = 2; sayac <= enFazla; sayac += 1) adaylar.push(`${taban}-K${sayac}`);
  return adaylar;
}

export type KopyaKodlari = { esleme: Map<string, string>; cozulemeyen: string[] };

/**
 * Kaynak kodlardan kopya kodları üretir. `kullanilan`, salonda ZATEN
 * olan kodlar; seçilen her kod da kümeye ekleniyor, yoksa aynı toplu
 * eklemedeki iki varyant aynı kodu alabilirdi.
 */
export function kopyaKodlari(kaynakSkular: string[], kullanilan: Iterable<string>): KopyaKodlari {
  const alinmis = new Set([...kullanilan].map((sku) => String(sku ?? "").trim().toUpperCase()).filter(Boolean));
  const esleme = new Map<string, string>();
  const cozulemeyen: string[] = [];
  for (const ham of kaynakSkular) {
    const kaynak = String(ham ?? "").trim().toUpperCase();
    if (!kaynak || esleme.has(kaynak)) continue;
    const secilen = skuAdaylari(kaynak).find((aday) => !alinmis.has(aday));
    /*
      Yirmi adayın da dolu olması, aynı üründen yirmi kopya çıkarılmış
      demek. Sessizce üretmek yerine BİLDİRİLİYOR: kullanıcı ya eski
      kopyaları temizler ya kodu elle verir.
    */
    if (!secilen) { cozulemeyen.push(kaynak); continue; }
    alinmis.add(secilen);
    esleme.set(kaynak, secilen);
  }
  return { esleme, cozulemeyen };
}
