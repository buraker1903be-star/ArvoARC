import "server-only";

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
  Varsayılan gönderen. Mağaza kendi adresini ayarına yazana kadar bu kullanılır
  — bir alan adından e-posta gönderebilmek için o alan adının Resend'de
  doğrulanmış olması gerekiyor (DNS işi), yani yeni mağaza kendi adresini ancak
  doğrulamayı tamamladıktan sonra kullanabilir.
*/
const FROM = "ArvoCulture <siparis@arvoculture.com>";
const REPLY_TO = "info@arvoculture.com";

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
        from: from || FROM,
        to: [to],
        reply_to: replyTo || REPLY_TO,
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
