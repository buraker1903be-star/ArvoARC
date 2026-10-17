/*
  MÜŞTERİ POSTALARININ METNİ KİRACININ OLSUN.

  ArvoARC'ta on tane müşteri postası var ve hepsi mağazanın logosunu,
  rengini ve adını kullanıyor — ama METİNLERİ kodda sabit. Çok
  kiracılı bir sistemde bu yetmiyor: bir salon "Siparişiniz kargoya
  verildi" derken öteki "Gönderiniz yola çıktı" demek, kendi ses
  tonunu kurmak istiyor. Metni değiştirmek için bugün dağıtım
  gerekiyordu.

  TASARIM KARARI: KİRACI METNİ DÜZENLER, HTML'İ DÜZENLEMEZ.
  Zarfın kendisi (logo, renk, altbilgi, buton) kodda kalıyor; kiracı
  yalnızca başlığı ve gövde metnini yazıyor. Sebebi iki tane:
  serbest HTML bir yazım hatasıyla postayı bozar ve müşteriye giden
  bir yüzeye kod enjekte etme kapısı açar. Metin kaçırılarak (escape)
  basıldığı için o kapı kapalı.

  ŞABLON YOKSA BUGÜNKÜ METİN. Boş bırakılan alan varsayılana düşüyor,
  yani hiçbir kiracı bir şey yazmadığı sürece postalar bugünküyle
  BİREBİR aynı kalıyor. Yeni bir kiracı açıldığında tablo boş olduğu
  halde postalar çalışır.

  Saf dosya; testi tests/eposta-sablonu.test.ts.
*/

/** Bir postanın düzenlenebilir iki parçası. */
export type SablonMetni = { baslik: string; govde: string };

/** Şablonda kullanılabilen değişkenler ve örnek değerleri (önizleme için). */
export const DEGISKENLER = {
  magaza: "Örnek Mağaza",
  musteri: "Ayşe Yılmaz",
  siparis_no: "AC261017-0042",
  tutar: "1.249,90 TL",
  kargo_firmasi: "Yurtiçi Kargo",
  takip_no: "1234567890",
} as const;

export type DegiskenAdi = keyof typeof DEGISKENLER;

/*
  KAYIT. Anahtarlar ArvoARC'ın sipariş durumlarıyla ve bildirim
  türleriyle birebir; yeni bir posta eklenince buraya satır eklenir
  ve panel ekranı kendiliğinden gösterir.

  `degiskenler` listesi yalnızca belgeleme değil: panel hangi
  değişkenlerin kullanılabileceğini bu listeden yazıyor ve metinde
  tanınmayan bir değişken kalırsa kaydetme uyarıyor. Yoksa müşteri
  postasında "{{kargo_firmasi}}" yazısını okur.
*/
export const SABLON_KAYDI: Record<
  string,
  { ad: string; aciklama: string; degiskenler: readonly DegiskenAdi[]; varsayilan: SablonMetni }
