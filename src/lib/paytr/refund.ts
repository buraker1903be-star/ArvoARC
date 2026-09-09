import "server-only";
import crypto from "node:crypto";
import { paytrConfig } from "@/lib/paytr/config";

/**
 * PayTR iade servisi.
 *
 * Öncesinde iade için PayTR paneline girmek gerekiyordu; iki ayrı
 * yerde işlem yapmak hem yavaş hem hataya açık. Artık ARC'tan
 * yapılabiliyor ve sipariş kaydıyla birlikte yürüyor.
 *
 * PayTR dokümanı iade entegrasyonunda dikkat edilmesi
 * gerektiğini vurguluyor: yanlış tutar gönderimi maddi kayıp
 * demek. Bu yüzden tutar doğrulaması çağıran tarafta değil
 * burada yapılıyor.
 */
export type RefundResult =
  | { ok: true; amount: number; reference?: string }
  | { ok: false; message: string };

export async function refundPayment({
  merchantOid,
  amountKurus,
  referenceNo,
}: {
  merchantOid: string;
  /** İade tutarı kuruş cinsinden. */
  amountKurus: number;
  referenceNo?: string;
}): Promise<RefundResult> {
  const config = paytrConfig();

  if (!merchantOid) {
    return { ok: false, message: "Sipariş numarası eksik." };
  }

  if (!Number.isInteger(amountKurus) || amountKurus <= 0) {
    return { ok: false, message: "İade tutarı geçersiz." };
  }

  /*
    PayTR tutarı ondalık ve nokta ayraçlı bekliyor: 10.25
    Kuruş değerini ikilik gösterime çeviriyoruz.
  */
  const returnAmount = (amountKurus / 100).toFixed(2);

  const token = crypto
    .createHmac("sha256", config.merchantKey)
    .update(
      config.merchantId + merchantOid + returnAmount + config.merchantSalt,
    )
    .digest("base64");

  const body = new URLSearchParams({
    merchant_id: config.merchantId,
    merchant_oid: merchantOid,
    return_amount: returnAmount,
    paytr_token: token,
  });

  if (referenceNo) body.set("reference_no", referenceNo.slice(0, 64));

  try {
    const response = await fetch("https://www.paytr.com/odeme/iade", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const data = (await response.json()) as {
      status?: string;
      err_msg?: string;
      return_amount?: string | number;
      reference_no?: string;
      is_test?: number;
    };

    if (data.status !== "success") {
      return {
        ok: false,
        message: data.err_msg ?? "PayTR iade talebini reddetti.",
      };
    }

    return {
      ok: true,
      amount: Math.round(Number(data.return_amount ?? returnAmount) * 100),
      reference: data.reference_no,
    };
  } catch (error) {
    console.error("PayTR iade isteği başarısız:", error);
    return { ok: false, message: "PayTR'a ulaşılamadı." };
  }
}

/**
 * Ödeme durumu sorgulama.
 *
 * Bildirimin ulaşmadığı ya da şüpheli durumlarda gerçek durumu
 * PayTR'dan doğrulamak için. Panelde "Ödeme durumunu sorgula"
 * düğmesiyle kullanılır.
 */
export async function queryPaymentStatus(merchantOid: string) {
  const config = paytrConfig();

  const token = crypto
    .createHmac("sha256", config.merchantKey)
    .update(config.merchantId + merchantOid + config.merchantSalt)
    .digest("base64");

  try {
    const response = await fetch("https://www.paytr.com/odeme/durum-sorgu", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        merchant_id: config.merchantId,
        merchant_oid: merchantOid,
        paytr_token: token,
      }),
    });

    return (await response.json()) as {
      status?: string;
      payment_amount?: string;
      payment_total?: string;
      returns?: string;
      currency?: string;
      err_msg?: string;
    };
  } catch (error) {
    console.error("PayTR durum sorgusu başarısız:", error);
    return { status: "error", err_msg: "PayTR'a ulaşılamadı." };
  }
}
