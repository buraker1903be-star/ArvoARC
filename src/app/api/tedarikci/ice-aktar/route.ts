import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchTarzyeri, parseDetail, slugify } from "@/lib/supplier/tarzyeri";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Büyük akış; varsayılan süre yetmez.
// Vercel Hobby planında üst sınır 60 saniye; aktarım bu yüzden
// parçalara bölünüyor.
export const maxDuration = 60;

/** Tek çağrıda işlenecek ürün sayısı. */
const BATCH = 40;

/**
 * Satış fiyatı — ARC'taki `arc_sale_price` fonksiyonunun aynısı.
 *
 * Önceden her varyant için ayrı bir RPC çağrısı yapılıyordu;
 * 120 ürün için 500'den fazla ağ turu demekti ve süre sınırını
 * aşıyordu. Aynı hesabı burada yapmak işlemi saniyeler mertebesine
 * indiriyor. Kural değişirse iki yer birlikte güncellenmelidir.
 */
function salePrice(
  cost: number,
  margin: number,
  shipping: number,
  round: number,
) {
  if (!cost || cost <= 0) return 0;
  const raw = (cost * (100 + margin)) / 100 + shipping;
  if (!round || round <= 0) return Math.round(raw);
  return Math.ceil((raw - round) / 100) * 100 + round;
}

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
    Boş akış geçici bir kesinti demektir. Önceden "bitti" sayılıp
    imleç sıfırlanıyordu; aktarım hep aynı yerde başa dönüyor ve
    sonsuz döngüye giriyordu. Artık hata döndürülüyor, imleç
    olduğu yerde kalıyor.
  */
  if (products.length === 0) {
    return NextResponse.json(
      {
        error: "xml_bos",
        detail: "Akış boş döndü; tedarikçi tarafında geçici kesinti olabilir.",
        imlec: rule.sync_cursor ?? 0,
      },
      { status: 503 },
    );
  }

  /*
    Parça parça işleme. Her çağrı `sync_cursor` konumundan başlar,
    BATCH kadar ürün işler ve imleci ilerletir. Liste bittiğinde
    imleç sıfırlanır.
  */
  /*
    Stok modu da parçalanır. 3.264 ürünü tek turda güncellemek
    60 saniyeye sığmıyor; zamanlanmış görev yarıda kesilirse
    kataloğun bir kısmı eski stokla kalır ve tükenen ürünü
    satarsınız.

    Stok modunda parça daha büyük: ürün ve görsel yazılmadığı
    için tur başına iş daha az.
  */
  /*
    Stok modunda parça çok daha büyük: güncelleme tek sorguda
    yapıldığı için 500 ürün bile saniyeler sürüyor.

    3.273 ürün 500'lük parçalarla 7 turda bitiyor; 10 dakikada
    bir tetiklemeyle katalog yaklaşık 70 dakikada tam turluyor.
    Öncesinde bu süre 5 saatti.
  */
  const size = mode === "tam" ? BATCH : 500;
  const start = rule.sync_cursor ?? 0;
  const slice = products.slice(start, start + size);

  /* Stok modunda biriken güncellemeler; parça sonunda tek
     sorguda uygulanır. */
  const stockUpdates: Array<{
    sku: string;
    stock: number;
    cost: number;
    price: number;
  }> = [];

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

  /*
    Stok modunda ürün listesi hiç okunmuyor.

    Toplu güncelleme varyantları doğrudan `supplier_sku`
    üzerinden eşleştiriyor; ürün kimliğine ihtiyaç yok. 3.269
    ürünü dört sayfada çekmek gereksiz iş yapıyordu ve
    veritabanı zaman aşımına giriyordu.
  */
  for (let page = 0; mode === "tam" && page < 50; page += 1) {
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
      /*
        Stok modunda ürün kaydına dokunulmuyor: yalnızca varyant
        stok ve fiyatları biriktirilip parça sonunda tek sorguda
        uygulanıyor.

        Ürün listesi de okunmuyor; toplu güncelleme varyantları
        doğrudan `supplier_sku` üzerinden eşleştiriyor. 3.269
        ürünü her turda çekmek zaman aşımına yol açıyordu.
      */
      if (mode !== "tam") {
        const stockPrice = salePrice(
          product.costPrice,
          rule.margin_percent,
          rule.shipping_markup,
          rule.round_to_kurus,
        );

        const seenSkus = new Set<string>();
        for (const variant of product.variants) {
          if (seenSkus.has(variant.sku)) continue;
          seenSkus.add(variant.sku);
          stockUpdates.push({
            sku: variant.sku,
            stock: variant.quantity,
            cost: product.costPrice,
            price: stockPrice,
          });
        }

        continue;
      }

      const known = byCode.get(product.productCode);
      let productId = known?.id as string | undefined;

      // --- Ürün ---------------------------------------------
      if (mode === "tam" || !productId) {
        /*
          Mevcut üründe ad, açıklama ve GÖRSELLER korunur.
          Bu ürünlerin fotoğraflarını kendiniz düzenlemiş
          olabilirsiniz; her senkronda tedarikçininkiyle
          değiştirmek o emeği siler.

          Yeni üründe tedarikçi verisi olduğu gibi kullanılır.
        */
        // Tablolar ayrıştırılıp yapılandırılmış olarak saklanır;
        // vitrin bunları liste hâlinde gösterebilsin.
        const detail = parseDetail(product.detailHtml);

        const fresh = {
          name: product.name,
          slug: `${slugify(product.name)}-${product.productCode.toLowerCase()}`,
          description: detail.intro || product.description,
          metadata: {
            specs: detail.specs,
            size_guide: detail.sizeGuide,
            vendor: rule.brand_override ?? "ArvoCulture",
            product_type: product.subCategory,
            subtitle: product.description,
            image_paths: product.images,
            supplier_category: `${product.mainCategory} > ${product.topCategory} > ${product.subCategory}`,
          },
        };

        const payload = {
          organization_id: orgId,
          status: product.active
            ? rule.publish_directly
              ? "active"
              : "draft"
            : "archived",
          supplier: "tarzyeri",
          supplier_product_code: product.productCode,
          supplier_synced_at: new Date().toISOString(),
          // Yalnızca yeni üründe içerik alanları yazılır.
          ...(productId ? {} : fresh),
        };

        if (productId) {
          const { error } = await supabase
            .from("arc_products")
            .update(payload)
            .eq("id", productId);
          if (error) throw error;
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
      const seen = new Set<string>();
      const price = salePrice(
        product.costPrice,
        rule.margin_percent,
        rule.shipping_markup,
        rule.round_to_kurus,
      );
      const now = new Date().toISOString();

      /*
        Varyantlar tek bir `upsert` ile yazılır. Tek tek eklemek
        ürün başına onlarca ağ turu üretiyordu; toplu yazımda bir
        tur yeterli.

        Yöntem: önce bu ürüne ait TEDARİKÇİ varyantları silinir,
        sonra tazeleri toplu eklenir.

        `upsert` kullanılamıyor. Çakışma anahtarı olarak `sku`
        uygun değil — mağazanın kendi ürünlerinde aynı SKU birden
        çok varyantta geçiyor. `supplier_sku` üzerine kurulan
        kısmi indeks ise (`where supplier_sku is not null`)
        PostgreSQL tarafından ON CONFLICT için tanınmıyor; kısmi
        indeksin kullanılabilmesi için sorgunun aynı koşulu
        taşıması gerekiyor, Supabase istemcisi bunu üretmiyor.

        Silme yalnızca `supplier = 'tarzyeri'` olanları kapsar;
        mağazanın kendi varyantları ve geçmiş sipariş bağlantıları
        etkilenmez.
      */
      /*
        Tedarikçi zaman zaman aynı barkodu bir üründe iki kez
        gönderiyor. Tekrarlar atlanır; aksi hâlde tüm ürün
        benzersizlik hatasıyla düşüyor.
      */
      const rows = product.variants
        .filter((variant) => {
          if (seen.has(variant.sku)) return false;
          seen.add(variant.sku);
          return true;
        })
        .map((variant) => {
          return {
            organization_id: orgId,
            product_id: productId,
            sku: variant.sku,
            supplier: "tarzyeri",
            supplier_sku: variant.sku,
            cost_price: product.costPrice,
            price,
            stock: variant.quantity,
            title: `${variant.color} / ${variant.size}`,
            updated_at: now,
          };
        });

      if (rows.length > 0) {
        if (mode === "tam") {
          // Tam modda varyantlar baştan yazılır.
          const { error: clearError } = await supabase
            .from("arc_product_variants")
            .delete()
            .eq("product_id", productId)
            .eq("supplier", "tarzyeri");
          if (clearError) throw clearError;

          const { error: insertError } = await supabase
            .from("arc_product_variants")
            .insert(rows);
          if (insertError) throw insertError;
          stats.yeniVaryant += rows.length;
        } else {
          /*
            Stok modunda kayıtlar biriktirilip parça sonunda tek
            sorguda güncellenir.

            Öncesinde her varyant için ayrı bir UPDATE
            gönderiliyordu: 120 ürün yaklaşık 500 ağ turu
            demekti ve parça boyutunu büyütmek süre sınırına
            dayanma riski taşıyordu.
          */
          for (const row of rows) {
            stockUpdates.push({
              sku: row.supplier_sku,
              stock: row.stock,
              cost: row.cost_price,
              price: row.price,
            });
          }
        }
      }

      /*
        Tam modda varyantlar zaten yeniden yazıldığı için ek
        temizliğe gerek yok. Bu blok yalnızca stok modunda
        anlamlı olurdu; şimdilik devre dışı.
      */
      if (false && seen.size > 0) {
        await supabase
          .from("arc_product_variants")
          .update({ stock: 0, updated_at: now })
          .eq("product_id", productId)
          .not("sku", "in", `(${[...seen].map((s) => `"${s}"`).join(",")})`);
      }
    } catch (error) {
      stats.hata.push(`${product.productCode}: ${(error as Error).message}`);
      if (stats.hata.length > 20) break;
    }
  }

  const next = start + slice.length;
  const bitti = next >= products.length;

  /*
    Aktarım bittiğinde ürünleri koleksiyonlara bağla. Bu olmadan
    tedarikçi ürünleri menüde görünmüyor; yalnızca arama ve
    "tüm ürünler" üzerinden erişilebiliyorlar.

    Fonksiyon mükerrer bağlantı oluşturmuyor, her turda güvenle
    çağrılabilir.
  */
  /* Biriken stok güncellemeleri tek sorguda uygulanır. */
  if (mode !== "tam" && stockUpdates.length > 0) {
    const { data: updated, error: bulkError } = await supabase.rpc(
      "arc_bulk_update_supplier_stock",
      { p_supplier: "tarzyeri", p_rows: stockUpdates },
    );

    if (bulkError) {
      return NextResponse.json(
        { error: "stok_guncellenemedi", detail: bulkError.message },
        { status: 500 },
      );
    }

    stats.guncellenenVaryant = Number(updated ?? 0);
  }

  if (bitti) {
    const { error: catError } = await supabase.rpc(
      "arc_categorize_supplier_products",
      { p_supplier: "tarzyeri" },
    );
    if (catError) console.error("Kategorileme hatası:", catError);
  }

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
