import { createHmac, timingSafeEqual } from "node:crypto";

/*
  TARAYICI TOPLAYICISININ JETONU.

  Toplayıcı LR'ın sayfasında, kullanıcının kendi oturumunda çalışıyor ve
  topladığı satırları panele gönderiyor. O istek bizim çerezlerimizi
  taşımıyor (başka bir alan adındayız), yani ucun kimin adına yazdığını
  başka bir şeyden bilmesi gerekiyor.

  Jeton SAKLANMIYOR, TÜRETİLİYOR: mağaza kimliği + bitiş zamanı, sunucu
  anahtarıyla imzalanmış. Veritabanında jeton tablosu tutmak, iptal
  edilmiş jetonu hatırlamak için ayrıca bir okuma demekti; burada
  iptal etme ihtiyacı yok çünkü jeton yalnızca "önizlenecek liste
  bırakma" yetkisi veriyor — fiyat yazmıyor, insan onaylıyor.

  Yine de SÜRELİ: sızan bir jeton sonsuza kadar geçerli olmasın.
  Süresi dolunca panel yeni bir yer imi kodu gösteriyor.

  İmza anahtarı PAYMENT_CREDENTIALS_KEY'den ALAN AYRIMIYLA türetiliyor
  (aşağıdaki BILGI dizgisi). Yeni bir ortam değişkeni eklemek, canlıda
  unutulunca bu özelliğin sessizce 401 dönmesi demekti; aynı anahtarı
  ham hâliyle iki iş için kullanmak ise şifreleme ile imzalamayı
  karıştırmak olurdu.
*/

const BILGI = "arc/fiyat-toplayici/v1";
export const GECERLILIK_GUN = 90;

function imzaAnahtari(): Buffer {
  const raw = process.env.PAYMENT_CREDENTIALS_KEY;
  if (!raw) throw new Error("PAYMENT_CREDENTIALS_KEY tanımlı değil.");
  return createHmac("sha256", Buffer.from(raw, "base64")).update(BILGI).digest();
}

/** İmza anahtarı var mı (panelde yer imi kodu yerine uyarı göstermek için). */
export function jetonAnahtariVar(): boolean {
  try {
    imzaAnahtari();
    return true;
  } catch {
    return false;
  }
}

const imzala = (govde: string) =>
  createHmac("sha256", imzaAnahtari()).update(govde).digest("base64url");

/** `<mağaza kimliği>.<bitiş saniyesi>.<imza>` */
export function toplayiciJetonu(organizationId: string, simdi = new Date()): { jeton: string; bitis: Date } {
  const bitis = new Date(simdi.getTime() + GECERLILIK_GUN * 86_400_000);
  const saniye = Math.floor(bitis.getTime() / 1000);
  const govde = `${organizationId}.${saniye}`;
  return { jeton: `${govde}.${imzala(govde)}`, bitis };
}

export function jetonuCoz(jeton: string, simdi = new Date()): { organizationId: string; bitis: Date } | null {
  const parcalar = String(jeton ?? "").split(".");
  if (parcalar.length !== 3) return null;
  const [organizationId, saniyeMetni, imza] = parcalar;
  const saniye = Number(saniyeMetni);
  if (!organizationId || !Number.isSafeInteger(saniye) || saniye <= 0 || !imza) return null;

  /*
    Sabit zamanlı karşılaştırma ve önce uzunluk: timingSafeEqual farklı
    uzunlukta istisna fırlatıyor.
  */
  let beklenen: string;
  try {
    beklenen = imzala(`${organizationId}.${saniye}`);
  } catch {
    // Anahtar tanımlı değil: kapalı başarısızlık.
    return null;
  }
  const a = Buffer.from(imza);
  const b = Buffer.from(beklenen);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const bitis = new Date(saniye * 1000);
  if (bitis.getTime() <= simdi.getTime()) return null;
  return { organizationId, bitis };
}
