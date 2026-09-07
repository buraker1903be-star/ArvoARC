import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchTarzyeri, slugify } from "@/lib/supplier/tarzyeri";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Büyük akış; varsayılan süre yetmez.
// Vercel Hobby planında üst sınır 60 saniye; aktarım bu yüzden
// parçalara bölünüyor.
export const maxDuration = 60;

/** Tek çağrıda işlenecek ürün sayısı. */
const BATCH = 120;

/**
 * Tedarikçi XML içe aktarma.
 *
 * İki modda çalışır:
 *   - `?mod=tam`  → ürün, varyant, görsel ve fiyat: hepsi güncellenir
 *   - `?mod=stok` → yalnızca stok ve maliyet (varsayılan, hızlı)
 *
 * Stok modu zamanlanmış görev için tasarlandı; günde birkaç kez
 * çalışıp stoğu biten varyantları kapatır. Bu olmadan tedarikçide
 * tükenen ürünü satmaya devam edersiniz.
 *
 * Görseller indirilip kopyalanmaz; tedarikçinin CDN adresleri
 * doğrudan kullanılır. 4.000 ürünün görselini taşımak saatler
 * sürer ve depolama maliyeti üretir.
 */

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase ortam değişkenleri eksik");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Zamanlanmış stok senkronu.
 *
 * Vercel Cron yalnızca GET isteği atar ve `Authorization: Bearer
 * <CRON_SECRET>` başlığı gönderir. Elle tetikleme için POST
 * kullanılır; ikisi de aynı işi yapar.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");

  if (!cronSecret || header !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }

  // Zamanlanmış çalıştırma her zaman stok modunda; tam aktarım
  // elle tetiklenir çünkü uzun sürer ve ürün adlarını ezer.
  return runSync("stok");
}

export async function POST(request: Request) {
  // Basit koruma: uç nokta herkese açık olmamalı.
  const secret = process.env.SUPPLIER_SYNC_SECRET;
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("anahtar");

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }

  const mode =
    new URL(request.url).searchParams.get("mod") === "tam" ? "tam" : "stok";

  return runSync(mode);
}

