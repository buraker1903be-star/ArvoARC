import "server-only";

/**
 * Sipariş onay e-postası şablonu.
 *
 * E-posta istemcileri modern CSS'in çoğunu desteklemiyor:
 * tablo düzeni ve satır içi stil kullanılıyor. Karanlık modda
 * okunabilirlik için renkler açıkça tanımlı.
 */
export type OrderEmailItem = {
  name: string;
  quantity: number;
  total: number; // kuruş
};

const money = (kurus: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
  }).format(kurus / 100);

export function orderConfirmationHtml({
  orderNumber,
  customerName,
  items,
  subtotal,
  discount,
  shipping,
  total,
  address,
}: {
  orderNumber: string;
  customerName: string;
  items: OrderEmailItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  address?: {
    line?: string;
    district?: string;
    city?: string;
    postal?: string;
  } | null;
}) {
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e8e6df;color:#2b2f27;font-size:14px;">
          ${escapeHtml(item.name)}
          <span style="color:#8b8f85;"> × ${item.quantity}</span>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #e8e6df;text-align:right;color:#2b2f27;font-size:14px;white-space:nowrap;">
          ${money(item.total)}
        </td>
      </tr>`,
    )
    .join("");

  const addressBlock = address?.line
    ? `
      <p style="margin:24px 0 4px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8b8f85;">
        Teslimat adresi
      </p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#5a5f54;">
        ${escapeHtml(address.line)}<br>
        ${escapeHtml(address.district ?? "")} ${address.district ? "/" : ""}
        ${escapeHtml(address.city ?? "")}
        ${address.postal ? `· ${escapeHtml(address.postal)}` : ""}
      </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:24px 12px;background:#f4f3ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;">
    <tr>
      <td style="padding:32px 28px 8px;">
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8b8f85;">
          ArvoCulture
        </p>
        <h1 style="margin:0 0 6px;font-size:24px;line-height:1.25;color:#10120f;font-weight:600;">
          Siparişiniz alındı
        </h1>
        <p style="margin:0;font-size:14px;color:#5a5f54;">
          Merhaba ${escapeHtml(customerName)}, ödemeniz onaylandı.
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding:20px 28px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="background:#faf9f5;border-radius:10px;">
          <tr>
            <td style="padding:14px 16px;font-size:13px;color:#5a5f54;">
              Sipariş numaranız
              <strong style="color:#10120f;font-size:15px;"> ${escapeHtml(orderNumber)}</strong>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding:24px 28px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${rows}
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">
          <tr>
            <td style="padding:4px 0;font-size:14px;color:#5a5f54;">Ara toplam</td>
            <td style="padding:4px 0;text-align:right;font-size:14px;color:#5a5f54;">${money(subtotal)}</td>
          </tr>
          ${
            discount > 0
              ? `<tr>
                   <td style="padding:4px 0;font-size:14px;color:#c62d24;">İndirim</td>
                   <td style="padding:4px 0;text-align:right;font-size:14px;color:#c62d24;">−${money(discount)}</td>
                 </tr>`
              : ""
          }
          <tr>
            <td style="padding:4px 0;font-size:14px;color:#5a5f54;">Kargo</td>
            <td style="padding:4px 0;text-align:right;font-size:14px;color:#5a5f54;">
              ${shipping > 0 ? money(shipping) : "Ücretsiz"}
            </td>
          </tr>
          <tr>
            <td style="padding:12px 0 0;border-top:1px solid #e8e6df;font-size:16px;font-weight:600;color:#10120f;">
              Toplam
            </td>
            <td style="padding:12px 0 0;border-top:1px solid #e8e6df;text-align:right;font-size:16px;font-weight:600;color:#10120f;">
              ${money(total)}
            </td>
          </tr>
        </table>

        ${addressBlock}
      </td>
    </tr>

    <tr>
      <td style="padding:28px;">
        <a href="https://arvoculture.com/hesap"
           style="display:inline-block;padding:13px 24px;border-radius:999px;background:#10120f;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;">
          Siparişimi görüntüle
        </a>
      </td>
    </tr>

    <tr>
      <td style="padding:0 28px 28px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#8b8f85;">
          Siparişiniz hazırlanıp kargoya verildiğinde tekrar bilgilendirileceksiniz.
          Sorularınız için bu e-postayı yanıtlayabilir ya da
          <a href="https://wa.me/905074370507" style="color:#5a5f54;">WhatsApp</a>
          hattımızdan yazabilirsiniz.
        </p>
      </td>
    </tr>
  </table>

  <p style="max-width:560px;margin:16px auto 0;font-size:11px;line-height:1.6;color:#8b8f85;text-align:center;">
    ARVOCULTURE GROUP TEKNOLOJİ SANAYİ VE TİCARET LTD. ŞTİ.<br>
    Yakuplu Mah. Hürriyet Bulvarı, Skyport Residence No:1 D:113, Beylikdüzü / İstanbul
  </p>
</body>
</html>`;
}

/** E-postaya giren metinlerde HTML kaçışı. */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
