import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sablonuCoz, sablonuUygula, type DegiskenAdi, type SablonMetni } from "@/lib/eposta-sablonu";

/*
  MAĞAZANIN KENDİ POSTA METNİ.

  Tablo boşsa koddaki varsayılan kullanılıyor (sablonuCoz), yani
  hiçbir mağaza bir şey yazmadan bugünkü metinleri almaya devam
  ediyor. Yeni kiracı için de aynı: hiçbir şey yapmadan çalışır.

  OKUMA BAŞARISIZ OLURSA VARSAYILANA DÜŞÜLÜYOR, posta
  GÖNDERİLMEMEZLİK EDİLMİYOR. Metni okuyamamak, müşteriye siparişinin
  kargoya verildiğini hiç söylememek için yeterli bir sebep değil.
  Hata sessiz de kalmıyor, günlüğe yazılıyor.

  DURUM KODU → ŞABLON ANAHTARI eşlemesi burada tek yerde: iptal
  edilen siparişin ödenmiş olup olmaması iki ayrı metin demek ve bu
  karar e-posta gövdesinde zaten veriliyordu (UNPAID_CANCELLED).
*/

export function sablonAnahtari(durum: string, odenmemisMi: boolean): string | null {
  if (durum === "cancelled") return odenmemisMi ? "cancelled_unpaid" : "cancelled";
  if (durum === "processing" || durum === "fulfilled" || durum === "refunded") return durum;
  return null;
}

/**
 * Mağazanın şablonunu değişkenleri yerleştirilmiş hâlde döndürür.
 *
 * `null` = bu durumda posta gönderilmiyor (tanınmayan anahtar).
 */
export async function magazaSablonu(
  supabase: SupabaseClient,
  organizationId: string,
  anahtar: string,
  degerler: Partial<Record<DegiskenAdi, string>>,
): Promise<SablonMetni | null> {
  let kayit: Partial<SablonMetni> | null = null;
  const { data, error } = await supabase
    .from("arc_email_templates")
    .select("subject,body")
    .eq("organization_id", organizationId)
    .eq("template_key", anahtar)
    .maybeSingle();
  if (error) {
    console.error(`[eposta-sablonu] ${anahtar} okunamadı, varsayılana düşüldü:`, error.message);
  } else if (data) {
    kayit = { baslik: data.subject as string, govde: data.body as string };
  }

  const cozum = sablonuCoz(anahtar, kayit);
  return cozum ? sablonuUygula(cozum, degerler) : null;
}
