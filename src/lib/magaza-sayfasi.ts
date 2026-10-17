/*
  MAĞAZANIN TANITIM SAYFALARI — saf kayıt.

  Üç sabit sayfa: hakkımızda, SSS, iletişim. Kiracı METNİ yazar,
  sayfanın düzeni kodda kalır (e-posta şablonlarıyla aynı tasarım).

  VARSAYILAN METİNLER BURADA DEĞİL, VİTRİNDE. Sebebi tekrar
  etmemek: sayfaları çizen yer vitrin ve varsayılan metin zaten
  orada duruyor. Buraya kopyalasaydık iki metin ayrışır, panelde
  gösterilen önizleme ile müşterinin gördüğü sayfa farklı olurdu —
  bu depoda aynı kusur e-posta ile WhatsApp arasında bir kez çıktı.

  Panel bu yüzden "yazmazsan varsayılan görünür" diyor ama
  varsayılanın kendisini göstermiyor. Dürüst olan bu: elimizde
  olmayan bir metni önizleyemeyiz.
*/

export type SayfaAnahtari = "hakkimizda" | "sss" | "iletisim";

export type SayfaTanimi = {
  ad: string;
  aciklama: string;
  /** Gövde kutusunun kaç satır açılacağı; SSS daha uzun. */
  satir: number;
  ipucu?: string;
};

export const SAYFA_KAYDI: Record<SayfaAnahtari, SayfaTanimi> = {
  hakkimizda: {
    ad: "Hakkımızda",
    aciklama: "Mağazanızı anlatan sayfa. Boş bırakırsanız genel bir tanıtım metni görünür.",
    satir: 8,
  },
  sss: {
    ad: "Sıkça sorulan sorular",
    aciklama:
      "Boş bırakırsanız kargo, iade ve ödeme hakkındaki genel sorular görünür; kargo yanıtı satış ayarlarınızdan üretilir.",
    satir: 12,
    ipucu: "Her soru bir blok: ilk satır soru, altındaki satırlar cevap. Bloklar arasında boş satır bırakın.",
  },
  iletisim: {
    ad: "İletişim",
    aciklama:
      "Sayfanın giriş metni. Telefon, e-posta ve adres bilgileri Marka kimliği ayarlarından gelir; burada tekrar yazmayın.",
    satir: 5,
  },
};

export const SAYFA_ANAHTARLARI = Object.keys(SAYFA_KAYDI) as SayfaAnahtari[];

export const BASLIK_SINIRI = 200;
export const GOVDE_SINIRI = 8000;

/*
  SSS gövdesini bloklara ayırır: ilk satır soru, kalanı cevap.

  Biçim neden böyle: kiracıya iki ayrı kutu (soru/cevap) dizisi
  vermek panelde tekrarlı bir form demekti; JSON yazdırmak ise
  metin yazan birine kod yazdırmak. Boş satırla ayrılmış bloklar,
  not defterinde bile doğru yazılabilen bir biçim.

  Soru var cevabı yoksa blok ATILIYOR: başlığı olup içeriği olmayan
  bir soru, müşteriye yanıtsız bir satır göstermek olurdu.
*/
export function sssBloklari(govde: string): Array<{ soru: string; cevap: string }> {
  return govde
    .split(/\n\s*\n/)
    .map((blok) => {
      const satirlar = blok.split("\n").map((s) => s.trim()).filter(Boolean);
      if (satirlar.length < 2) return null;
      return { soru: satirlar[0], cevap: satirlar.slice(1).join(" ") };
    })
    .filter((b): b is { soru: string; cevap: string } => b !== null);
}

/** Paragraflar: boş satırla ayrılmış bloklar, tek satıra indirilmiş. */
export function paragraflar(govde: string): string[] {
  return govde
    .split(/\n\s*\n/)
    .map((p) => p.split("\n").map((s) => s.trim()).filter(Boolean).join(" "))
    .filter(Boolean);
}