> = {
  processing: {
    ad: "Hazırlanıyor",
    aciklama: "Sipariş \"Hazırlanıyor\" durumuna alındığında gider.",
    degiskenler: ["musteri", "siparis_no", "magaza"],
    varsayilan: {
      baslik: "Siparişiniz hazırlanıyor",
      govde: "Siparişiniz hazırlanmaya başlandı. Kargoya verildiğinde takip bilgileriyle birlikte tekrar bilgilendirileceksiniz.",
    },
  },
  fulfilled: {
    ad: "Kargoya verildi",
    aciklama: "Sipariş kargoya verildiğinde, takip numarası girilmediyse gider.",
    degiskenler: ["musteri", "siparis_no", "magaza"],
    varsayilan: {
      baslik: "Siparişiniz kargoya verildi",
      govde: "Siparişiniz kargoya teslim edildi. Takip bilgileri kısa süre içinde sistemde görünür olacak.",
    },
  },
  cancelled: {
    ad: "Sipariş iptal edildi (ödenmiş)",
    aciklama: "Ödemesi alınmış bir sipariş iptal edilince gider; iade vaadi içerir.",
    degiskenler: ["musteri", "siparis_no", "magaza"],
    varsayilan: {
      baslik: "Siparişiniz iptal edildi",
      govde: "Siparişiniz iptal edildi. Ödemeniz alınmışsa, tutar en geç on dört gün içinde ödeme yaptığınız yönteme iade edilir.",
    },
  },
  cancelled_unpaid: {
    ad: "Sipariş iptal edildi (ödenmemiş)",
    aciklama: "Ödemesi ulaşmamış sipariş iptal edilince gider; iade vaadi İÇERMEZ.",
    degiskenler: ["musteri", "siparis_no", "magaza"],
    varsayilan: {
      baslik: "Siparişiniz iptal edildi",
      govde: "Ödemeniz ulaşmadığı için siparişiniz iptal edildi. Sizden herhangi bir tutar tahsil edilmedi; dilediğiniz zaman yeniden sipariş verebilirsiniz.",
    },
  },
  refunded: {
    ad: "İade tamamlandı",
    aciklama: "Siparişin tamamı iade edildiğinde gider.",
    degiskenler: ["musteri", "siparis_no", "magaza"],
    varsayilan: {
      baslik: "İadeniz tamamlandı",
      govde: "İade işleminiz tamamlandı. Tutarın kartınıza yansıma süresi bankanıza bağlıdır.",
    },
  },
};

export const SABLON_ANAHTARLARI = Object.keys(SABLON_KAYDI);

/** Metinde geçen {{degisken}} adları. */
export function metindekiDegiskenler(metin: string): string[] {
  return [...metin.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((e) => e[1]);
}

/**
 * Şablonda tanınmayan değişken var mı? Varsa adları döner.
 *
 * Panel kaydetmeden önce soruyor: tanınmayan değişken müşteriye
 * "{{kargo_firmasi}}" diye basılır ve kimse fark etmez.
 */
export function taninmayanDegiskenler(anahtar: string, metin: SablonMetni): string[] {
  const izinli = new Set<string>(SABLON_KAYDI[anahtar]?.degiskenler ?? []);
  const gecenler = [...metindekiDegiskenler(metin.baslik), ...metindekiDegiskenler(metin.govde)];
  return [...new Set(gecenler.filter((ad) => !izinli.has(ad)))];
}

/**
 * Değişkenleri yerleştirir. Değeri olmayan değişken BOŞ bırakılmaz,
 * olduğu gibi kalır: eksik veriyle giden postada "{{takip_no}}"
 * görmek, sessizce boşluk görmekten iyidir — biri fark eder.
 */
export function sablonuUygula(metin: SablonMetni, degerler: Partial<Record<DegiskenAdi, string>>): SablonMetni {
  const yerlestir = (ham: string) =>
    ham.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (tam, ad: string) => {
      const deger = degerler[ad as DegiskenAdi];
      return deger === undefined || deger === "" ? tam : deger;
    });
  return { baslik: yerlestir(metin.baslik), govde: yerlestir(metin.govde) };
}

/**
 * Kiracının kaydı ile varsayılanı birleştirir. Boş ya da yalnızca
 * boşluktan oluşan alan varsayılana düşer: kiracı bir alanı
 * temizlediğinde postanın o kısmı boş gitmez.
 */
export function sablonuCoz(anahtar: string, kayit?: Partial<SablonMetni> | null): SablonMetni | null {
  const tanim = SABLON_KAYDI[anahtar];
  if (!tanim) return null;
  const sec = (ozel: string | undefined, varsayilan: string) => {
    const sade = (ozel ?? "").trim();
    return sade.length > 0 ? sade : varsayilan;
  };
  return {
    baslik: sec(kayit?.baslik, tanim.varsayilan.baslik),
    govde: sec(kayit?.govde, tanim.varsayilan.govde),
  };
}
