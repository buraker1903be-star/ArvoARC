/*
  KURULUM REHBERİ — yeni mağazanın satışa hazır olması için kalanlar.

  Yeni bir salon panele girdiğinde Genel Bakış sıfırlarla doluydu:
  boş bir grafik, hepsi sıfır olan dört kutu ve "henüz sipariş yok".
  Ekran doğruyu söylüyordu ama SIRADAKİ İŞİ söylemiyordu; kullanıcı
  on iki menü öğesine bakıp nereden başlayacağını kendi çıkarmak
  zorundaydı.

  ADIMLARIN SEÇİMİ. Buradaki altı adım "iyi olurdu" değil, MÜŞTERİNİN
  SİPARİŞ VEREBİLMESİ için gerekenler:

    ürün yoksa satılacak bir şey yok, taslaksa vitrinde görünmez,
    ödeme yöntemi kapalıysa sepet tamamlanamaz, kargo ücreti yoksa
    sipariş toplamı hesaplanamaz, vitrin adresi yoksa mağazaya kimse
    ulaşamaz. Logo tek "yumuşak" adım ve o da müşterinin ilk
    karşılaştığı şey.

  REHBER BİTİNCE KAYBOLUYOR. Bu panelde bugün üç bant kaldırdık, her
  biri 56–114px'i sıfır göstermeye harcıyordu; kalıcı bir "kurulum"
  kartı aynı hatanın büyüğü olurdu. Elle kapatma düğmesi de yok:
  adımların hepsi gerçekten gerekli, "sonra" diyebileceğin bir şey
  değiller.

  Saf dosya; testi tests/kurulum-adimlari.test.ts.
*/

export type KurulumOlgulari = {
  urunSayisi: number;
  yayindaUrunSayisi: number;
  logoVar: boolean;
  /** Havale IBAN'ıyla ya da PayTR anahtarıyla açık mı? */
  odemeAcik: boolean;
  /** shipping_fee yazılmış mı (0 da geçerli: ücretsiz kargo). */
  kargoUcretiVar: boolean;
  vitrinAdresiVar: boolean;
};

export type KurulumAdimi = {
  anahtar: string;
  baslik: string;
  /** Neden gerekli — "yapılacaklar listesi" değil, sebep. */
  aciklama: string;
  yol: string;
  eylem: string;
  tamam: boolean;
};

export function kurulumAdimlari(olgular: KurulumOlgulari): KurulumAdimi[] {
  return [
    {
      anahtar: "urun",
      baslik: "İlk ürününü ekle",
      aciklama: "Satılacak bir şey olmadan mağaza açılmış sayılmaz. Tek varyantla başlayabilirsin.",
      yol: "/urunler?yeni=1#yeni-urun",
      eylem: "Ürün ekle",
      tamam: olgular.urunSayisi > 0,
    },
    {
      anahtar: "yayin",
      baslik: "Bir ürünü yayına al",
      /* Taslak ürün panelde görünüyor ama vitrinde yok; bu ayrım en
         sık yanlış anlaşılan şey. */
      aciklama: "Taslak ürünler vitrinde görünmez. Durumu “Aktif” yapılan ürün mağazada satışa çıkar.",
      yol: "/urunler?filter=draft",
      eylem: "Taslakları aç",
      tamam: olgular.yayindaUrunSayisi > 0,
    },
    {
      anahtar: "odeme",
      baslik: "Ödeme yöntemini aç",
      aciklama: "Havale için IBAN, kart için PayTR bilgileri gerekiyor. İkisi de kapalıyken müşteri sepeti tamamlayamaz.",
      yol: "/ayarlar#odeme-yontemleri",
      eylem: "Ödemeyi ayarla",
      tamam: olgular.odemeAcik,
    },
    {
      anahtar: "kargo",
      baslik: "Kargo ücretini belirle",
      aciklama: "Seçmediğin sürece mağazan platform varsayılanıyla satar. Sipariş toplamı bu ücretle hesaplanıyor; ücretsiz kargo için 0 yazabilirsin.",
      yol: "/ayarlar#satis-ayarlari",
      eylem: "Satış ayarları",
      tamam: olgular.kargoUcretiVar,
    },
    {
      anahtar: "vitrin",
      baslik: "Vitrin adresini bağla",
      aciklama: "Müşterinin gireceği adres. Bağlanmadan mağazanın bir kapısı yok.",
      yol: "/ayarlar#magaza-alan-adi",
      eylem: "Alan adını bağla",
      tamam: olgular.vitrinAdresiVar,
    },
    {
      anahtar: "logo",
      baslik: "Logonu yükle",
      aciklama: "Vitrinde ve sipariş e-postalarında görünür; müşterinin markanı tanıdığı ilk yer.",
      yol: "/ayarlar#marka-kimligi",
      eylem: "Logo yükle",
      tamam: olgular.logoVar,
    },
  ];
}

