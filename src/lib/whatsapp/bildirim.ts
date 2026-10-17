import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { waSablonGonder } from "@/lib/whatsapp/gonder";
import type { WaDegerleri } from "@/lib/whatsapp/sablonlar";

/*
  SİPARİŞ OLAYLARINDAN WHATSAPP BİLDİRİMİ.

  Postanın gönderildiği her yere ikinci bir blok yazmak yerine tek
  giriş noktası: onay denetimi, mağaza yapılandırması, gönderim ve
  KAYIT burada. İki kopya yazılsaydı birinde düzeltilen bir eksik
  ötekinde kalırdı — bu depoda aynı kusur sipariş onay postasında,
  fiyat doğrulamasında ve vitrin fonksiyonlarında üç kez temizlendi.

  ÜÇ KURAL:

  1. HİÇBİR ZAMAN FIRLATMAZ. Bildirim ikincil iş; ödeme kesinleşmesi
     ya da kargo kaydı WhatsApp yüzünden durmamalı. Postada da aynı
     karar verilmişti (lib/siparis-onay-postasi).

  2. HER DENEME KAYDA GEÇER — gönderilmeyen de. Bugün ArvoARC'ta
     bulunan hataların çoğu sessizdi: hata yok, eksik iş var.
     Bildirim tam o sınıftan; mesaj gitmediğinde kimse fark etmez.
     Onay yoksa ya da mağaza yapılandırılmamışsa da satır yazılıyor,
     çünkü "neden mesaj gitmedi" sorusunun yanıtı bir yerde
     durmalı.

  3. ONAYSIZ GÖNDERİLMEZ. WhatsApp politikası işletmenin başlattığı
     mesaj için onay istiyor. Onay siparişin kaydında
     (metadata.whatsapp_onay); vitrindeki ödeme formunda müşteri
     işaretliyor ve kutucuk İŞARETSİZ başlıyor.
*/

type Durum = "gonderildi" | "basarisiz" | "yapilandirilmadi" | "onay_yok";

async function kaydet(
  supabase: SupabaseClient,
  satir: {
    organization_id: string;
    order_id: string | null;
    template_key: string;
    phone: string;
    status: Durum;
    provider_message_id?: string | null;
    error_message?: string | null;
  },
) {
  const { error } = await supabase.from("arc_whatsapp_messages").insert(satir);
  /* Kayıt yazılamazsa bile akış durmuyor; ama sessiz kalmıyor. */
  if (error) console.error("WhatsApp gönderim kaydı yazılamadı:", error.message);
}

/** Siparişin kaydındaki onay işareti. */
export function whatsappOnayiVar(metadata: unknown): boolean {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  return meta.whatsapp_onay === true || meta.whatsapp_onay === "true";
}

/**
 * Sipariş olayı için WhatsApp bildirimi gönderir.
 *
 * `numara` siparişin kaydındaki telefon; biçimi
 * lib/whatsapp/sablonlar içinde düzeltiliyor.
 */
export async function waSiparisBildirimi(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    orderId: string | null;
    anahtar: string;
    numara: string | null | undefined;
    metadata: unknown;
    degerler: WaDegerleri;
  },
): Promise<Durum> {
  const ortak = {
    organization_id: input.organizationId,
    order_id: input.orderId,
    template_key: input.anahtar,
    phone: String(input.numara ?? ""),
  };

  try {
    if (!whatsappOnayiVar(input.metadata)) {
      await kaydet(supabase, { ...ortak, status: "onay_yok" });
      return "onay_yok";
    }

    const { data: ayar } = await supabase
      .from("arc_store_settings")
      .select("whatsapp_phone_number_id")
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    const sonuc = await waSablonGonder({
      phoneNumberId: (ayar as { whatsapp_phone_number_id?: string | null } | null)?.whatsapp_phone_number_id,
      anahtar: input.anahtar,
      numara: input.numara,
      degerler: input.degerler,
    });

    if (sonuc.durum === "gonderildi") {
      await kaydet(supabase, { ...ortak, status: "gonderildi", provider_message_id: sonuc.mesajId });
      return "gonderildi";
    }
    if (sonuc.durum === "yapilandirilmadi") {
      await kaydet(supabase, { ...ortak, status: "yapilandirilmadi", error_message: sonuc.sebep });
      return "yapilandirilmadi";
    }
    await kaydet(supabase, { ...ortak, status: "basarisiz", error_message: sonuc.hata });
    return "basarisiz";
  } catch (sebep) {
    /* Buraya düşmek bir kusur: gönderici kendi hatalarını sonuç
       olarak döndürüyor. Yine de akış durmasın. */
    const mesaj = (sebep as Error).message;
    console.error("WhatsApp bildirimi beklenmedik hata:", mesaj);
    await kaydet(supabase, { ...ortak, status: "basarisiz", error_message: `beklenmedik: ${mesaj}` }).catch(() => {});
    return "basarisiz";
  }
}

/*
  Tutarın mesajda görünen biçimi. E-posta şablonu aynı biçimi kendi
  içinde kuruyor; WhatsApp için dördüncü bir kopya yazmamak adına
  burada tek satır, ama ikisi de aynı kuralı uyguluyor: kuruş
  tamsayıdan TL'ye, Türkçe ayırıcılarla.
*/
export const waTutar = (kurus: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format((kurus ?? 0) / 100);

/** Siparişin kaydındaki telefon numarası (ödeme formundan geliyor). */
export function siparisTelefonu(metadata: unknown): string | null {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  const dogrudan = typeof meta.phone === "string" ? meta.phone : null;
  if (dogrudan) return dogrudan;
  const adres = (meta.shipping_address ?? meta.address ?? {}) as Record<string, unknown>;
  return typeof adres.phone === "string" ? adres.phone : null;
}
