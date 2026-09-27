/*
  Türkiye kargo firmaları: takip bağlantısı şablonları.
  Saf modül; testi tests/kargo-firmalari.test.ts.

  Neden var: tedarikçinin kendi gönderdiği kayıtta elimizde yalnızca firma
  ve takip numarası oluyor (LR Health and Beauty böyle çalışıyor: bize
  numara veriyor, etiketi kendi basıyor). Müşteriye "Yurtiçi Kargo,
  1234567890" demek yerine tıklanabilir bir bağlantı vermek gerekiyor.

  ADRESLER DOĞRULANMALI. Kargo firmaları sorgu sayfalarını haber vermeden
  değiştiriyor; buradaki şablonlar 27.09.2026'da bilinen hâlleri. Yanlış
  bir adres müşteriyi boş sayfaya götürür, bu yüzden ŞABLON ZORUNLU DEĞİL:
  gönderide tracking_url elle de yazılabiliyor ve yazılmışsa şablonun
  önüne geçiyor.
*/

export interface KargoFirmasiTanimi {
  kod: string;
  ad: string;
  /** {no} takip numarasıyla değiştiriliyor. Bilinmiyorsa null. */
  takipSablonu: string | null;
}

/*
  ŞABLONLAR 27.09.2026'DA TEK TEK AÇILIP SINANDI. Bu bağlantılar
  müşteriye gidiyor (kargo bildirimi e-postası ve vitrindeki sipariş
  sayfası); çalışmayan bir bağlantı müşteriyi destek kanalına yolluyor.
  Sonuçlar satır satır yazılı, çünkü kargo firmalarının adresleri
  değişiyor ve bir sonraki değişiklikte neyin sınandığı bilinmeli.

  İkisi ÖLÜYDÜ: mngkargo.com.tr takip alt alanı DHL eCommerce'in ana
  sayfasına, gonderitakip.ptt.gov.tr de PTT ana sayfasına atıyordu.
*/
export const KARGO_FIRMALARI: KargoFirmasiTanimi[] = [
  // ✓ Numarayı alana yazıyor VE sorguyu çalıştırıyor.
  { kod: "yurtici", ad: "Yurtiçi Kargo", takipSablonu: "https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code={no}" },
  /*
    Doğru sayfa ama takip formu YALNIZCA POST kabul ediyor
    (action="/KargoTakip/" method="post"); adresle numara taşımanın yolu
    yok. Müşteri numarayı yapıştırıyor — e-postada ve vitrinde numara
    bağlantının hemen yanında yazılı.
  */
  { kod: "surat", ad: "Sürat Kargo", takipSablonu: "https://www.suratkargo.com.tr/KargoTakip/" },
  // ✓ Sorguyu çalıştırıyor.
  { kod: "aras", ad: "Aras Kargo", takipSablonu: "https://kargotakip.araskargo.com.tr/mainpage.aspx?code={no}" },
  /*
    MNG artık DHL eCommerce. Eski adres (kargotakip.mngkargo.com.tr)
    takip sayfasına değil DHL ANA SAYFASINA atıyordu. Yeni sayfa doğru
    ama numarayı adresten okumuyor ve ayrıca doğrulama kodu istiyor.
  */
  { kod: "mng", ad: "MNG Kargo", takipSablonu: "https://www.dhlecommerce.com.tr/gonderitakip" },
  /*
    Eski adres (gonderitakip.ptt.gov.tr/Track/Verify) ana sayfaya
    yönleniyor. Ana sayfada takip alanı var, yani yönlendirme çalışıyor;
    yine de bayat alt alana güvenmek yerine hedef doğrudan yazıldı.
    Numara adresten okunmuyor.
  */
  { kod: "ptt", ad: "PTT Kargo", takipSablonu: "https://www.ptt.gov.tr/" },
  // Sınanmadı: bu mağazada UPS ile gönderi yapılmıyor.
  { kod: "ups", ad: "UPS Kargo", takipSablonu: "https://www.ups.com/track?loc=tr_TR&tracknum={no}" },
  // Şablonu bilinmeyen firma da seçilebilmeli: numara yine kaydedilir,
  // yalnızca tıklanabilir bağlantı olmaz.
  { kod: "diger", ad: "Diğer", takipSablonu: null },
];

export const kargoFirmasiAdi = (kod: string | null | undefined): string =>
  KARGO_FIRMALARI.find((firma) => firma.kod === kod)?.ad ?? kod ?? "—";

/**
 * Takip bağlantısı. Elle girilmiş adres her zaman önce gelir: şablon
 * eskimiş olabilir ve kullanıcı doğrusunu yazmışsa o kullanılmalı.
 */
export function takipAdresi(
  firmaKodu: string | null | undefined,
  takipNumarasi: string | null | undefined,
  elleGirilen?: string | null,
): string | null {
  if (elleGirilen && elleGirilen.trim()) return elleGirilen.trim();
  const numara = takipNumarasi?.trim();
  if (!numara) return null;
  const sablon = KARGO_FIRMALARI.find((firma) => firma.kod === firmaKodu)?.takipSablonu;
  if (!sablon) return null;
  return sablon.replace("{no}", encodeURIComponent(numara));
}
