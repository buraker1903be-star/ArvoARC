import "server-only";

/*
  ARVOOS PANELİNE BİLDİRİM.

  Kiracı iki ürünü birlikte kullanabiliyor: siparişi ArvoARC'ta
  yönetiyor, işini ArvoOS panelinden takip ediyor. Sipariş geldiğinde
  bildirim yalnızca ArvoARC'ta görünüyordu; kurum sahibi iki ayrı yere
  bakmak zorundaydı.

  ArvoOS'un veritabanına DOĞRUDAN yazmıyoruz — WhatsApp'ta olduğu gibi
  kapıdan geçiyoruz (app/api/bridge/bildirim). Aynı sebep: tek yerde
  yetki, tek yerde biçim denetimi, tek yerde hata haritası. Kullanılan
  anahtar da aynı (PRODUCT_BRIDGE_SECRET), ek bir ayar gerekmiyor.

  HİÇBİR ZAMAN FIRLATMAZ. Bildirim ikincil iş: ödeme kesinleşmesi
  bildirim yazılamadı diye geri alınamaz. Sessiz de kalmıyor —
  başarısızlık sunucu günlüğüne düşüyor.
*/

type BildirimSonucu = "yazildi" | "zaten_var" | "yapilandirilmadi" | "basarisiz";

const kapiAdresi = () => (process.env.ARVOOS_BRIDGE_URL ?? "").trim().replace(/\/+$/, "");
const kapiSirri = () => (process.env.PRODUCT_BRIDGE_SECRET ?? "").trim();

export async function arvoosBildirimi(input: {
  organizationId: string;
  /** Ürün önekiyle: ArvoOS'un kendi kategorileriyle karışmasın. */
  kategori: string;
  baslik: string;
  metin: string;
  /** Panel içi yol; dışarıya götüren adres kapıda reddediliyor. */
  adres?: string;
  /** Aynı olay iki kez bildirilmesin (ödeme bildirimi tekrarlanabiliyor). */
  tekrarAnahtari?: string;
  ekBilgi?: Record<string, unknown>;
}): Promise<BildirimSonucu> {
  const adres = kapiAdresi();
  const sir = kapiSirri();
  if (!adres || !sir) {
    const eksik = [!adres && "ARVOOS_BRIDGE_URL", !sir && "PRODUCT_BRIDGE_SECRET"].filter(Boolean).join(", ");
    console.warn(`[arvoos-bildirim] kapı tanımlı değil (${eksik}); bildirim yazılmadı.`);
    return "yapilandirilmadi";
  }

  try {
    const yanit = await fetch(`${adres}/api/bridge/bildirim`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-arvo-bridge-secret": sir },
      body: JSON.stringify({
        product: "arc",
        organizationId: input.organizationId,
        category: input.kategori,
        title: input.baslik,
        message: input.metin,
        actionUrl: input.adres,
        dedupeKey: input.tekrarAnahtari,
        metadata: input.ekBilgi,
      }),
      /* Ödeme akışının içinden çağrılıyor; kapı yanıt vermezse akış beklemesin. */
      signal: AbortSignal.timeout(8_000),
    });

    const metin = await yanit.text().catch(() => "");
    if (!yanit.ok) {
      console.error(`[arvoos-bildirim] kapı ${yanit.status}: ${metin.slice(0, 200)}`);
      return "basarisiz";
    }
    try {
      return (JSON.parse(metin) as { yazildi?: boolean }).yazildi === false ? "zaten_var" : "yazildi";
    } catch {
      return "yazildi";
    }
  } catch (sebep) {
    console.error(`[arvoos-bildirim] kapıya ulaşılamadı: ${(sebep as Error).message}`);
    return "basarisiz";
  }
}

/*
  Tutarın bildirimde görünen biçimi. Kuruş tamsayıdan TL'ye, Türkçe
  ayırıcılarla — e-posta ve WhatsApp ile aynı kural.
*/
export const bildirimTutari = (kurus: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format((kurus ?? 0) / 100);
