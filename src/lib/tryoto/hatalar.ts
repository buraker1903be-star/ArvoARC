/*
  tryOTO hata haritası. Saf modül; testi tests/tryoto-hatalar.test.ts.

  Neden ayrı dosya: OTO'nun yanıtı İngilizce ve çoğu zaman operasyoncunun
  yapabileceği bir şeyi anlatıyor ("bakiye yetersiz", "alıcı adresi eksik").
  Bunu olduğu gibi ekrana basmak kullanıcıyı destek istemeye zorluyor;
  çevirmek ve NE YAPILACAĞINI söylemek işi kendi başına bitirmesini
  sağlıyor. Çevrilemeyen mesaj OLDUĞU GİBİ gösteriliyor — sadeleştirilmiş
  genel bir "işlem başarısız" metni, gerçek sebebi gizlerdi.
*/

/** Yanıtın gövdesinden okunabilen hata metni; yoksa null. */
export function otoHataMetni(govde: unknown): string | null {
  if (!govde || typeof govde !== "object") return null;
  const kayit = govde as Record<string, unknown>;
  for (const alan of ["message", "error", "errorMessage", "msg"]) {
    const deger = kayit[alan];
    if (typeof deger === "string" && deger.trim()) return deger.trim();
  }
  // Bazı uçlar alan bazlı doğrulama hatası dönüyor: {errors:{city:["required"]}}
  const hatalar = kayit.errors;
  if (hatalar && typeof hatalar === "object") {
    const satirlar = Object.entries(hatalar as Record<string, unknown>)
      .map(([alan, deger]) => `${alan}: ${Array.isArray(deger) ? deger.join(", ") : String(deger)}`);
    if (satirlar.length) return satirlar.join(" · ");
  }
  return null;
}

/*
  Bilinen durumların Türkçesi. Eşleşme KÜÇÜK HARFE indirgenmiş metinde
  aranıyor (OTO yazımı uçtan uca tutarlı değil) ve parça eşleşmesi
  yapılıyor: mesajın tamamı sürüm sürüm değişiyor, çekirdek ifade kalıyor.
*/
const BILINEN: { iz: string; karsilik: string }[] = [
  { iz: "insufficient", karsilik: "OTO cüzdanınızda yeterli bakiye yok. Gönderi oluşturmadan önce bakiye yükleyin." },
  { iz: "balance", karsilik: "OTO cüzdanınızda yeterli bakiye yok. Gönderi oluşturmadan önce bakiye yükleyin." },
  { iz: "unauthorized", karsilik: "OTO kimlik doğrulaması reddedildi. Mağaza ayarlarındaki yenileme anahtarını kontrol edin." },
  { iz: "invalid token", karsilik: "OTO kimlik doğrulaması reddedildi. Mağaza ayarlarındaki yenileme anahtarını kontrol edin." },
  { iz: "refresh token", karsilik: "OTO yenileme anahtarı geçersiz ya da süresi dolmuş. OTO panelinden yeniden bağlanın." },
  { iz: "pickup location", karsilik: "Gönderici adresi (pickup location) bulunamadı. OTO panelinde tanımlayıp kodunu mağaza ayarlarına yazın." },
  { iz: "delivery option", karsilik: "Seçilen kargo seçeneği artık geçerli değil. Fiyatları yenileyip yeniden seçin." },
  { iz: "not found", karsilik: "OTO kaydı bulunamadı. Gönderi OTO tarafında silinmiş olabilir." },
  { iz: "already", karsilik: "Bu sipariş için OTO'da zaten bir gönderi var." },
];

/*
  "weight" ve "city" gibi TEK KELİMELİK izler bilerek listede yok. Denendi
  ve kaldırıldı: "Shipment weight exceeds carrier limit of 30kg" mesajı
  "Paket ağırlığı geçersiz" diye çevriliyordu — yani zaten anlaşılır olan
  bir hatanın en işe yarar kısmı (30kg sınırı) siliniyordu. Çeviri
  yalnızca operasyoncunun NE YAPACAĞINI kendiliğinden çıkaramayacağı
  durumlar için: bakiye, yetki, tanımsız gönderici adresi.
*/

/**
 * Kullanıcıya gösterilecek mesaj. Bilinen bir durumsa Türkçe karşılığı,
 * değilse OTO'nun kendi metni (gizlenmiyor).
 */
export function kullaniciMesaji(hamMesaj: string | null, durumKodu?: number): string {
  if (!hamMesaj) {
    /*
      401 ile 403 AYRI şeyler ve ikisini "anahtarı kontrol edin" diye
      okumak yanlış teşhise götürüyor: canlıda (27.09.2026) geçerli bir
      anahtarla dcList 403 döndü — uç ücretsiz pakette kapalı — ve iki tur
      boyunca anahtar kovalandı. 401 kimlik, 403 yetki/plan sorunu.
    */
    if (durumKodu === 401) {
      return "OTO kimlik doğrulaması reddedildi. Mağaza ayarlarındaki yenileme anahtarını kontrol edin.";
    }
    if (durumKodu === 403) {
      return "OTO bu isteği reddetti. Uç, hesabınızın paketinde kapalı olabilir (ücretsiz pakette bazı uçlar kullanılamıyor).";
    }
    if (durumKodu && durumKodu >= 500) return "OTO servisi şu an yanıt vermiyor. Biraz sonra tekrar deneyin.";
    if (durumKodu === 404) {
      return "OTO bu kaydı bulamadı (HTTP 404): istenen kimlik OTO tarafında yok.";
    }
    /*
      HTTP 200 + success:false. Ayrı yazılıyor çünkü teşhisi bambaşka:
      istek OTO'ya ULAŞTI ve reddedildi, yani ağ, anahtar ve uç doğru —
      sorun gövdededir. "Tamamlanamadı" demek bunu gizliyordu.
    */
    if (durumKodu === 200) return "OTO isteği reddetti ama sebep bildirmedi (HTTP 200).";
    /*
      DURUM KODU MESAJA YAZILIYOR. Kod olmadan "OTO isteği tamamlanamadı"
      hiçbir şey söylemiyor: 27.09.2026'da etiket alınamadı ve ekrandaki
      tek cümle buydu — 400 mü 404 mü olduğu bilinmediği için ne gövdeye
      ne kimliğe bakılabildi.
    */
    return durumKodu ? `OTO isteği tamamlanamadı (HTTP ${durumKodu}).` : "OTO isteği tamamlanamadı.";
  }
  const kucuk = hamMesaj.toLocaleLowerCase("en-US");
  const eslesen = BILINEN.find((satir) => kucuk.includes(satir.iz));
  return eslesen ? eslesen.karsilik : hamMesaj;
}

/** OTO çağrısı başarısız olduğunda fırlatılan hata; mesajı ekrana basılabilir. */
export class OtoHatasi extends Error {
  readonly durumKodu?: number;
  readonly hamMesaj: string | null;
  constructor(hamMesaj: string | null, durumKodu?: number) {
    super(kullaniciMesaji(hamMesaj, durumKodu));
    this.name = "OtoHatasi";
    this.hamMesaj = hamMesaj;
    this.durumKodu = durumKodu;
  }
}
