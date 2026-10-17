import { kapiMesaji, type WaDegerleri } from "@/lib/whatsapp/sablonlar";

/*
  ARVOOS'UN WHATSAPP KAPISINA GÖNDERİM.

  ÖNCEDEN BURADAN DOĞRUDAN META'YA ÇAĞRI YAPILIYORDU
  (graph.facebook.com/v21.0/<numara>/messages) ve token ArvoARC'ın
  kendi ortam değişkenindeydi. Yanlıştı: ArvoOS'ta 21–27 Eylül
  2026'da yazılmış ortak bir kapı var (lib/whatsapp-gateway.ts +
  app/api/bridge/whatsapp) ve izin verdiği ürünler arasında "arc"
  zaten yazılı. ArvoOS'un değişmezi: "WhatsApp'a doğrudan çağrı
  yapılmaz. Dört ürün de kapıdan geçer: tek yerde erişim anahtarı,
  tek yerde mesaj kaydı, tek yerde hata haritası."

  Doğrudan çağrının üç somut bedeli vardı:
   * İkinci bir token — sızma yüzeyi iki katı, yenileme iki yerde.
   * İkinci bir mesaj kütüğü (arc_whatsapp_messages), ArvoOS'taki
     whatsapp_messages'ın kopyası. "Mesaj gitti mi" sorusunun iki
     ayrı yanıtı olurdu.
   * GELEN mesaj hiçbir yere düşmüyordu. Kapıdan geçince müşterinin
     yanıtı ArvoOS'un CRM gelen kutusuna düşüyor ve personel 24
     saatlik pencerede serbest metinle cevap verebiliyor.

  NUMARA KURUMA BAĞLI, MAĞAZA AYARINA DEĞİL. Kurum WhatsApp
  numarasını ArvoOS panelinden bağlıyor (Ayarlar → Entegrasyonlar);
  kapı token'ı şifreli saklıyor ve hangi ürünün istediğine bakmadan
  o kurumun numarasını kullanıyor. Numara bağlı değilse Arvo'nun
  ortak numarasına düşüyor ve bunu `fellBackToArvo` ile söylüyor.

  HATA YUTULMUYOR. Sonuç üç hâlden biri: gönderildi,
  yapılandırılmadı, başarısız. Çağıran taraf hangisini önemsediğine
  kendi karar veriyor — sipariş akışını WhatsApp yüzünden durdurmak
  doğru olmaz, ama "gönderildi" diye yazıp göndermemek de olmaz.
*/

export type WaSonuc =
  | { durum: "gonderildi"; mesajId: string; arvoNumarasinaDustu: boolean }
  | { durum: "yapilandirilmadi"; sebep: string }
  | { durum: "basarisiz"; hata: string };

/** Kapının adresi; sonundaki eğik çizgi varsa atılıyor. */
const kapiAdresi = () => (process.env.ARVOOS_BRIDGE_URL ?? "").trim().replace(/\/+$/, "");

/** Köprü sırrı; ArvoOS'taki PRODUCT_BRIDGE_SECRET ile aynı değer. */
const kapiSirri = () => (process.env.PRODUCT_BRIDGE_SECRET ?? "").trim();

export const waKapisiVar = () => Boolean(kapiAdresi() && kapiSirri());

type KapiYaniti = {
  sender?: string;
  fellBackToArvo?: boolean;
  results?: { ref?: string | null; to?: string; sent?: boolean; waMessageId?: string | null; error?: string | null }[];
  error?: string;
};

/**
 * Şablon mesajını kuruma bağlı numaradan gönderir.
 *
 * `organizationId` ArvoOS'taki kurum kimliğiyle AYNI olmalı — ArvoARC'ın
 * `organizations` tablosu ArvoOS köprüsünün yazdığı kopya olduğu için
 * zaten aynı kimlik taşınıyor (ArvoOS lib/arc-bridge.ts).
 */
