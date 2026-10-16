import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canliKarar, sayfaStoklari, type CanliKarar } from "@/lib/supplier/tarzyeri-sayfa";

/*
  ÖDEME ANINDA TARZYERİ DOĞRULAMASI (16.10.2026).

  On dakikalık tarama ne kadar sıkılaşırsa sıkılaşsın, iki tarama
  arasında Tarzyeri'de tükenen ürün bizde satılabiliyordu — üstelik
  Tarzyeri'nin XML'i kendisi de canlı değil (lib/supplier/tarzyeri-sayfa).
  O gün iki sipariş tedarikçide kapanmış ürünlere düştü.

  Sipariş açılmadan önce sepetteki her Tarzyeri ürünü, Tarzyeri'nin
  CANLI ürün sayfasından doğrulanıyor:
    - tükendiyse sipariş açılmıyor, ürün bizde de ANINDA kapanıyor
      (sonraki taramayı beklemeden; vitrin hemen "tükendi" gösteriyor);
    - stoktaysa bizdeki sayı da canlı değere çekiliyor;
    - doğrulanamıyorsa (Tarzyeri cevap vermiyor, sayfa düzeni değişmiş,
      ürünün sayfa adresi henüz yok) sipariş AÇILMIYOR. Kurum sahibinin
      kararı: tükenmiş ürünü satmaktansa birkaç dakika satış kaçırmak.
*/

const ZAMAN_ASIMI_MS = 4000;
const IZINLI_ALANLAR = new Set(["www.tarzyeri.com", "tarzyeri.com"]);

type SepetKalemi = { sku: string; quantity: number };
type Sonuc = { ok: true } | { ok: false; status: number; error: string; message: string };

type SayfaSonucu = { durumKodu: number; stoklar: ReturnType<typeof sayfaStoklari> } | null;

/*
  Adres tedarikçinin akışından geliyor, yani dış veri: sunucu yalnızca
  Tarzyeri'nin kendi alan adına istek atar. Yönlendirme sonrası adres de
  denetlenir.
*/
function izinliMi(adres: string) {
  try {
    const url = new URL(adres);
    return url.protocol === "https:" && IZINLI_ALANLAR.has(url.hostname);
  } catch {
    return false;
  }
}

async function sayfaOku(adres: string): Promise<SayfaSonucu> {
  if (!izinliMi(adres)) return null;
  try {
    const yanit = await fetch(adres, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
      headers: {
        Accept: "text/html",
        "Accept-Language": "tr-TR,tr;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      },
    });
    if (yanit.url && !izinliMi(yanit.url)) return null;
    if (!yanit.ok) return { durumKodu: yanit.status, stoklar: null };
    return { durumKodu: yanit.status, stoklar: sayfaStoklari(await yanit.text()) };
  } catch (hata) {
    console.error("Tarzyeri ürün sayfası okunamadı:", adres, (hata as Error).message);
    return null;
  }
}

export async function tarzyeriSepetiniDogrula(
  supabase: SupabaseClient,
  organizationId: string,
  kalemler: SepetKalemi[],
): Promise<Sonuc> {
  const skular = [...new Set(kalemler.map((k) => k.sku))];
  if (!skular.length) return { ok: true };

  const bekleyin = {
    ok: false as const,
    status: 503,
    error: "stok_dogrulanamadi",
    message: "Bazı ürünlerin stoğu şu an doğrulanamadı. Lütfen birkaç dakika sonra tekrar deneyin.",
  };

  const [{ data: varyantlar, error: varyantHatasi }, { data: tedarikci, error: tedarikciHatasi }] = await Promise.all([
    supabase
      .from("arc_product_variants")
      .select("sku,title,supplier_sku,arc_products(name,metadata)")
      .eq("organization_id", organizationId)
      .eq("supplier", "tarzyeri")
      .in("sku", skular),
    supabase
      .from("arc_suppliers")
      .select("stock_buffer")
      .eq("organization_id", organizationId)
      .eq("code", "tarzyeri")
      .maybeSingle(),
  ]);

  /* Okunamayan bir engel "engel yok" demek değil. */
  if (varyantHatasi || tedarikciHatasi) {
    console.error("Tarzyeri doğrulaması okunamadı:", varyantHatasi?.message ?? tedarikciHatasi?.message);
    return bekleyin;
  }
  if (!varyantlar?.length) return { ok: true };

  const tampon = (tedarikci as { stock_buffer?: number | null } | null)?.stock_buffer ?? 0;
  const satirlar = (varyantlar as unknown as Array<{
    sku: string;
    title: string | null;
    supplier_sku: string | null;
    arc_products: { name: string | null; metadata: Record<string, unknown> | null } | null;
  }>).map((v) => ({
    sku: v.sku,
    barkod: (v.supplier_sku ?? v.sku).trim(),
    ad: [v.arc_products?.name, v.title].filter(Boolean).join(" · ") || v.sku,
    adres: String(v.arc_products?.metadata?.supplier_link ?? "").trim(),
    istenen: kalemler.filter((k) => k.sku === v.sku).reduce((t, k) => t + k.quantity, 0),
  }));

  // Aynı ürünün iki bedeni tek sayfa isteğiyle doğrulanır.
  const adresler = [...new Set(satirlar.map((s) => s.adres).filter(Boolean))];
  const sayfalar = new Map<string, SayfaSonucu>(
    await Promise.all(adresler.map(async (a) => [a, await sayfaOku(a)] as const)),
  );

  const kararlar = satirlar.map((s) => ({
    ...s,
    karar: (s.adres ? canliKarar(sayfalar.get(s.adres) ?? null, s.barkod, s.istenen, tampon) : { durum: "bilinmiyor" }) as CanliKarar,
  }));

  /* Öğrenilen canlı sayı bizde de yazılır: tükenen ürün vitrinde hemen kapanır. */
  const yazilacak = kararlar
    .filter((k) => k.karar.durum !== "bilinmiyor")
    .map((k) => ({ sku: k.barkod, stock: (k.karar as { satilabilir: number }).satilabilir }));
  if (yazilacak.length) {
    const { error } = await supabase.rpc("arc_set_supplier_variant_stock", {
      p_organization_id: organizationId,
      p_supplier: "tarzyeri",
      p_rows: yazilacak,
    });
    // Yazılamaması kararı değiştirmiyor; sonraki tarama da aynı sayıyı yazacak.
    if (error) console.error("Canlı stok yazılamadı:", error.message);
  }

  const tukenen = kararlar.filter((k) => k.karar.durum === "tukendi");
  const yetersiz = kararlar.filter((k) => k.karar.durum === "yetersiz");
  if (tukenen.length || yetersiz.length) {
    const parcalar = [
      ...tukenen.map((k) => `${k.ad} tükendi`),
      ...yetersiz.map((k) => `${k.ad} için en fazla ${(k.karar as { satilabilir: number }).satilabilir} adet kaldı`),
    ];
    return {
      ok: false,
      status: 409,
      error: "stok_tukendi",
      message: `${parcalar.join("; ")}. Lütfen sepetinizi güncelleyip tekrar deneyin.`,
    };
  }

  const bilinmeyen = kararlar.filter((k) => k.karar.durum === "bilinmiyor");
  if (bilinmeyen.length) {
    console.error(
      "Tarzyeri stoğu doğrulanamadı, sipariş açılmadı:",
      bilinmeyen.map((k) => `${k.sku}${k.adres ? "" : " (sayfa adresi yok)"}`).join(", "),
    );
    return bekleyin;
  }

  return { ok: true };
}
