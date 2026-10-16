import { fetchAllRows } from "@/lib/fetch-all";
import { countsAsRevenue, revenueAmount } from "@/lib/order-flow";
import type { requireTenant } from "@/lib/tenant";
import { formatPersonName } from "@/lib/format-name";

type Supabase = Awaited<ReturnType<typeof requireTenant>>["supabase"];

export const DAY = 86_400_000;
export const NEW_DAYS = 30;
export const RISK_DAYS = 120;

export type Customer = {
  key: string;
  name: string;
  email: string;
  orders: number;
  paidOrders: number;
  spent: number;
  firstOrderAt: number;
  lastOrderAt: number;
};

/*
  Müşteri görünümü siparişlerden oluşturuluyor: e-posta varsa
  e-postaya, yoksa ada göre gruplanır. Harcama yalnızca ciroya
  sayılan siparişlerden (iptal ve iade hariç).

  Liste sayfası ve CSV aynı fonksiyonu kullanır; iki yerde farklı
  toplam görünmesin.
*/
export async function loadCustomers(supabase: Supabase, organizationId: string) {
  type OrderRow = { id: string; customer_name: string | null; customer_email: string | null; total: number; status: string; payment_status: string; refunded_amount: unknown; created_at: string };
  const { rows, truncated } = await fetchAllRows<OrderRow>((from, to) =>
    supabase
      .from("arc_orders")
      .select("id,customer_name,customer_email,total,status,payment_status,refunded_amount:metadata->refunded_amount,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .range(from, to) as unknown as PromiseLike<{ data: OrderRow[] | null; error: { message: string } | null }>,
  );

  const grouped = new Map<string, Customer>();
  for (const order of rows) {
    const email = (order.customer_email ?? "").trim().toLocaleLowerCase("tr-TR");
    const hamAd = (order.customer_name ?? "").trim() || "İsimsiz müşteri";
    /* Anahtar KAYITLI addan: müşteri detayı onu ilike ile arıyor ve
       biçimlenmiş ad (boşlukları sıkıştırılmış) kaydı bulamayabilirdi.
       Ekranda "Adı Soyadı" (lib/format-name). */
    const name = formatPersonName(hamAd) || hamAd;
    const key = email || `name:${hamAd.toLocaleLowerCase("tr-TR")}`;
    const at = Date.parse(order.created_at);
    const paid = countsAsRevenue(order.status, order.payment_status);
    const existing = grouped.get(key);
    if (existing) {
      existing.orders++;
      if (paid) {
        existing.paidOrders++;
        existing.spent += revenueAmount(order);
      }
      existing.firstOrderAt = Math.min(existing.firstOrderAt, at);
      existing.lastOrderAt = Math.max(existing.lastOrderAt, at);
    } else {
      /* Siparişler yeniden eskiye geldiği için ilk görülen ad en güncel ad. */
      grouped.set(key, { key, name, email, orders: 1, paidOrders: paid ? 1 : 0, spent: revenueAmount(order), firstOrderAt: at, lastOrderAt: at });
    }
  }
  return { customers: [...grouped.values()], orderCount: rows.length, truncated };
}

export function customerTags(customer: Customer, now: number) {
  const tags: { label: string; tone?: string }[] = [];
  if (customer.paidOrders > 1) tags.push({ label: "Tekrarlayan" });
  if (now - customer.firstOrderAt <= NEW_DAYS * DAY) tags.push({ label: "Yeni", tone: "info" });
  if (now - customer.lastOrderAt > RISK_DAYS * DAY) tags.push({ label: "Uzun süredir yok", tone: "warn" });
  return tags;
}

export function daysAgo(at: number, now: number) {
  const days = Math.floor((now - at) / DAY);
  return days <= 0 ? "bugün" : days === 1 ? "dün" : `${days.toLocaleString("tr-TR")} gün önce`;
}

/* Render dışında: bileşen içinde saf olmayan çağrı yapılmasın. */
export function currentTime() {
  return Date.now();
}


/*
  ANAHTARIN SÜZGECE GİRİŞİ.

  Müşteri anahtarı e-posta (ya da "name:<ad>") ve detay sayfası onu
  `ilike` ile arıyor — joker karakter yazılmadığı için bu büyük/küçük
  harf duyarsız EŞİTLİK demek. Sorun şuydu: değerden `%` ve `_`
  SİLİNİYORDU. İkisi de e-postada geçerli karakter ve `_` çok yaygın;
  "ali_veli@example.com" süzgece "aliveli@example.com" olarak giriyor,
  hiçbir satıra uymuyor ve müşteri KENDİ LİSTE SATIRINDAN 404 alıyordu.

  Doğrusu silmek değil KAÇIRMAK: Postgres LIKE'ın varsayılan kaçış
  karakteri ters eğik çizgi. Jokeri olmayan bir değerde desen hiç
  değişmiyor, yani olağan e-postalarda davranış aynı kalıyor.

  Saf fonksiyon; testi tests/musteri-anahtari.test.ts.
*/
export function likeDeseni(deger: string) {
  return deger.replace(/[\\%_]/g, (karakter) => `\\${karakter}`);
}

/** Anahtar hangi sütunda aranacak ve hangi desenle. */
export function anahtarSuzgeci(key: string): { alan: "customer_name" | "customer_email"; desen: string } {
  return key.startsWith("name:")
    ? { alan: "customer_name", desen: likeDeseni(key.slice(5)) }
    : { alan: "customer_email", desen: likeDeseni(key) };
}
