import "server-only";

/**
 * PayTR yapılandırması. MERCHANT_KEY ve MERCHANT_SALT gizlidir ve
 * hiçbir koşulda istemciye gönderilmez; bu yüzden NEXT_PUBLIC_
 * öneki kullanılmaz ve bu modül server-only işaretlidir.
 */
function required(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Ortam değişkeni eksik: ${name}`);
  }
  return value;
}

export function paytrConfig() {
  return {
    merchantId: required("PAYTR_MERCHANT_ID"),
    merchantKey: required("PAYTR_MERCHANT_KEY"),
    merchantSalt: required("PAYTR_MERCHANT_SALT"),
    /** 1 = test modu. Canlıya geçerken 0 yapılır. */
    testMode: process.env.PAYTR_TEST_MODE === "0" ? "0" : "1",
    storeUrl: (
      process.env.STOREFRONT_URL ?? "https://arvoculture.com"
    ).replace(/\/$/, ""),
  };
}
