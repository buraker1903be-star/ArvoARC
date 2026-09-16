import "server-only";
import type { StoreBrand } from "@/lib/store-brand";

/**
 * Kimlik doğrulama e-postaları.
 *
 * Supabase'in kendi şablonları kullanılmıyor: onlar proje geneli ayardan
 * besleniyor ve ArvoARC panelinden giden personel e-postalarıyla aynı kimliği
 * taşıyorlar. Buradakiler yalnızca müşteriye gidiyor.
 *
 * Marka bilgisi mağazadan geliyor (lib/store-brand.ts). Önceden logo, konu
 * başlığı, metin ve altbilgi ArvoCulture'a gömülüydü; ikinci mağaza açıldığında
 * onun müşterisi "ArvoCulture hesabınızı doğrulayın" e-postası alırdı.
 */

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const shell = (brand: StoreBrand, title: string, body: string) => {
  const ad = escape(brand.name);
  /* Logo yoksa mağaza adı yazılır; kırık görsel göstermekten iyi. */
  const baslik = brand.logoUrl
    ? `<img src="${escape(brand.logoUrl)}" alt="${ad}" height="18"
           style="display:block;max-width:180px;height:auto;margin:0 0 22px;border:0;">`
    : `<p style="margin:0 0 22px;font-size:17px;font-weight:600;color:#10120f;">${ad}</p>`;

  const altbilgi = [brand.legalName, brand.legalAddress]
    .filter(Boolean)
    .map((satir) => escape(String(satir)))
    .join("<br>");

  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:24px 12px;background:#f4f3ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;">
    <tr>
      <td style="padding:32px 28px;">
        ${baslik}
        <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;color:#10120f;font-weight:600;">
          ${escape(title)}
        </h1>
        ${body}
      </td>
    </tr>
  </table>
${altbilgi ? `
  <p style="max-width:520px;margin:16px auto 0;font-size:11px;line-height:1.6;color:#8b8f85;text-align:center;">
    ${altbilgi}
  </p>` : ""}
</body>
</html>`;
};

const button = (href: string, label: string) => `
  <a href="${escape(href)}"
     style="display:inline-block;margin:20px 0 8px;padding:13px 26px;border-radius:999px;background:#10120f;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;">
    ${label}
  </a>`;

/** Kayıt doğrulama. */
export function signupEmail(link: string, brand: StoreBrand) {
  return {
    subject: `${brand.name} hesabınızı doğrulayın`,
    html: shell(
      brand,
      "Hesabınızı doğrulayın",
      `<p style="margin:0;font-size:14px;line-height:1.65;color:#5a5f54;">
         ${escape(brand.name)} hesabınızı oluşturmak için aşağıdaki bağlantıya
         tıklayın. Bu adım, siparişlerinizi ve adres defterinizi
         hesabınıza bağlar.
       </p>
       ${button(link, "Hesabımı doğrula")}
       <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#8b8f85;">
         Bağlantı 24 saat geçerlidir. Bu isteği siz yapmadıysanız
         bu e-postayı yok sayabilirsiniz; hesap oluşturulmaz.
       </p>`,
    ),
  };
}

/** Şifre sıfırlama. */
export function resetPasswordEmail(link: string, brand: StoreBrand) {
  return {
    subject: `${brand.name} şifre sıfırlama`,
    html: shell(
      brand,
      "Şifrenizi sıfırlayın",
      `<p style="margin:0;font-size:14px;line-height:1.65;color:#5a5f54;">
         Şifrenizi yenilemek için aşağıdaki bağlantıya tıklayın.
       </p>
       ${button(link, "Yeni şifre belirle")}
       <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#8b8f85;">
         Bağlantı 1 saat geçerlidir. Bu isteği siz yapmadıysanız
         bu e-postayı yok sayabilirsiniz; şifreniz değişmez.
       </p>`,
    ),
  };
}
