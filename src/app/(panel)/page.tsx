import { requireTenant } from "@/lib/tenant";
import { fetchAllRows } from "@/lib/fetch-all";
import { countsAsRevenue, revenueAmount } from "@/lib/order-flow";
import { DAY, trDayStart } from "@/lib/tr-time";
import { TRANSFER_STALE_HOURS } from "@/lib/payment-method";
import { orderBadge, productStatusLabel } from "@/lib/commerce-labels";
import { Notice } from "@/components/panel/notice";
import { KurulumRehberi } from "@/components/panel/kurulum-rehberi";
import { ayarlardanOlgular, kurulumDurumu } from "@/lib/kurulum-adimlari";
import { GenelBakis, ListeIzgarasi, ListeKarti, ListeSatiri, SeriKarti, yeniMi } from "@/components/arvo-ui/genel-bakis";
import { gunlukSeri } from "@/lib/gunluk-seri";
import { liraYaz } from "@/lib/lira";

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });
const saatTr = new Intl.DateTimeFormat("tr-TR", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Istanbul" });

/* Rozet tonu: eski etiketlerin tonları (commerce-labels) ArvoOS rozetinin tonlarına. */
const ROZET_TONU: Record<string, string> = { bad: "danger", warn: "warning", muted: "neutral", info: "info", good: "success" };
const shortDate = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "Europe/Istanbul" });
const longDate = new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Istanbul" });

/* Render dışında: bileşen içinde saf olmayan çağrı yapılmasın. */
function currentTime() {
  return Date.now();
}

type Tone = "success" | "warning" | "danger" | "neutral";
type OrderRow = { id: string; order_number: string; customer_name: string | null; status: string; payment_status: string; total: number; currency: string; refunded_amount: unknown; created_at: string };

