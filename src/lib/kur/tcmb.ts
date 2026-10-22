/**
 * TCMB günlük döviz kuru — SAF ayrıştırıcı.
 *
 * KAYNAK NEDEN TCMB: resmî, bedava, anahtar istemiyor ve Türkiye'de
 * muhasebenin referansı o. Ticari bir kur servisine bağlanmak hem
 * ücret hem de "servis düştüğü gün fiyat ne olacak" sorusunu
 * getiriyordu; TCMB'nin bülteni günde bir yayımlanıyor ve
 * yayımlanmadığı gün (hafta sonu, resmî tatil) adres 404 veriyor —
 * yani sessiz değil, açıkça yok.
 *
 * SAF: ağ burada yok, yalnızca metin ayrıştırma. Böylece kural
 * (hangi kur, hangi sınırlar) sınanabiliyor; yanlış bir kur bütün
 * kataloğun fiyatını yanlış yapar ve bunu hiçbir ekran söylemez.
 */

export type TcmbKuru = {
  /** 1 USD kaç TL. */
  kur: number;
  /** Bültenin tarihi, "22.10.2026" biçiminde geldiği gibi. */
  tarih: string | null;
};

/*
  ALIŞ KURU (ForexBuying) KULLANILIYOR, satış değil.

  İkisi arasındaki fark binde iki ama yön önemli: dolar fiyatı
  TL ÷ kur ile bulunuyor, yani DAHA KÜÇÜK kur DAHA YÜKSEK dolar
  fiyatı demek. Müşterinin kartı TL çekiliyor ve kendi bankası onu
  kendi kuruyla dolara çeviriyor; ekranda gösterilen rakamın o
  çevrimden AŞAĞI kalmaması gerekiyor, yoksa müşteri "yazandan fazla
  ödedim" diyor. Alış kuru bu yüzden daha güvenli taraf.

  Mağazanın kendi kârı bu seçimle korunmuyor — onu `usd_margin_percent`
  koruyor ve o panelden ayarlanıyor. Tahsilat her hâlde TL.
*/
const ALAN = "ForexBuying";

/**
 * XML'den USD kuru.
 *
 * USD BLOĞU AÇIKÇA ARANIYOR: belgedeki ilk `ForexBuying` değerini
 * almak, TCMB bir gün sıralamayı değiştirdiğinde sessizce AVUSTRALYA
 * DOLARI kurunu okumak olurdu. Blok ya da alan yoksa `null` —
 * uydurma bir kur, kur olmamasından kötü.
 */
export function tcmbUsdKuru(xml: string): TcmbKuru | null {
  if (!xml) return null;

  /* Kod="USD" olan Currency bloğu; nitelik sırası değişebildiği için
     blok başlığı gevşek, Kod koşulu kesin. */
  const blok = [...xml.matchAll(/<Currency\b[^>]*>([\s\S]*?)<\/Currency>/g)].find(
    (eslesme) => /\bKod\s*=\s*"USD"/i.test(eslesme[0]),
  );
  if (!blok) return null;

  /*
    BİRİM DE OKUNUYOR. TCMB bazı para birimlerini 100 birim üzerinden
    yayımlıyor (ör. JPY); USD'de bu 1 ama alanı yok saymak, kaynak bir
    gün değişirse yüz katı bir kur yazmak olurdu.
  */
  const birim = Number(blok[1].match(/<Unit>\s*([\d.]+)\s*<\/Unit>/)?.[1] ?? "1");
  const ham = blok[1].match(new RegExp(`<${ALAN}>\\s*([\\d.]+)\\s*</${ALAN}>`))?.[1];
  if (!ham) return null;

  const deger = Number(ham);
  if (!Number.isFinite(deger) || deger <= 0) return null;
  if (!Number.isFinite(birim) || birim <= 0) return null;

  const kur = deger / birim;
  const tarih = xml.match(/Tarih\s*=\s*"([^"]+)"/)?.[1] ?? null;
  return { kur, tarih };
}

/** Kurun kabul edilebilir aralığı: dışı ayrıştırma hatası sayılıyor. */
export const EN_AZ = 1;
export const EN_COK = 1000;

/** Kurum sahibine haber verilecek günlük değişim eşiği (yüzde). */
export const UYARI_ESIGI = 10;

export type KurKarari =
  | { uygula: true; kur: number; degisimYuzde: number | null; uyar: boolean }
  | { uygula: false; sebep: "aralik-disi" | "okunamadi" };

/**
 * Yeni kur uygulanmalı mı?
 *
 * ARALIK DIŞI DEĞER REDDEDİLİYOR (1–1000 TL): böyle bir sayı kur
 * değil, ayrıştırma hatası. Kabul edilse bütün katalog yanlış
 * fiyatlanır.
 *
 * BÜYÜK DEĞİŞİM REDDEDİLMİYOR, HABER VERİLİYOR. İlk tasarımda "%10'dan
 * fazla oynarsa uygulama" vardı; yanlıştı — Türk lirasında yüzde onluk
 * bir gün gerçekten oluyor ve o gün fiyatı DONDURMAK, kataloğu
 * olduğundan ucuza satmak demek. Reddetmek sessiz zarar, uygulayıp
 * söylemek görünür bir karar.
 */
export function kurKarari(yeni: number | null | undefined, eski: number | null | undefined): KurKarari {
  if (yeni === null || yeni === undefined || !Number.isFinite(yeni)) {
    return { uygula: false, sebep: "okunamadi" };
  }
  if (yeni < EN_AZ || yeni > EN_COK) return { uygula: false, sebep: "aralik-disi" };

  const oncesi = Number(eski);
  if (!Number.isFinite(oncesi) || oncesi <= 0) {
    /* İlk kur: karşılaştıracak bir şey yok, uyarı da yok. */
    return { uygula: true, kur: yeni, degisimYuzde: null, uyar: false };
  }

  const degisim = ((yeni - oncesi) / oncesi) * 100;
  const yuvarlanmis = Math.round(degisim * 10) / 10;
  return {
    uygula: true,
    kur: yeni,
    degisimYuzde: yuvarlanmis,
    uyar: Math.abs(degisim) >= UYARI_ESIGI,
  };
}