export async function waSablonGonder(input: {
  organizationId: string;
  anahtar: string;
  numara: string | null | undefined;
  degerler: WaDegerleri;
  /**
   * Siparişin paylaşım anahtarı (`arc_orders.public_token`).
   *
   * Şablonun dinamik URL düğmesine ekleniyor: düğmenin adresi
   * Meta'da `.../siparis/{{1}}` olarak sabit, değişen son parça bu.
   * Mesajın gövdesinde değil düğmede, çünkü şablon parametrelerinde
   * satır sonu yasak ve gövdeye adres yazmak mesajı uzatıyor.
   *
   * Yoksa düğme parametresi gönderilmiyor; şablonda düğme varsa
   * Meta mesajı reddeder, o yüzden anahtar üretilemeyen bir siparişte
   * bu alan boş GEÇİLMEZ, çağıran taraf hiç göndermez.
   */
  paylasimAnahtari?: string | null;
}): Promise<WaSonuc> {
  const adres = kapiAdresi();
  const sir = kapiSirri();
  if (!adres || !sir) {
    const eksik = [!adres && "ARVOOS_BRIDGE_URL", !sir && "PRODUCT_BRIDGE_SECRET"].filter(Boolean).join(", ");
    return { durum: "yapilandirilmadi", sebep: `WhatsApp kapısı tanımlı değil (${eksik})` };
  }
  if (!input.organizationId) return { durum: "basarisiz", hata: "Kurum kimliği boş; kapı mağazanın numarasını bulamaz." };

  const hazir = kapiMesaji(input.anahtar, input.numara ?? "", input.degerler);
  if ("hata" in hazir) return { durum: "basarisiz", hata: hazir.hata };

  let yanit: Response;
  try {
    yanit = await fetch(`${adres}/api/bridge/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-arvo-bridge-secret": sir },
      body: JSON.stringify({
        product: "arc",
        organizationId: input.organizationId,
        /* Müşteri mesajı MAĞAZADAN almalı, "Arvo"dan değil. Kurumun
           numarası bağlı değilse kapı Arvo'nunkine düşüyor ve bunu
           söylüyor; sonuçta görünsün diye taşınıyor. */
        sender: "organization",
        messages: [
          {
            ref: input.anahtar,
            ...hazir.mesaj,
            ...(input.paylasimAnahtari ? { urlButtonParam: input.paylasimAnahtari } : {}),
          },
        ],
      }),
      /* Sipariş akışının içinden çağrılıyor; kapı yanıt vermezse
         akış beklemesin. */
      signal: AbortSignal.timeout(10_000),
    });
  } catch (sebep) {
    return { durum: "basarisiz", hata: `WhatsApp kapısına ulaşılamadı: ${(sebep as Error).message}` };
  }

  const metin = await yanit.text().catch(() => "");
  let golge: KapiYaniti = {};
  try {
    golge = JSON.parse(metin) as KapiYaniti;
  } catch {
    /* JSON değilse aşağıdaki durum koduna göre karar veriliyor. */
  }

  /*
    Kapı kısmi başarısızlıkta 207 döndürüyor; tek mesaj gönderdiğimiz
    için 207 doğrudan "gitmedi" demek. 200 bile olsa results[0].sent
    okunuyor — "istek başarılı" ile "mesaj gitti" ayrı şeyler.
  */
  if (!yanit.ok && yanit.status !== 207) {
    const sebep = golge.error ?? metin.slice(0, 300) ?? "";
    /* 503 = kapı açık ama anahtar/numara eksik: kusur değil, kurulum. */
    if (yanit.status === 503) return { durum: "yapilandirilmadi", sebep: sebep || "Kapı yapılandırılmamış" };
    return { durum: "basarisiz", hata: `Kapı ${yanit.status}: ${sebep}` };
  }

  const ilk = golge.results?.[0];
  if (!ilk) return { durum: "basarisiz", hata: "Kapı yanıtında sonuç yok" };
  if (!ilk.sent) return { durum: "basarisiz", hata: ilk.error ?? "Mesaj gönderilemedi" };

  return {
    durum: "gonderildi",
    mesajId: ilk.waMessageId ?? "",
    arvoNumarasinaDustu: golge.fellBackToArvo === true,
  };
}
