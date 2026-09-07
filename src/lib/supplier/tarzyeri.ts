import "server-only";
import { XMLParser } from "fast-xml-parser";

/**
 * Tarzyeri XML akışının ayrıştırılması.
 *
 * Akışın yapısı:
 *   - Her <product> tek bir RENK'tir ("... - Beyaz", "... - Mor")
 *   - <variants> içindeki her varyant bir BEDEN'dir
 *   - Ürün seviyesindeki <barcode> BENZERSİZ DEĞİL (aynı değer
 *     birçok üründe geçiyor); anahtar olarak <productCode>
 *     kullanılır
 *   - Varyant <barcode> benzersizdir; SKU olarak birebir uygun
 *   - <price> satış fiyatı değil, KDV dahil ALIŞ maliyetidir
 */

export type SupplierVariant = {
  sku: string;
  color: string;
  size: string;
  quantity: number;
};

export type SupplierProduct = {
  productCode: string;
  name: string;
  description: string;
  detailHtml: string;
  mainCategory: string;
  topCategory: string;
  subCategory: string;
  costPrice: number; // kuruş
  listPrice: number; // kuruş
  taxRate: number;
  images: string[];
  variants: SupplierVariant[];
  active: boolean;
};

const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  // Tek varyantlı üründe dizi yerine nesne dönmesini engeller.
  isArray: (name) => name === "product" || name === "variant",
});

/** Kuruşa çevirir: "199.65" → 19965 */
function toKurus(value: unknown): number {
  const num = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export async function fetchTarzyeri(url: string): Promise<SupplierProduct[]> {
  const response = await fetch(url, {
    // Akış büyük; önbelleğe alınmaz.
    cache: "no-store",
    headers: { Accept: "application/xml, text/xml" },
  });

  if (!response.ok) {
    throw new Error(`XML alınamadı: ${response.status}`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml) as {
    products?: { product?: Record<string, unknown>[] };
  };

  const rows = parsed.products?.product ?? [];

  return rows.map((row) => {
    // image1 … image16
    const images: string[] = [];
    for (let i = 1; i <= 16; i += 1) {
      const value = text(row[`image${i}`]);
      if (value.startsWith("http")) images.push(value);
    }

    const rawVariants =
      (row.variants as { variant?: Record<string, unknown>[] })?.variant ?? [];

    const variants: SupplierVariant[] = rawVariants
      .map((variant) => ({
        sku: text(variant.barcode),
        // name1/value1 renk, name2/value2 beden. Akışta bu sıra
        // sabit ama yine de etikete bakarak ayırıyoruz.
        color:
          text(variant.name1).toLocaleLowerCase("tr-TR") === "renk"
            ? text(variant.value1)
            : text(variant.value2),
        size:
          text(variant.name2).toLocaleLowerCase("tr-TR") === "beden"
            ? text(variant.value2)
            : text(variant.value1),
        quantity: Number(text(variant.quantity)) || 0,
      }))
      .filter((variant) => variant.sku.length > 0);

    return {
      productCode: text(row.productCode),
      name: text(row.name),
      description: text(row.description),
      detailHtml: text(row.detail),
      mainCategory: text(row.main_category),
      topCategory: text(row.top_category),
      subCategory: text(row.sub_category),
      costPrice: toKurus(row.price),
      listPrice: toKurus(row.listPrice),
      taxRate: Number(text(row.tax)) || 0.1,
      images,
      variants,
      active: text(row.active) === "1",
    };
  });
}

/** Ürün adından URL uyumlu slug üretir. */
export function slugify(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}