export default async function Dashboard() {
  const { supabase, organization, membership } = await requireTenant();
  const now = currentTime();
  /* Bugün dahil son 30 gün, Türkiye saatine göre. */
  const since = trDayStart(now) - 29 * DAY;

  /*
    Siparişler 1000'lik sayfalarla okunuyor: tek istekte Supabase
    1000 satırda kesiyordu ve yoğun ayda satış ile sipariş sayısı
    eksik çıkıyordu. Analitik ile aynı yöntem.
  */
  const ordersPromise = fetchAllRows<OrderRow>((from, to) =>
    supabase
      .from("arc_orders")
      .select("id,order_number,customer_name,status,payment_status,total,currency,refunded_amount:metadata->refunded_amount,created_at")
      .eq("organization_id", organization.id)
      .gte("created_at", new Date(since).toISOString())
      .order("created_at", { ascending: false })
      .range(from, to) as unknown as PromiseLike<{ data: OrderRow[] | null; error: { message: string } | null }>,
  );

  const [{ rows: orders, truncated }, openOrderCountResult, productsResult, productCountResult, activeProductCountResult, variantCountResult, stockSumResult, negativeStockResult, lowStockResult, ayarSonucu, staleTransferResult] = await Promise.all([
    ordersPromise,
    supabase.from("arc_orders").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).in("status", ["pending", "confirmed", "processing"]),
    supabase.from("arc_products").select("id,name,slug,status,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("arc_products").select("id", { count: "exact", head: true }).eq("organization_id", organization.id),
    supabase.from("arc_products").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("status", "active"),
    /*
      Varyantların tamamı çekiliyordu; Supabase 1000 satırda
      kestiği için "1000 varyant" yazıyor ve toplam stok eksik
      hesaplanıyordu. Sayım ve toplama veritabanında yapılıyor.
    */
    supabase.from("arc_product_variants").select("id", { count: "exact", head: true }).eq("organization_id", organization.id),
    supabase.rpc("arc_total_stock_units"),
    supabase.from("arc_product_variants").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).lt("stock", 0),
    supabase.from("arc_product_variants").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).gte("stock", 0).lte("stock", 5),
    /*
      KURULUM REHBERİ için ayar satırı. Yeni mağazada Genel Bakış
      sıfırlarla doluydu ve sıradaki işi söylemiyordu; rehber tam
      olarak o boşluğu dolduruyor ve kurulum bitince kayboluyor.
    */
    supabase.from("arc_store_settings").select("logo_path,bank_transfer_enabled,bank_iban,paytr_enabled,paytr_merchant_id,paytr_merchant_key_enc,shipping_fee,sales_configured_at,storefront_url,custom_domain,platform_subdomain,domain_verified_at").eq("organization_id", organization.id).maybeSingle(),
    /* Süresi geçen havale: ödenmemiş, kapanmamış ve 72 saatten eski havale siparişleri. */
    supabase.from("arc_orders").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).in("payment_status", ["pending", "authorized"]).not("status", "in", "(cancelled,refunded)").ilike("metadata->>payment_method", "%havale%").lt("created_at", new Date(now - TRANSFER_STALE_HOURS * 3_600_000).toISOString()),
  ]);

  if (openOrderCountResult.error) throw new Error(openOrderCountResult.error.message);
  /*
    Ayar okunamazsa rehber SESSİZCE gizlenmiyor: hata yutulsa yeni
    mağaza "kurulum tamam" sanır ve eksik ayarla satışa çıkardı.
  */
  if (ayarSonucu.error) throw new Error(ayarSonucu.error.message);
  if (productsResult.error) throw new Error(productsResult.error.message);
  if (productCountResult.error) throw new Error(productCountResult.error.message);
  if (activeProductCountResult.error) throw new Error(activeProductCountResult.error.message);
  if (variantCountResult.error) throw new Error(variantCountResult.error.message);

  const products = productsResult.data ?? [];
  /*
    Satış yalnızca geçerli siparişlerden: iptal ve iade edilenler
    de toplanıyordu, Genel Bakış ile Analitik farklı ciro gösteriyordu.
  */
  const paidOrders = orders.filter((order) => countsAsRevenue(order.status, order.payment_status));
  const sales = paidOrders.reduce((sum, order) => sum + revenueAmount(order), 0);
  /* Sayaçlar veritabanından; katalog belleğe alınmıyor. */
  const variantCount = variantCountResult.count ?? 0;
  /* Toplam okunamazsa "0" yazmak stok bitmiş gibi gösterir. */
  const stock = !stockSumResult.error && typeof stockSumResult.data === "number" ? stockSumResult.data : null;
  const negativeStockCount = negativeStockResult.count ?? 0;
  const lowStockCount = lowStockResult.count ?? 0;
  const openOrderCount = openOrderCountResult.count ?? 0;
  const recentOrders = orders.slice(0, 6);

  /*
    Grafik ArvoOS'un genel bakış şablonunda (SeriKarti): son 14 gün ve
    önceki 14 güne göre değişim. Ağırlık siparişin net tutarı; gün sınırı
    Türkiye saatiyle (lib/gunluk-seri).
  */
  const satisSerisi = gunlukSeri(paidOrders.map((order) => order.created_at), now, 14, paidOrders.map((order) => revenueAmount(order)));

  /* Grafik başlığındaki özet: eski dört kutu yer kaplıyordu; ArvoOS'ta da rakamlar grafiğin başlığında. */
  const ozet = [
    { ad: "Net satış · 30 gün", deger: money.format(sales / 100), href: "/analitik?p=30" },
    { ad: "Sipariş · 30 gün", deger: orders.length.toLocaleString("tr-TR"), href: "/siparisler" },
    { ad: "Aktif ürün", deger: (activeProductCountResult.count ?? 0).toLocaleString("tr-TR"), href: "/urunler" },
    { ad: `Stok · ${compact.format(variantCount)} varyant`, deger: stock === null ? "—" : compact.format(stock), href: "/stok" },
  ];

  /*
    Aksiyon özeti. Renk anlam taşıyor: sıfır olan sayaç nötr,
    dikkat gerektiren sarı, sorunlu kırmızı.
  */
  const actionItems: { label: string; value: number; detail: string; href: string; tone: Tone }[] = [
    {
      label: "İşlem bekleyen sipariş",
      value: openOrderCount,
      detail: openOrderCount ? "Onay ve hazırlık akışını tamamlayın" : "Sipariş akışı güncel",
      href: "/operasyon",
      tone: openOrderCount ? "warning" : "neutral",
    },
    {
      label: "Kritik stok",
      value: negativeStockCount,
      detail: negativeStockCount ? "Eksi stokları hemen düzeltin" : "Eksi stok bulunmuyor",
      href: "/stok?filter=negative",
      tone: negativeStockCount ? "danger" : "neutral",
    },
    {
      label: "Azalan stok",
      value: lowStockCount,
      detail: lowStockCount ? "5 ve altındaki varyantları inceleyin" : "Stok seviyeleri sağlıklı",
      href: "/stok?filter=low",
      tone: lowStockCount ? "warning" : "neutral",
    },
    /* Yalnızca varsa gösterilir: Operasyon'dan onaylanır ya da iptal edilir. */
    ...((staleTransferResult.count ?? 0) > 0
      ? [{ label: "Süresi geçen havale", value: staleTransferResult.count ?? 0, detail: `${TRANSFER_STALE_HOURS} saattir ödenmemiş; onaylayın ya da iptal edin`, href: "/operasyon", tone: "danger" as Tone }]
      : []),
  ];

  /* Son eklenen ürünlerin varyantları yalnızca o beş ürün için
     çekilir; tüm katalog belleğe alınmaz. */
  const recentProductIds = products.map((product) => product.id);
  const { data: recentVariants } = recentProductIds.length
    ? await supabase.from("arc_product_variants").select("product_id,sku,stock,price,currency").eq("organization_id", organization.id).in("product_id", recentProductIds)
    : { data: [] };
  const variantByProduct = new Map((recentVariants ?? []).map((variant) => [variant.product_id, variant]));

  /*
    Hızlı işlem düğmeleri bilerek yok: hepsi sol menüde. Aynı
    işlevi iki yerde göstermek başlık hizasında yer kaplıyordu.
  */
  /* Rehber yalnızca ayarları değiştirebilenlere: depocu adımların
     hiçbirini yapamaz, onun için yalnızca gürültü olurdu. */
  const kurulum = ["owner", "admin", "manager"].includes(membership.role)
    ? kurulumDurumu(ayarlardanOlgular(ayarSonucu.data, {
        urunSayisi: productCountResult.count ?? 0,
        yayindaUrunSayisi: activeProductCountResult.count ?? 0,
      }))
    : null;

  const saat = Number(saatTr.format(new Date(now)));
  const selam = saat < 5 ? "İyi geceler" : saat < 12 ? "Günaydın" : saat < 18 ? "İyi günler" : saat < 23 ? "İyi akşamlar" : "İyi geceler";

  /*
    ANA EKRAN = ArvoOS'UN GENEL BAKIŞ ŞABLONU (16.10.2026): selamlama ·
    tam genişlikte grafik (başlığında özet rakamlar) · altında yan yana
    liste kartları, her biri en fazla altı satır ve kendi sayfasına
    bağlantı. Eskiden dört büyük sayı kutusu, grafik ve dört kart ayrı
    bir tasarım dilindeydi (dash-*).
  */
  return (
    <GenelBakis ust={<span className="dash-tarih">{longDate.format(new Date(now))}</span>} baslik={selam}>
      {kurulum ? <KurulumRehberi durum={kurulum} /> : null}

      {truncated ? (
        <Notice tone="warn" title="Özet kısmi">Son 30 günde 20.000’den fazla sipariş var; rakamlar en yeni 20.000 siparişten hesaplandı.</Notice>
      ) : null}

      <SeriKarti
        baslik="Satış"
        alt="Son 14 gün · iptal ve iadeler hariç"
        seri={satisSerisi}
        birim={(kurus) => money.format(kurus / 100)}
        adet=""
        href="/analitik"
        ozet={ozet}
        bos="Son 14 günde satış yok. İlk sipariş geldiğinde günlük dağılım burada çizilir."
      />

      <ListeIzgarasi>
        <ListeKarti baslik="Aksiyon bekleyenler" alt="Bugün ilgilenilmesi gerekenler" bos="Bekleyen iş yok." href="/operasyon" hrefEtiket="Operasyon merkezi" sayi={actionItems.length}>
          {actionItems.map((item) => (
            <ListeSatiri
              key={item.label}
              href={item.href}
              baslik={item.label}
              alt={item.detail}
              sag={<span className="status-pill" data-tone={item.tone}>{item.value.toLocaleString("tr-TR")}</span>}
            />
          ))}
        </ListeKarti>

        <ListeKarti baslik="Son siparişler" alt="Son 30 günde gelenler" bos="Henüz sipariş yok. İlk sipariş geldiğinde burada görünecek." href="/siparisler" hrefEtiket="Tüm siparişler" sayi={recentOrders.length}>
          {recentOrders.map((order) => {
            const badge = orderBadge(order.status, order.payment_status);
            return (
              <ListeSatiri
                key={order.id}
                href={`/siparisler/${order.id}`}
                baslik={order.customer_name || "Misafir müşteri"}
                alt={`${order.order_number} · ${liraYaz(order.total)} · ${shortDate.format(new Date(order.created_at))}`}
                sag={<span className="status-pill" data-tone={ROZET_TONU[badge.tone] ?? "neutral"}>{badge.label}</span>}
                yeni={yeniMi(order.created_at)}
              />
            );
          })}
        </ListeKarti>

        <ListeKarti baslik="Son ürünler" alt="Kataloğa en son eklenenler" bos="Henüz ürün yok. İlk ürününü ekleyerek başlayabilirsin." href="/urunler" hrefEtiket="Ürünler" sayi={products.length}>
          {products.map((product) => {
            const variant = variantByProduct.get(product.id);
            return (
              <ListeSatiri
                key={product.id}
                href={`/urunler/${product.id}`}
                baslik={product.name}
                baslikIpucu={product.name}
                alt={`${variant ? `${liraYaz(variant.price)} · stok ${variant.stock}` : "Varyant yok"} · ${productStatusLabel(product.status)}`}
              />
            );
          })}
        </ListeKarti>
      </ListeIzgarasi>
    </GenelBakis>
  );
}
