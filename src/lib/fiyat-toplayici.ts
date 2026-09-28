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

/*
  Bir fiyat alanını kuruşa çevirir.

  `sayiKabul` iki farklı işi ayırıyor ve ayrım bilerek konuldu:

    GELEN veri (yer imi ucu) yalnızca METİN kabul ediyor. Kuruşa çevirme
    kuralı (iki ayırıcı, binlik grubu) parseMoneyToCents'te tek yerde
    duruyor; tarayıcının kendi çevirdiği bir sayıya güvenmek o kuralın
    ikinci bir kopyasını istemciye koymak demekti ve kopya sessizce eskir.

    SAKLANAN veri ise zaten bu uçtan geçmiş kuruş SAYISI. Onu tekrar
    "metin değil" diye elemek, kendi yazdığımız satırı okuyamamaktır.
*/
function kurusaCevir(deger: unknown, sayiKabul: boolean): number | null {
  const kurus =
    typeof deger === "string"
      ? parseMoneyToCents(deger)
      : sayiKabul && typeof deger === "number" && Number.isInteger(deger)
        ? deger
        : 0;
  return kurus > 0 && kurus <= EN_YUKSEK_FIYAT ? kurus : null;
}

function satirlariAyikla(veri: unknown, sayiKabul: boolean): { satirlar: ToplananSatir[]; atlanan: number } {
  if (!Array.isArray(veri)) return { satirlar: [], atlanan: 0 };

  const satirlar: ToplananSatir[] = [];
  const gorulen = new Map<string, number>();
  let atlanan = 0;

  for (const ham of veri.slice(0, EN_FAZLA_SATIR)) {
    const kayit = ham as Record<string, unknown> | null;
    const sku = metin(kayit?.sku, 40);
    const fiyatlar = (Array.isArray(kayit?.fiyatlar) ? kayit.fiyatlar : [])
      .map((f) => kurusaCevir(f, sayiKabul))
      .filter((kurus): kurus is number => kurus !== null)
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

/** Yer imi ucuna GELEN ham gövde: fiyat yalnızca metin olarak kabul ediliyor. */
export function satirlariDogrula(veri: unknown): { satirlar: ToplananSatir[]; atlanan: number } {
  return satirlariAyikla(veri, false);
}

/*
  arc_price_collections.satirlar'dan OKUMA.

  Yazan iki yol aynı sütuna farklı TÜRDE fiyat bırakıyordu: yer imi ucu
  gövdeyi yazmadan önce doğruladığı için kuruş SAYISI ([48710]), sunucu
  taraması ise sayfadaki METNİ ("487,10") saklıyordu. Okuyan taraf
  satirlariDogrula'yı ikinci kez çağırınca (yani gelen veriye uygulanan
  "metin olmayanı at" kuralını saklanan veriye de uygulayınca) yer imiyle
  toplanan HER satır sessizce düşüyordu.

  Sonuç, kullanıcının şikâyet ettiği hasardı: partner hesabıyla girip
  alış fiyatlarını toplamasına rağmen panel o listeyi boş görüyor,
  geriye yalnızca cron'un müşteri fiyatları kalıyor ve alış alanına
  onlar yazılıyordu. (26–28.09.2026'da 122 varyantın cost_price'ı
  müşteri fiyatına eşitlendi.)

  Bu yüzden okuma iki türü de kabul ediyor: yeni satırlar kuruş sayısı,
  eski cron satırları metin. Aralık ve uzunluk sınırları yine
  uygulanıyor — satır veritabanından geliyor diye sınırsız değil.
*/
export function saklananSatirlar(veri: unknown): ToplananSatir[] {
  return satirlariAyikla(veri, true).satirlar;
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

/*
  HANGİ TOPLAMA HANGİ GEÇİŞE YARAR.

  arc_price_collections.kaynak iki değer taşıyor ve ikisi farklı şey:

    'lr'        yer imiyle, KULLANICININ tarayıcısında toplandı. Girişliyse
                alış, çıkışsa müşteri fiyatı — hangisi olduğunu kullanıcı
                panelde söylüyor (toplayıcı tahmin etmiyor).
    'lr-genel'  sunucunun günlük taraması (api/cron/lr-fiyatlari, her gün
                06:00). GİRİŞSİZ okunuyor, yani TANIM GEREĞİ müşteri fiyatı.
                Hiçbir koşulda alış fiyatı olamaz.

  Ayrım kaydeden tarafta bilerek kuruldu (lib/lr/kaydet.ts: "ikisini tek
  etikette toplamak, hangisinin ne olduğunu kaybetmek demekti") ama OKUYAN
  taraf sütuna hiç bakmıyordu: "son toplanan liste" uygulanmamış bütün
  toplamaları birleştiriyor ve her gece cron yeni bir 'lr-genel' bırakıyor.
  Sonuç, kullanıcı girişli toplama yapsa bile müşteri fiyatlarının alış
  alanına yazılmasıydı — üstelik uygulama sırasında cron'un listeleri de
  "uygulandı" işaretlenip sessizce tükeniyordu.
*/
export type FiyatKaynagi = "lr" | "lr-genel";

export function kaynaklarIcin(gecis: "alis" | "musteri"): FiyatKaynagi[] {
  // Alış yalnızca girişli oturumdan gelebilir; cron'un listesi asla alış değil.
  return gecis === "alis" ? ["lr"] : ["lr", "lr-genel"];
}

export const KAYNAK_ADI: Record<FiyatKaynagi, string> = {
  lr: "yer imi",
  "lr-genel": "günlük tarama",
};