export type KurulumDurumu = {
  adimlar: KurulumAdimi[];
  tamamlanan: number;
  toplam: number;
  /** Rehber çizilsin mi? Hepsi bittiğinde kayboluyor. */
  gorunsun: boolean;
  /** Sıradaki iş; hepsi bittiyse null. */
  sonraki: KurulumAdimi | null;
};

export function kurulumDurumu(olgular: KurulumOlgulari): KurulumDurumu {
  const adimlar = kurulumAdimlari(olgular);
  const tamamlanan = adimlar.filter((adim) => adim.tamam).length;
  return {
    adimlar,
    tamamlanan,
    toplam: adimlar.length,
    gorunsun: tamamlanan < adimlar.length,
    /* Sıradaki, listede kalan İLK adım: sıra rastgele değil, ürün
       eklemeden yayına almanın anlamı yok. */
    sonraki: adimlar.find((adim) => !adim.tamam) ?? null,
  };
}

/*
  Ayar satırından olguları çıkarır. Sütun adları ve "açık sayılma"
  kuralı tek yerde: iki ekran aynı mağazaya "ödeme açık" ve "ödeme
  kapalı" dememeli.

  ÖDEME YÖNTEMİ AÇIK SAYILMIYOR yalnızca kutucuk işaretliyse: IBAN'ı
  girilmemiş bir havale ya da anahtarı olmayan bir PayTR, müşteriyi
  ödeme adımında duvara çarptırır — panelde "açık" görünürken.
*/
export type AyarSatiri = {
  logo_path?: string | null;
  bank_transfer_enabled?: boolean | null;
  bank_iban?: string | null;
  paytr_enabled?: boolean | null;
  paytr_merchant_id?: string | null;
  paytr_merchant_key_enc?: string | null;
  shipping_fee?: number | null;
  sales_configured_at?: string | null;
  storefront_url?: string | null;
  custom_domain?: string | null;
  platform_subdomain?: string | null;
  domain_verified_at?: string | null;
} | null;

export function ayarlardanOlgular(
  ayar: AyarSatiri,
  sayilar: { urunSayisi: number; yayindaUrunSayisi: number },
): KurulumOlgulari {
  const dolu = (deger: unknown) => typeof deger === "string" && deger.trim().length > 0;
  const havale = ayar?.bank_transfer_enabled === true && dolu(ayar?.bank_iban);
  const paytr = ayar?.paytr_enabled === true && dolu(ayar?.paytr_merchant_id) && dolu(ayar?.paytr_merchant_key_enc);
  return {
    urunSayisi: sayilar.urunSayisi,
    yayindaUrunSayisi: sayilar.yayindaUrunSayisi,
    logoVar: dolu(ayar?.logo_path),
    odemeAcik: havale || paytr,
    /*
      TARİFEYİ KİRACI SEÇTİ Mİ, "bir sayı var mı" değil. shipping_fee
      NOT NULL ve sütun varsayılanı 12000 kuruş — sistem tek mağazalıyken
      konmuş, ArvoCulture'ın tarifesi. Eski ölçüt ("sayı mı") her zaman
      doğruydu: yeni salon 120 TL kargoyla, 2000 TL ücretsiz kargo
      eşiğiyle satmaya başlıyor ve rehber bu adımı TAMAM gösteriyordu.
      Artık satış ayarlarını kaydettiğinde damgalanan sütuna bakılıyor
      (20260929081212). 0 hâlâ geçerli bir ücret: ücretsiz kargo bir karar.
    */
    kargoUcretiVar: dolu(ayar?.sales_configured_at),
    /*
      ADRES ÖLÇÜTÜ ÇÖZÜCÜDEN GENİŞ, BİLEREK. arc_storefront_org yalnızca
      doğrulanmış özel alan adına ve platform alt alan adına bakıyor;
      orada ölçüt dar, çünkü soru "bu adres KİMİN" ve yanlış cevap
      komşunun mağazasını açar.

      Rehberin sorusu başka: "bu salonun bir adresi var mı". Eski
      mağazaların adresi storefront_url'de duruyor ve onları adressiz
      saymak, yıllardır satan bir mağazaya eksik varmış gibi gösterirdi.

      Doğrulanmamış özel alan adı yine sayılmıyor: o adres gerçekten
      çalışmıyor.
    */
    vitrinAdresiVar:
      dolu(ayar?.platform_subdomain)
      || dolu(ayar?.storefront_url)
      || (dolu(ayar?.custom_domain) && Boolean(ayar?.domain_verified_at)),
  };
}
