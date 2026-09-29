import "server-only";

import { YEDEK_GONDEREN, YEDEK_YANIT } from "@/lib/eposta-gonderen";

/**
 * Resend üzerinden e-posta gönderimi.
 *
 * Supabase'in proje geneli SMTP ayarı kullanılmıyor: o ayar
 * ArvoARC panelinden giden personel e-postalarını da etkiliyor
 * ve hepsi ArvoCulture kimliğiyle gidiyordu.
 *
 * Buradan gönderilen e-postalar yalnızca müşteriye ait; gönderen
 * kimliği ArvoCulture.
 */
/*
  Varsayılan gönderen tek yerde (lib/eposta-gonderen.ts): buradaki sabit
  bir KİRACININ adresiydi ve mağaza kimliği geçmeyen her çağrı, müşteriye
  o markanın adıyla e-posta gönderiyordu.
*/

export async function sendEmail({
  to,
  subject,
  html,
  from,
  replyTo,
}: {
  to: string;
  subject: string;
  html: string;
  /** Mağazanın kendi gönderen adresi; verilmezse varsayılan kullanılır. */
  from?: string | null;
  replyTo?: string | null;
}) {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    // Anahtar yoksa sessizce geç: e-posta gönderilememesi
    // siparişin oluşmasını engellememelidir.
    console.warn("RESEND_API_KEY tanımlı değil; e-posta atlandı.");
    return { ok: false as const, reason: "anahtar_yok" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from || YEDEK_GONDEREN,
        to: [to],
        reply_to: replyTo || YEDEK_YANIT,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Resend hatası:", response.status, detail);
      return { ok: false as const, reason: "gonderilemedi" };
    }

    return { ok: true as const };
  } catch (error) {
    console.error("Resend isteği başarısız:", error);
    return { ok: false as const, reason: "istek_hatasi" };
  }
}
