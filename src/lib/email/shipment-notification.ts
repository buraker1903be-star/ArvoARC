import "server-only";
import type { StoreBrand } from "@/lib/store-brand";

/*
  BÖLÜNMÜŞ KARGO BİLDİRİMİ.

  Tek paketlik eski bildirimden (order-confirmation.ts →
  shippingNoticeHtml) farkı: bu e-posta bir PAKETİ anlatıyor, siparişin
  tamamını değil. Paketin kaçıncı olduğu ve İÇİNDE NE OLDUĞU yazıyor;
  yazmazsa müşteri eksik gelen paketi kayıp sanıyor ve ikinci paketi
  beklemesi gerektiğini bilmiyor.

  E-posta istemcileri modern CSS'in çoğunu desteklemiyor: tablo düzeni ve
  satır içi stil, renkler açıkça tanımlı.
*/

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const brandLogo = (brand: StoreBrand) =>
  brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.name)}" height="18"
           style="display:block;max-width:180px;height:auto;margin:0 0 20px;border:0;">`
    : `<p style="margin:0 0 20px;font-size:17px;font-weight:600;color:#10120f;">${escapeHtml(brand.name)}</p>`;

const brandFooter = (brand: StoreBrand) =>
  [brand.legalName, brand.legalAddress].filter(Boolean).map((satir) => escapeHtml(String(satir))).join("<br>");

export function shipmentNoticeHtml({
  brand,
  orderNumber,
  customerName,
  carrier,
  trackingNumber,
  trackingUrl,
  paketEtiketi,
  kalemler,
  kalanPaketSayisi,
}: {
  brand: StoreBrand;
  orderNumber: string;
  customerName: string;
  carrier: string | null;
  trackingNumber: string;
  trackingUrl?: string | null;
  /** "3 paketten 2." — tek paketli siparişte null. */
  paketEtiketi: string | null;
  kalemler: { ad: string; adet: number }[];
  /** Bu paketten sonra yolda olan paket sayısı; 0 ise hiç yazılmıyor. */
  kalanPaketSayisi: number;
}) {
  const takipDugmesi = trackingUrl
    ? `<a href="${escapeHtml(trackingUrl)}"
          style="display:inline-block;margin:20px 0 6px;padding:13px 26px;border-radius:999px;background:#10120f;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;">
         Kargomu takip et
       </a>`
    : "";

  const kalemSatirlari = kalemler
    .map(
      (kalem) =>
        `<tr><td style="padding:3px 0;font-size:13px;color:#5a5f54;">${escapeHtml(kalem.ad)}</td>
         <td style="padding:3px 0;font-size:13px;color:#10120f;text-align:right;">${kalem.adet} adet</td></tr>`,
    )
    .join("");

  /*
    KALAN PAKET cümlesi ayrı duruyor ve yalnızca gerçekten kalan varsa
    yazılıyor: "diğer ürünleriniz ayrıca gönderilecek" cümlesini tek
    paketli siparişte görmek, olmayan bir gönderiyi beklettirirdi.
  */
  const kalanCumlesi =
    kalanPaketSayisi > 0
      ? `<p style="margin:14px 0 0;font-size:13px;line-height:1.65;color:#5a5f54;">
           Siparişinizin kalan ${kalanPaketSayisi} paketi ayrıca gönderiliyor; her biri için
           ayrı takip numarası ileteceğiz.
         </p>`
      : "";

  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:24px 12px;background:#f4f3ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;">
    <tr>
      <td style="padding:32px 28px;">
        ${brandLogo(brand)}

        <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;color:#10120f;font-weight:600;">
          ${paketEtiketi ? "Paketiniz kargoda" : "Siparişiniz kargoda"}
        </h1>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.65;color:#5a5f54;">
          Merhaba ${escapeHtml(customerName)}, ${escapeHtml(orderNumber)} numaralı siparişinizin
          ${paketEtiketi ? `${escapeHtml(paketEtiketi)} paketi` : "tamamı"} kargoya teslim edildi.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="background:#faf9f5;border-radius:10px;">
          <tr>
            <td style="padding:14px 16px;font-size:13px;line-height:1.7;color:#5a5f54;">
              ${carrier ? `Kargo firması <strong style="color:#10120f;">${escapeHtml(carrier)}</strong><br>` : ""}
              Takip numarası
              <strong style="color:#10120f;"> ${escapeHtml(trackingNumber)}</strong>
            </td>
          </tr>
        </table>

        ${
          kalemSatirlari
            ? `<p style="margin:20px 0 6px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#8b8f85;">Bu paketteki ürünler</p>
               <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${kalemSatirlari}</table>`
            : ""
        }

        ${takipDugmesi}
        ${kalanCumlesi}

        <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#8b8f85;">
          Takip bilgisi kargo firmasının sistemine düşene kadar birkaç saat
          geçebilir. Teslim alırken paketin hasarlı olup olmadığını kontrol
          etmenizi öneririz.
        </p>
      </td>
    </tr>
  </table>

  <p style="max-width:520px;margin:16px auto 0;font-size:11px;line-height:1.6;color:#8b8f85;text-align:center;">
    ${brandFooter(brand)}
  </p>
</body>
</html>`;
}