async function runSync(mode: "tam" | "stok") {
  const supabase = serviceClient();

  // --- Tedarikçi ayarları ------------------------------------
  const { data: suppliers, error: supplierError } = await supabase
    .from("arc_suppliers")
    .select("*, organizations!inner(slug)")
    .eq("code", "tarzyeri")
    .eq("organizations.slug", "arvoculture")
    .limit(1);

  const rule = suppliers?.[0];
  if (supplierError || !rule) {
    return NextResponse.json(
      { error: "tedarikci_bulunamadi", detail: supplierError?.message },
      { status: 400 },
    );
  }

  if (!rule.feed_url) {
    return NextResponse.json({ error: "feed_url_tanimsiz" }, { status: 400 });
  }

  // --- XML --------------------------------------------------
  let products;
  try {
    products = await fetchTarzyeri(rule.feed_url);
  } catch (error) {
    return NextResponse.json(
      { error: "xml_okunamadi", detail: (error as Error).message },
      { status: 502 },
    );
  }

  const orgId = rule.organization_id as string;

  /*
    Parça parça işleme. Her çağrı `sync_cursor` konumundan başlar,
    BATCH kadar ürün işler ve imleci ilerletir. Liste bittiğinde
    imleç sıfırlanır.
  */
  const start = mode === "tam" ? (rule.sync_cursor ?? 0) : 0;
  const slice =
    mode === "tam"
      ? products.slice(start, start + BATCH)
      : products;

  const stats = {
    toplam: products.length,
    baslangic: start,
    okunan: slice.length,
    yeniUrun: 0,
    guncellenenUrun: 0,
    yeniVaryant: 0,
    guncellenenVaryant: 0,
    pasifVaryant: 0,
    atlanan: 0,
    hata: [] as string[],
  };

  // Mevcut ürünleri tek seferde çekip eşleştiriyoruz; ürün başına
  // sorgu atmak 4.000 üründe dakikalar sürer.
  /*
    Supabase `select` varsayılan olarak en fazla 1000 satır
    döndürür. Sınırı aşan ürünler "yok" sanılıp yeniden eklenmeye
    çalışılıyor ve slug çakışması veriyordu. Sayfalayarak tamamı
    okunur.
  */
  const existing: Array<{
    id: string;
    supplier_product_code: string | null;
    slug: string;
  }> = [];

  for (let page = 0; page < 50; page += 1) {
    const from = page * 1000;
    const { data, error } = await supabase
      .from("arc_products")
      .select("id, supplier_product_code, slug")
      .eq("organization_id", orgId)
      .eq("supplier", "tarzyeri")
      .range(from, from + 999);

    if (error) {
      return NextResponse.json(
        { error: "urunler_okunamadi", detail: error.message },
        { status: 500 },
      );
    }

    existing.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const byCode = new Map(
    existing.map((row) => [row.supplier_product_code, row]),
  );

  for (const product of slice) {
    if (!product.productCode || product.variants.length === 0) {
      stats.atlanan += 1;
      continue;
    }

    try {
      const known = byCode.get(product.productCode);
      let productId = known?.id as string | undefined;

      // --- Ürün ---------------------------------------------
      if (mode === "tam" || !productId) {
        const payload = {
          organization_id: orgId,
          name: product.name,
          /*
            Slug ürün koduyla sonlanır; tedarikçide aynı adı
            taşıyan farklı ürünler olduğu için ad tek başına
            benzersiz değil.
          */
          slug:
            known?.slug ??
            `${slugify(product.name)}-${product.productCode.toLowerCase()}`,
          description: product.detailHtml || product.description,
          status: product.active
            ? rule.publish_directly
              ? "active"
              : "draft"
            : "archived",
          supplier: "tarzyeri",
          supplier_product_code: product.productCode,
          supplier_synced_at: new Date().toISOString(),
          metadata: {
            vendor: rule.brand_override ?? "ArvoCulture",
            product_type: product.subCategory,
            subtitle: product.description,
            image_paths: product.images,
            supplier_category: `${product.mainCategory} > ${product.topCategory} > ${product.subCategory}`,
          },
        };

        if (productId) {
          await supabase.from("arc_products").update(payload).eq("id", productId);
          stats.guncellenenUrun += 1;
        } else {
          const { data: inserted, error } = await supabase
            .from("arc_products")
            .insert(payload)
            .select("id")
            .single();

          if (error || !inserted) throw error ?? new Error("ürün eklenemedi");
          productId = inserted.id;
          stats.yeniUrun += 1;
        }
      }

      if (!productId) {
        stats.atlanan += 1;
        continue;
      }

      // --- Varyantlar ---------------------------------------
      const { data: currentVariants } = await supabase
        .from("arc_product_variants")
        .select("id, supplier_sku")
        .eq("organization_id", orgId)
        .eq("product_id", productId);

      const bySku = new Map(
        (currentVariants ?? []).map((row) => [row.supplier_sku, row.id]),
      );

      const seen = new Set<string>();

      for (const variant of product.variants) {
        seen.add(variant.sku);

        // Satış fiyatı sunucuda hesaplanır; maliyet ayrıca saklanır.
        const { data: priceRow } = await supabase.rpc("arc_sale_price", {
          p_cost: product.costPrice,
          p_margin: rule.margin_percent,
          p_shipping: rule.shipping_markup,
          p_round: rule.round_to_kurus,
        });

        const salePrice = Number(priceRow) || product.costPrice;
        const variantId = bySku.get(variant.sku);

        const base = {
          organization_id: orgId,
          product_id: productId,
          sku: variant.sku,
          supplier: "tarzyeri",
          supplier_sku: variant.sku,
          cost_price: product.costPrice,
          price: salePrice,
          stock: variant.quantity,
          updated_at: new Date().toISOString(),
        };

        if (variantId) {
          // Stok modunda ad ve seçenekler değiştirilmez.
          /*
            `options` sütunu bu şemada yok; renk ve beden başlıkta
            birleştiriliyor. Varsayılan bir sütun adı kullanmak
            varyant eklemesini sessizce başarısız kılıyordu.
          */
          const patch =
            mode === "tam"
              ? { ...base, title: `${variant.color} / ${variant.size}` }
              : {
                  stock: variant.quantity,
                  cost_price: product.costPrice,
                  price: salePrice,
                  updated_at: base.updated_at,
                };

          const { error: updateError } = await supabase
            .from("arc_product_variants")
            .update(patch)
            .eq("id", variantId);

          // Hata artık yutulmuyor; aksi hâlde sayaç artıyor ama
          // veritabanına hiçbir şey yazılmıyordu.
          if (updateError) throw updateError;
          stats.guncellenenVaryant += 1;
        } else {
          const { error: insertError } = await supabase
            .from("arc_product_variants")
            .insert({ ...base, title: `${variant.color} / ${variant.size}` });

          if (insertError) throw insertError;
          stats.yeniVaryant += 1;
        }
      }

      // Tedarikçiden düşen varyantların stoğu sıfırlanır.
      // Silmiyoruz: geçmiş siparişlerin bağlantısı kopmasın.
      for (const [sku, id] of bySku) {
        if (sku && !seen.has(sku)) {
          await supabase
            .from("arc_product_variants")
            .update({ stock: 0, updated_at: new Date().toISOString() })
            .eq("id", id);
          stats.pasifVaryant += 1;
        }
      }
    } catch (error) {
      stats.hata.push(`${product.productCode}: ${(error as Error).message}`);
      if (stats.hata.length > 20) break;
    }
  }

  const next = mode === "tam" ? start + slice.length : 0;
  const bitti = mode !== "tam" || next >= products.length;

  await supabase
    .from("arc_suppliers")
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_note: bitti
        ? `${mode} tamamlandı · ${products.length} ürün`
        : `${mode} sürüyor · ${next} / ${products.length}`,
      sync_cursor: bitti ? 0 : next,
      sync_total: products.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rule.id);

  return NextResponse.json({
    mode,
    ...stats,
    kalan: bitti ? 0 : products.length - next,
    bitti,
    // Bitmediyse aynı komutu tekrar çalıştırın.
    sonraki: bitti ? null : `${next} / ${products.length}`,
  });
}
