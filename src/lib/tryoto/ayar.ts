import { decryptSecret } from "@/lib/payment-credentials";
import { firmalariCozumle, type KargoFirmasi } from "./firmalar";
import { hesabiCozumle, type HesapBilgisi } from "./hesap";
import { fiyatSorgusuGovdesi, secenekleriCozumle, sehriSadelestir, type TeslimatSecenegi } from "./fiyat";
import { konumlariCozumle, type GondericiKonumu } from "./konumlar";
import { OtoHatasi } from "./hatalar";
import { otoIstek } from "./istemci";

/*
  Mağazanın tryOTO ayarı ve bağlantı sınaması.

  Ayar MAĞAZA BAŞINA (arc_store_settings), ortam değişkeninde değil: tek
  mağazaya sabitlenmiş yapılandırma bu projede somut hasara yol açtı
  (AGENTS.md) ve ortam değişkenine konan tek anahtar, ikinci mağaza
  açıldığında gönderileri yanlış OTO hesabına düşürürdü.
*/

export interface TryotoAyari {
  etkin: boolean;
  anahtarVar: boolean;
  gondericiKodu: string | null;
  testModu: boolean;
}

export type AyarSatiri = {
  tryoto_enabled?: boolean | null;
  tryoto_refresh_token_enc?: string | null;
  tryoto_pickup_location_code?: string | null;
  tryoto_test_mode?: boolean | null;
};

export function tryotoAyari(satir: AyarSatiri | null | undefined): TryotoAyari {
  return {
    etkin: Boolean(satir?.tryoto_enabled),
    anahtarVar: Boolean(satir?.tryoto_refresh_token_enc),
    gondericiKodu: satir?.tryoto_pickup_location_code ?? null,
    testModu: satir?.tryoto_test_mode ?? true,
  };
}

export type BaglantiSonucu =
  | { durum: "kapali" }
  | { durum: "anahtar-yok" }
  | { durum: "basarili"; hesap: HesapBilgisi | null; firmalar: KargoFirmasi[]; konumlar: GondericiKonumu[]; firmaHatasi: string | null }
  /*
    Ham mesaj ve durum kodu da taşınıyor. Yalnızca çeviriyi göstermek
    teşhisi imkânsız kılıyordu: "kimlik doğrulaması reddedildi" hem
    yanlış anahtardan hem OTO'nun kendi hatasından gelebiliyor ve ikisi
    ekranda aynı görünüyordu.
  */
  | { durum: "hata"; mesaj: string; ham: string | null; durumKodu: number | null };

/**
 * Kayıtlı anahtarla OTO'ya bağlanıp kargo firmalarını getirir.
 *
 * Ayar ekranında çağrılıyor; hesapta hangi firmaların açık olduğunu
 * panelden görmenin tek yolu bu. Hata SAYFAYI DÜŞÜRMÜYOR: ayarların geri
 * kalanı okunabilir kalmalı, yoksa yanlış yazılmış bir anahtar bütün
 * ayar ekranını erişilemez yapardı.
 */
