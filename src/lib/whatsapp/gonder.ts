import { mesajGovdesi, type WaDegerleri } from "@/lib/whatsapp/sablonlar";

/*
  WHATSAPP CLOUD API GÖNDERİCİSİ.

  Meta Cloud API doğrudan kullanılıyor (aracı yok): token platformun,
  gönderen numara MAĞAZANIN. Kurulum ikiye ayrıldı çünkü ikisinin
  gizlilik derecesi farklı:

   * WHATSAPP_ACCESS_TOKEN — ortam değişkeni, platforma ait, sır.
     Asla günlüğe, hata mesajına ya da panele yazılmaz.
   * whatsapp_phone_number_id — mağaza ayarında, sır değil, kiracı
     başına. PayTR anahtarlarında olduğu gibi şifreli bir sütuna
     gerek yok; bu değer bir kimlik, bir anahtar değil.

  Kiracı kendi WhatsApp İşletme Hesabını getirmek isterse token da
  mağaza başına ve şifreli olmak zorunda (PayTR kalıbı,
  lib/sir-sifreleme). O gün gelene kadar tek token, birden çok numara.

  HATA YUTULMUYOR. Sonuç üç hâlden biri: gönderildi, yapılandırılmadı,
  başarısız. Çağıran taraf hangisini önemsediğine kendi karar veriyor —
  sipariş akışını WhatsApp yüzünden durdurmak doğru olmaz, ama
  "gönderildi" diye yazıp göndermemek de olmaz: her deneme
  arc_whatsapp_messages'a yazılıyor.
*/

const SURUM = "v21.0";

export type WaSonuc =
  | { durum: "gonderildi"; mesajId: string }
  | { durum: "yapilandirilmadi"; sebep: string }
  | { durum: "basarisiz"; hata: string };

export const waTokenVar = () => Boolean(process.env.WHATSAPP_ACCESS_TOKEN?.trim());

/**
 * Şablon mesajı gönderir. Numara ve parametreler
 * lib/whatsapp/sablonlar içinde doğrulanıyor.
 */
export async function waSablonGonder(input: {
  phoneNumberId: string | null | undefined;
  anahtar: string;
  numara: string | null | undefined;
  degerler: WaDegerleri;
}): Promise<WaSonuc> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!token) return { durum: "yapilandirilmadi", sebep: "WHATSAPP_ACCESS_TOKEN tanımlı değil" };

  const numaraId = String(input.phoneNumberId ?? "").trim();
  if (!numaraId) {
    return {
      durum: "yapilandirilmadi",
      sebep: "Mağaza ayarında WhatsApp numara kimliği (whatsapp_phone_number_id) yok",
    };
  }

  const hazir = mesajGovdesi(input.anahtar, input.numara ?? "", input.degerler);
  if ("hata" in hazir) return { durum: "basarisiz", hata: hazir.hata };

  let yanit: Response;
  try {
    yanit = await fetch(`https://graph.facebook.com/${SURUM}/${encodeURIComponent(numaraId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(hazir.body),
      /* Sipariş akışının içinden çağrılıyor; Meta yanıt vermezse
         akış beklemesin. */
      signal: AbortSignal.timeout(10_000),
    });
  } catch (sebep) {
    return { durum: "basarisiz", hata: `Meta'ya ulaşılamadı: ${(sebep as Error).message}` };
  }

  const metin = await yanit.text().catch(() => "");
  if (!yanit.ok) {
    /*
      Meta'nın hata gövdesi okunur bir mesaj taşıyor
      ("Template name does not exist in the translation"). Token
      gövdede geçmiyor; yine de yalnızca mesaj alanı alınıyor ve
      uzunluk kırpılıyor — tam gövde günlüğe yazılırsa istek
      başlıkları da sızabilir.
    */
    let mesaj = metin.slice(0, 300);
    try {
      const golge = JSON.parse(metin) as { error?: { message?: string; code?: number } };
      if (golge.error?.message) mesaj = `${golge.error.message}${golge.error.code ? ` (kod ${golge.error.code})` : ""}`;
    } catch {
      /* JSON değilse kırpılmış metin kalıyor. */
    }
    return { durum: "basarisiz", hata: `Meta ${yanit.status}: ${mesaj}` };
  }

  try {
    const golge = JSON.parse(metin) as { messages?: { id?: string }[] };
    const id = golge.messages?.[0]?.id;
    if (!id) return { durum: "basarisiz", hata: "Meta yanıtında mesaj kimliği yok" };
    return { durum: "gonderildi", mesajId: id };
  } catch {
    return { durum: "basarisiz", hata: "Meta yanıtı okunamadı" };
  }
}
