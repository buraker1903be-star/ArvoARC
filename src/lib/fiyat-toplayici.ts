/*
  TARAYICI TOPLAYICISI — gelen satırların doğrulanması. Saf modül;
  testi tests/fiyat-toplayici.test.ts.

  LR'ın portalını sunucudan taramak denenmedi: site Apache Wicket
  (durum tutuyor, derin bağlantı ana sayfaya atıyor — 27.09.2026'da
  ölçüldü) ve giriş CAS SSO'yla, tek kullanımlık bir jetonla yapılıyor.
  Taklit etmek kullanıcının LR şifresini saklamayı gerektirirdi.

  Onun yerine toplayıcı KULLANICININ TARAYICISINDA, kendi açtığı
  oturumda çalışıyor (public/fiyat-toplayici.js) ve okuduğu satırları
  bu uca gönderiyor. Gelen veri tamamen istemci tarafından üretildiği
  için hiçbir alanına güvenilmiyor: sayı sınırı, uzunluk sınırı ve
  fiyat aralığı burada uygulanıyor.

  Gelen liste DOĞRUDAN FİYAT YAZMIYOR: panelde önizlenip onaylanıyor.
  Sayfa tasarımı değiştiğinde toplayıcı yanlış sütunu okuyabilir ve
  canlı mağazada yanlış fiyat geri alınamaz bir hatadır.
*/

import { parseMoneyToCents } from "./money";

export interface ToplananSatir {
  /** LR'ın ürün kimliği ("20604-201"); eşleştirme lib/fiyat-aktarimi.ts'te. */
  sku: string;
  ad: string;
  /** Kartta görünen bütün fiyatlar, kuruş. */
  fiyatlar: number[];
}

/*
  Toplayıcı fiyatları SAYFADA YAZDIĞI GİBİ, metin olarak gönderiyor
  ("1.234,56 ₺"). Kuruşa çevirme parseMoneyToCents'te: iki ayırıcı
  kuralı tek bir yerde duruyor ve yapıştırma yoluyla gelen satırlarla
  aynı sonucu veriyor. Tarayıcıda çevirmek, aynı kuralın ikinci bir
  kopyası demekti ve kopya sessizce eskir.
*/

/** Tek turda kabul edilen satır sayısı; gerisi kırpılıyor. */
export const EN_FAZLA_SATIR = 2_000;
/** 100.000 ₺ üstü bir değer fiyat değil, okunma hatasıdır. */
const EN_YUKSEK_FIYAT = 10_000_000;
const EN_FAZLA_FIYAT = 6;

const metin = (deger: unknown, uzunluk: number) =>
  typeof deger === "string" ? deger.trim().replace(/\s+/g, " ").slice(0, uzunluk) : "";

export function satirlariDogrula(veri: unknown): { satirlar: ToplananSatir[]; atlanan: number } {
  if (!Array.isArray(veri)) return { satirlar: [], atlanan: 0 };

  const satirlar: ToplananSatir[] = [];
  const gorulen = new Map<string, number>();
  let atlanan = 0;

  for (const ham of veri.slice(0, EN_FAZLA_SATIR)) {
    const kayit = ham as Record<string, unknown> | null;
    const sku = metin(kayit?.sku, 40);
    const fiyatlar = (Array.isArray(kayit?.fiyatlar) ? kayit.fiyatlar : [])
      .filter((f): f is string => typeof f === "string")
      .map((f) => parseMoneyToCents(f))
      .filter((kurus) => kurus > 0 && kurus <= EN_YUKSEK_FIYAT)
      .slice(0, EN_FAZLA_FIYAT);
    if (!sku || !fiyatlar.length) { atlanan += 1; continue; }

    const satir = { sku, ad: metin(kayit?.ad, 160), fiyatlar };
    /*
      Aynı ürün listede iki kez görünebiliyor (öneri şeridi + kart).
      SONUNCU kazanıyor: sayfanın aşağısındaki kart genelde ürünün
      kendi kartı, yukarıdaki şerit ise kırpılmış bir kopyası.
    */
    const yer = gorulen.get(sku.toLocaleUpperCase("tr-TR"));
    if (yer === undefined) {
      gorulen.set(sku.toLocaleUpperCase("tr-TR"), satirlar.length);
      satirlar.push(satir);
    } else {
      satirlar[yer] = satir;
    }
  }
  if (Array.isArray(veri) && veri.length > EN_FAZLA_SATIR) atlanan += veri.length - EN_FAZLA_SATIR;
  return { satirlar, atlanan };
}

/**
 * Karttaki fiyatlardan GEÇERLİ olanı.
 *
 * LR kampanya yaptığında kartta iki fiyat oluyor: üstü çizili eski
 * fiyat ve geçerli olan yeni fiyat. En düşüğü alınıyor — en yükseği
 * almak, LR'ın indirimini görmezden gelip müşteriye kampanyasız fiyat
 * göstermek olurdu (indirimlerin vitrine yansıması bu işin sebebi).
 * Tek fiyat varsa sonuç zaten o.
 */
export function gecerliFiyat(fiyatlar: number[]): number | null {
  const gecerli = fiyatlar.filter((f) => Number.isInteger(f) && f > 0);
  return gecerli.length ? Math.min(...gecerli) : null;
}