export async function baglantiyiSina(magazaId: string, satir: AyarSatiri | null | undefined): Promise<BaglantiSonucu> {
  const ayar = tryotoAyari(satir);
  if (!ayar.etkin) return { durum: "kapali" };
  if (!satir?.tryoto_refresh_token_enc) return { durum: "anahtar-yok" };

  try {
    const anahtar = decryptSecret(satir.tryoto_refresh_token_enc);

    /*
      BAĞLANTININ DAYANAĞI accountInfo. Önce dcList kullanılıyordu ve
      yanlış seçimdi: o uç planla sınırlı ve ücretsiz hesapta HTTP 403
      döndü (27.09.2026), yani geçerli bir anahtar "bağlantı kurulamadı"
      diye okundu. accountInfo hem anahtarı doğruluyor hem paket adını ve
      BAKİYEYİ veriyor — gönderi oluşturmak OTO cüzdanından düşüyor.
    */
    const hesapGovdesi = await otoIstek({
      magazaId,
      yenilemeAnahtari: anahtar,
      yol: "accountInfo",
      yontem: "GET",
    });
    const hesap = hesabiCozumle(hesapGovdesi);

    /*
      Firma listesi artık bağlantıyı belirlemiyor: dcList plana göre
      kapalı olabiliyor ve olmaması gönderi oluşturmayı engellemiyor
      (kullanılabilir seçenekler checkOTODeliveryFee'den, fiyatlarıyla
      birlikte geliyor). Hatası ayrıca gösteriliyor, yutulmuyor.
    */
    let firmalar: KargoFirmasi[] = [];
    let firmaHatasi: string | null = null;
    try {
      const govde = await otoIstek({ magazaId, yenilemeAnahtari: anahtar, yol: "dcList", yontem: "GET" });
      firmalar = firmalariCozumle(govde);
    } catch (hata) {
      firmaHatasi = hata instanceof OtoHatasi ? hata.message : "Kargo firması listesi alınamadı.";
    }

    /*
      Gönderici konumları da çekiliyor: createOrder'a verilecek kodu
      kullanıcı OTO panelinde arayıp elle kopyalıyordu ve yanlış yazılan
      kod ancak ilk gönderi denemesinde hata veriyordu.

      Bu çağrının hatası bağlantıyı başarısız SAYMIYOR: konum listesi
      olmadan da gönderi yapılabiliyor (adres tek tek gönderiliyor), oysa
      firma listesi olmadan seçim hiç yapılamaz.
    */
    let konumlar: GondericiKonumu[] = [];
    try {
      const konumGovdesi = await otoIstek({
        magazaId,
        yenilemeAnahtari: anahtar,
        yol: "getPickupLocationList?status=active",
        yontem: "GET",
      });
      konumlar = konumlariCozumle(konumGovdesi);
    } catch {
      konumlar = [];
    }
    /*
      Liste çözülemediyse ham yanıt ekranda gösteriliyor. "Hiç firma yok"
      demek yanıltıcı olurdu: dcList'in gövde şekli belgelenmemiş ve
      tanınmayan bir sarmalayıcı, çalışan bir hesabı çalışmıyor gibi
      gösterirdi.
    */
    return { durum: "basarili", hesap, firmalar, konumlar, firmaHatasi };
  } catch (hata) {
    if (hata instanceof OtoHatasi) {
      return { durum: "hata", mesaj: hata.message, ham: hata.hamMesaj, durumKodu: hata.durumKodu ?? null };
    }
    // Şifre çözme hatası da buraya düşer: anahtar başka bir şifreleme
    // anahtarıyla yazılmışsa okunamaz ve bunu söylemek gerekir.
    return {
      durum: "hata",
      mesaj: hata instanceof Error ? hata.message : "Bağlantı sınanamadı.",
      ham: null,
      durumKodu: null,
    };
  }
}

/*
  Bir gönderi için teslimat seçenekleri. Sipariş detayında TASLAK gönderi
  varken çağrılıyor: kullanıcı firmayı fiyatını görerek seçsin.

  Hata sayfayı düşürmüyor, boş liste dönüyor ve sebebi çağırana veriliyor:
  fiyat alınamaması siparişin geri kalanını okunamaz yapmamalı ve
  tedarikçinin kendi gönderdiği kayıtlar bundan etkilenmiyor.
*/
export async function teslimatSecenekleri(
  magazaId: string,
  satir: AyarSatiri | null | undefined,
  sorgu: { cikisSehri: string; varisSehri: string; agirlikKg: number; kapidaTahsilatKurus?: number | null },
): Promise<{ secenekler: TeslimatSecenegi[]; hata: string | null }> {
  if (!satir?.tryoto_enabled || !satir.tryoto_refresh_token_enc) return { secenekler: [], hata: null };
  if (!sorgu.cikisSehri.trim() || !sorgu.varisSehri.trim()) {
    return { secenekler: [], hata: "Çıkış ya da varış şehri boş; fiyat sorulamıyor." };
  }
  const anahtar = decryptSecret(satir.tryoto_refresh_token_enc);
  const sor = async (cikis: string, varis: string) => {
    const govde = await otoIstek({
      magazaId,
      yenilemeAnahtari: anahtar,
      yol: "checkOTODeliveryFee",
      govde: fiyatSorgusuGovdesi({ ...sorgu, cikisSehri: cikis, varisSehri: varis }),
    });
    return secenekleriCozumle(govde);
  };

  try {
    const secenekler = await sor(sorgu.cikisSehri, sorgu.varisSehri);
    if (secenekler.length) return { secenekler, hata: null };

    /*
      Boş dönerse şehir adı SADELEŞTİRİLİP bir kez daha soruluyor: OTO'nun
      örnekleri Latin harfli ("Riyadh") ve şehir adı metin olarak
      eşleştiriliyor; "İstanbul" eşleşmeyip boş liste dönebiliyor. Baştan
      sadeleştirmek yanlış olurdu — OTO Türkçe adı tanıyorsa doğru yazım
      daha güvenilir. Yazım değişmediyse ikinci istek hiç atılmıyor.
    */
    const sadeCikis = sehriSadelestir(sorgu.cikisSehri);
    const sadeVaris = sehriSadelestir(sorgu.varisSehri);
    if (sadeCikis === sorgu.cikisSehri && sadeVaris === sorgu.varisSehri) {
      return { secenekler: [], hata: null };
    }
    return { secenekler: await sor(sadeCikis, sadeVaris), hata: null };
  } catch (hata) {
    return { secenekler: [], hata: hata instanceof OtoHatasi ? hata.message : "Kargo fiyatları alınamadı." };
  }
}
