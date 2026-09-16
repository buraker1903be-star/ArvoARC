import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Ödeme sağlayıcısı (PayTR) mağaza anahtarlarının şifrelenmesi.
//
// merchant_key ve merchant_salt veritabanına düz yazılmaz: AES-256-GCM ile
// şifrelenir, anahtar yalnızca sunucudaki PAYMENT_CREDENTIALS_KEY ortam
// değişkenindedir (32 bayt, base64). Veritabanı sızsa bile anahtarlar
// okunamaz; tablo zaten yalnızca service_role'e açıktır.
//
// Biçim: "v1:<iv base64>:<etiket base64>:<şifreli metin base64>"

const VERSION = "v1";

function masterKey(): Buffer {
  const raw = process.env.PAYMENT_CREDENTIALS_KEY;
  if (!raw) throw new Error("PAYMENT_CREDENTIALS_KEY tanımlı değil. Vercel ortam değişkenlerine ekleyin.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("PAYMENT_CREDENTIALS_KEY 32 baytlık base64 bir anahtar olmalıdır.");
  return key;
}

/** Şifreleme anahtarı tanımlı mı (ayarlar ekranında uyarı için). */
export function paymentCredentialsConfigured(): boolean {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(value: string): string {
  const [version, iv, tag, data] = value.split(":");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Şifreli değer biçimi tanınmadı.");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
