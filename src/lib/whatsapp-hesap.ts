import "server-only";

/*
  MAĞAZANIN WHATSAPP NUMARASI.

  Numara kaydı ArvoOS'ta duruyor (whatsapp_accounts): gönderim kapısı
  onu oradan buluyor ve erişim anahtarı yalnızca ArvoOS'un şifreleme
  anahtarıyla saklanıyor. Buradan ArvoOS'un veritabanına yazmıyoruz,
  köprüden geçiyoruz — WhatsApp gönderimi ve panel bildiriminde
  olduğu gibi.

  NEDEN ARVOARC'TA BİR EKRAN GEREKTİ: numara bugüne kadar yalnızca
  ArvoOS panelinden bağlanabiliyordu. ArvoARC hizmeti alan müşterinin
  ArvoOS paneli OLMAYABİLİR; o müşteri numarasını hiçbir yerden
  bağlayamıyor, sipariş bildirimleri kendisine kapalı kalıyordu.

  ERİŞİM ANAHTARI HİÇBİR YANITTA DÖNMEZ. Ekran yalnızca "bağlı mı,
  hangi numara, Meta ne diyor" bilgisini gösteriyor.
*/

export type WhatsappDurumu = {
  available: boolean;
  connected: boolean;
  status: "connected" | "unverified" | "disabled" | null;
  displayPhone: string | null;
  verifiedName: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
};

type Eylem = "status" | "save" | "verify" | "remove";

export type HesapSonucu =
  | { tamam: true; durum: WhatsappDurumu; dogrulandi?: boolean; ayrinti?: string | null }
  | { tamam: false; hata: string };

const kapiAdresi = () => (process.env.ARVOOS_BRIDGE_URL ?? "").trim().replace(/\/+$/, "");
const kapiSirri = () => (process.env.PRODUCT_BRIDGE_SECRET ?? "").trim();

export const whatsappKapisiVar = () => Boolean(kapiAdresi() && kapiSirri());

/*
  ArvoOS'un döndürdüğü kod adları Türkçe cümleye burada çevriliyor:
  ekran ham "no_license" göstermemeli.
*/
const HATA_METNI: Record<string, string> = {
  unauthorized: "ArvoOS köprüsü bu mağazayı tanımadı (PRODUCT_BRIDGE_SECRET).",
  invalid_request: "İstek eksik ya da hatalı.",
  invalid_product: "Bu ürün için numara bağlanamıyor.",
  unavailable: "ArvoOS şu an yanıt vermiyor.",
  no_encryption_key: "ArvoOS'ta şifreleme anahtarı tanımlı değil; numara güvenle saklanamaz.",
  no_license: "Bu mağazanın ArvoARC lisansı ArvoOS'ta görünmüyor.",
  forbidden: "Numara bağlamak için Mağaza Sahibi ya da Yönetici olmanız gerekiyor.",
};

async function kapi(eylem: Eylem, input: Record<string, unknown>): Promise<HesapSonucu> {
  const adres = kapiAdresi();
  const sir = kapiSirri();
  if (!adres || !sir) return { tamam: false, hata: "ArvoOS köprüsü yapılandırılmamış (ARVOOS_BRIDGE_URL / PRODUCT_BRIDGE_SECRET)." };

  let yanit: Response;
  try {
    yanit = await fetch(`${adres}/api/bridge/whatsapp-hesap`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-arvo-bridge-secret": sir },
      body: JSON.stringify({ product: "arc", action: eylem, ...input }),
      /* Numara doğrulaması Meta'ya gidiyor; ekran sonsuza kadar beklemesin. */
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch (sebep) {
    return { tamam: false, hata: `ArvoOS'a ulaşılamadı: ${(sebep as Error).message}` };
  }

  const metin = await yanit.text().catch(() => "");
  let govde: Record<string, unknown> = {};
  try {
    govde = JSON.parse(metin) as Record<string, unknown>;
  } catch {
    /* JSON değilse aşağıdaki durum koduna göre karar veriliyor. */
  }

  if (!yanit.ok) {
    const kod = String(govde.error ?? "");
    const ayrinti = typeof govde.detail === "string" ? govde.detail : "";
    /* Meta'nın Türkçe cümlesi varsa o gösteriliyor; kod adı değil. */
    return { tamam: false, hata: ayrinti || HATA_METNI[kod] || `ArvoOS ${yanit.status}` };
  }

  return {
    tamam: true,
    durum: govde.status as WhatsappDurumu,
    dogrulandi: typeof govde.verified === "boolean" ? govde.verified : undefined,
    ayrinti: typeof govde.detail === "string" ? govde.detail : null,
  };
}

export const whatsappDurumu = (organizationId: string, actorId: string) =>
  kapi("status", { organizationId, actorId });

export const whatsappNumarasiniKaydet = (
  organizationId: string,
  actorId: string,
  girdi: { wabaId: string; phoneNumberId: string; accessToken: string },
) => kapi("save", { organizationId, actorId, ...girdi });

export const whatsappNumarasiniSina = (organizationId: string, actorId: string) =>
  kapi("verify", { organizationId, actorId });

export const whatsappNumarasiniKaldir = (organizationId: string, actorId: string) =>
  kapi("remove", { organizationId, actorId });
