import { sellableStock } from "@/lib/supplier-stock";

/*
  TARZYERİ'NİN CANLI STOĞU: ÜRÜN SAYFASI (16.10.2026).

  XML akışı canlı değil: 16.10.2026'da 25 dakika arayla iki kez indirildi,
  14.902 varyantın hiçbirinde tek sayı değişmedi. Akışı ne kadar sık
  okursak okuyalım Tarzyeri'nin onu yeniden ürettiği andan daha taze
  olamıyoruz; o gün iki sipariş tedarikçide çoktan tükenmiş ürünlere düştü.

  Ürün sayfası ise canlı: `const PRODUCT_PAGE_DATA = { … variants: {…} }`
  bloğunda her barkodun `in_stock` ve `quantity` değeri var. Aynı gün
  rastgele 25 üründe sınandı: her sayfa ürünün bütün barkodlarını taşıyor,
  sayılar akışla birebir, sayfa ~0,25 saniyede geliyor. Ödeme anında
  sepetteki Tarzyeri ürünleri buradan doğrulanıyor.

  Bu dosya saf: ağa çıkmıyor, birim testi sayfa örnekleriyle sınıyor.
*/

export type SayfaStogu = { inStock: boolean; quantity: number };

/**
 * Sayfadaki barkod → stok tablosu. Blok bulunamaz ya da okunamazsa
 * `null`: bu "stok yok" DEĞİL, "bilinmiyor" demek — Tarzyeri sayfa
 * düzenini değiştirmiş olabilir.
 */
export function sayfaStoklari(html: string): Map<string, SayfaStogu> | null {
  const bas = html.indexOf("PRODUCT_PAGE_DATA");
  if (bas < 0) return null;
  const anahtar = html.indexOf("variants:", bas);
  if (anahtar < 0) return null;
  const ac = html.indexOf("{", anahtar);
  if (ac < 0) return null;

  // Nesneyi parantez dengesiyle kes: içindeki metinler { } taşıyabilir.
  let derinlik = 0;
  let dizgide = false;
  let kacis = false;
  let son = -1;
  for (let i = ac; i < html.length; i += 1) {
    const c = html[i];
    if (dizgide) {
      if (kacis) kacis = false;
      else if (c === "\\") kacis = true;
      else if (c === '"') dizgide = false;
      continue;
    }
    if (c === '"') dizgide = true;
    else if (c === "{") derinlik += 1;
    else if (c === "}") {
      derinlik -= 1;
      if (derinlik === 0) { son = i; break; }
    }
  }
  if (son < 0) return null;

  let veri: unknown;
  try {
    veri = JSON.parse(html.slice(ac, son + 1));
  } catch {
    return null;
  }

  const tablo = new Map<string, SayfaStogu>();
  const gez = (dugum: unknown) => {
    if (!dugum || typeof dugum !== "object") return;
    const kayit = dugum as Record<string, unknown>;
    if (typeof kayit.barcode === "string") {
      const adet = Number(kayit.quantity);
      tablo.set(kayit.barcode.trim(), {
        inStock: kayit.in_stock !== false,
        quantity: Number.isFinite(adet) ? adet : 0,
      });
      return;
    }
    for (const alt of Object.values(kayit)) gez(alt);
  };
  gez((veri as { summary?: unknown }).summary ?? veri);
  return tablo;
}

export type CanliKarar =
  | { durum: "uygun"; satilabilir: number }
  | { durum: "yetersiz"; satilabilir: number }
  | { durum: "tukendi"; satilabilir: 0 }
  | { durum: "bilinmiyor" };

/**
 * Tek sepet kalemi için karar.
 *
 * - Sayfa 404 döndüyse ürün Tarzyeri'den kaldırılmıştır: tükendi.
 * - Sayfa okundu ama barkod yoksa varyant kaldırılmıştır: tükendi.
 * - Sayfa okunamadıysa (ağ, zaman aşımı, düzen değişikliği): bilinmiyor.
 *   Kurum sahibinin kararı (16.10.2026): doğrulanamayan ürün SATILMAZ.
 *
 * Tampon kuralı tarama ile aynı (sellableStock): tedarikçide tamponun
 * altına düşen miktar satışa kapalı sayılır.
 */
export function canliKarar(
  sayfa: { durumKodu: number; stoklar: Map<string, SayfaStogu> | null } | null,
  barkod: string,
  istenen: number,
  tampon: number | null | undefined,
): CanliKarar {
  if (!sayfa) return { durum: "bilinmiyor" };
  if (sayfa.durumKodu === 404 || sayfa.durumKodu === 410) return { durum: "tukendi", satilabilir: 0 };
  if (sayfa.durumKodu < 200 || sayfa.durumKodu >= 300 || !sayfa.stoklar) return { durum: "bilinmiyor" };

  const kayit = sayfa.stoklar.get(barkod.trim());
  if (!kayit || !kayit.inStock) return { durum: "tukendi", satilabilir: 0 };

  const satilabilir = sellableStock(kayit.quantity, tampon);
  if (satilabilir <= 0) return { durum: "tukendi", satilabilir: 0 };
  if (satilabilir < istenen) return { durum: "yetersiz", satilabilir };
  return { durum: "uygun", satilabilir };
}
