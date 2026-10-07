import { createHash } from "node:crypto";

/*
  GARANTİ SANAL POS İMZALARI. Saf modül; testi tests/garanti-imza.test.ts.

  Üç ayrı hesap var ve üçü de birbirinden farklı:

  1) güvenlikVerisi — SHA1(provizyon şifresi + terminal no'nun 9 haneye
     SOLDAN SIFIRLA tamamlanmış hâli), BÜYÜK harf. Hash sürümü ne olursa
     olsun bu adım HER ZAMAN SHA1. İptal ve iadede şifre farklı
     (PROVRFN), satışta PROVAUT.

  2) formHash — bankaya gönderilen 3D formunun imzası.
  3) donusHashiDogru — bankadan DÖNEN isteğin imzası.

  İKİ HASH SÜRÜMÜ VAR ve hangisinin geçerli olduğu üye işyeri hesabına
  göre değişiyor; banka entegrasyon belgesinde yazıyor:

   - "v512": SHA512, para birimi kodu hash'e GİRER.
   - "v0.01": SHA1, para birimi kodu hash'e GİRMEZ.

  İkisi arasındaki fark tek bir alan ve algoritma, ama yanlış seçim her
  ödemenin "hash hatalı" ile dönmesi demek ve banka hangi alanın
  uymadığını söylemiyor. Bu yüzden sürüm tahmin edilmiyor, mağaza
  ayarında duruyor (arc_store_settings.garanti_api_surumu).

  Birleştirme AYIRAÇSIZ: alanlar uç uca ekleniyor. Araya ayıraç koymak
  (örn. ":") sessizce başka bir hash üretir.
*/

export type GarantiSurum = "v512" | "v0.01";

export interface GarantiKimligi {
  /** Üye işyeri (firma) kodu. */
  isyeriNo: string;
  /** Terminal numarası. */
  terminalNo: string;
  /** PROVAUT kullanıcısının şifresi (satış/ön provizyon). */
  provizyonSifresi: string;
  /** PROVRFN kullanıcısının şifresi (iptal/iade). Yoksa iade yapılamaz. */
  iadeSifresi: string | null;
  /** 3D anahtarı (StoreKey) — bankanın panelinden alınıyor. */
  magazaAnahtari: string;
  surum: GarantiSurum;
}

const buyukOzet = (algoritma: "sha1" | "sha512", metin: string): string =>
  createHash(algoritma).update(metin, "utf8").digest("hex").toUpperCase();

const ozetAlgoritmasi = (surum: GarantiSurum) => (surum === "v512" ? "sha512" : "sha1");

/*
  TERMİNAL NO 9 HANEYE SOLDAN SIFIRLA TAMAMLANIR. Bankanın örneğinde
  str_pad(terminalId, 9, "0", STR_PAD_LEFT) var: "30691297" → "030691297".
  Tamamlamayı atlamak başka bir güvenlik verisi, dolayısıyla başka bir
  hash üretir ve banka yalnızca "hash hatalı" der.
*/
export const terminalDolgulu = (terminalNo: string): string =>
  String(terminalNo ?? "").padStart(9, "0");

/** SHA1(şifre + dolgulu terminal), büyük harf. Sürümden bağımsız. */
export function guvenlikVerisi(kimlik: GarantiKimligi, islem: "satis" | "iade"): string | null {
  const sifre = islem === "iade" ? kimlik.iadeSifresi : kimlik.provizyonSifresi;
  /* İade şifresi girilmemişse null: "iade yapılamaz" demek, boş şifreyle
     tutmayacak bir hash üretmekten iyidir. */
  if (!sifre) return null;
  return buyukOzet("sha1", `${sifre}${terminalDolgulu(kimlik.terminalNo)}`);
}

/**
 * 3D form imzası (secure3dhash).
 *
 * Alan sırası bankanın belgesindeki sıradır ve değiştirilemez; sıra
 * değişirse hash tutmaz.
 */
export function formHash(
  kimlik: GarantiKimligi,
  alanlar: {
    terminalid: string;
    orderid: string;
    txnamount: string;
    txncurrencycode: string;
    successurl: string;
    errorurl: string;
    txntype: string;
    txninstallmentcount: string;
  },
): string | null {
  const guvenlik = guvenlikVerisi(kimlik, "satis");
  if (!guvenlik) return null;
  const paraBirimi = kimlik.surum === "v512" ? alanlar.txncurrencycode : "";
  const metin = [
    alanlar.terminalid,
    alanlar.orderid,
    alanlar.txnamount,
    paraBirimi,
    alanlar.successurl,
    alanlar.errorurl,
    alanlar.txntype,
    alanlar.txninstallmentcount,
    kimlik.magazaAnahtari,
    guvenlik,
  ].join("");
  return buyukOzet(ozetAlgoritmasi(kimlik.surum), metin);
}

/*
  BANKADAN DÖNEN İSTEĞİN İMZASI.

  Banka hangi alanları imzaladığını `hashparams` içinde İKİ NOKTAYLA
  ayrılmış olarak kendisi söylüyor; biz o sırayı okuyup aynı değerleri
  uç uca ekliyor, sonuna mağaza anahtarını koyuyoruz.

  Alan listesini kendimiz sabitlemiyoruz: banka listeyi değiştirdiği gün
  bütün dönüşler geçersiz sayılır ve ödenmiş siparişler "başarısız"
  görünürdü. Eksik alan BOŞ dizge olarak giriyor — bankanın kendi
  uygulaması da öyle yapıyor.

  Karşılaştırma SABİT ZAMANLI DEĞİL ve olması da gerekmiyor: beklenen
  değeri saldırgan zaten biliyor (kendi gönderdiği hash), gizli olan
  mağaza anahtarı ve o hash'ten geri çıkarılamıyor. Yine de uzunluk
  farkı önce eleniyor ki karşılaştırma hiç çalışmasın.
*/
export function donusHashiDogru(
  kimlik: GarantiKimligi,
  donus: Record<string, string>,
): boolean {
  const gelen = (donus.hash ?? "").trim();
  const alanAdlari = (donus.hashparams ?? "").split(":").filter(Boolean);
  if (!gelen || !alanAdlari.length) return false;

  const metin = alanAdlari.map((ad) => donus[ad] ?? "").join("") + kimlik.magazaAnahtari;
  const beklenen = buyukOzet(ozetAlgoritmasi(kimlik.surum), metin);
  return gelen.length === beklenen.length && gelen.toUpperCase() === beklenen;
}
