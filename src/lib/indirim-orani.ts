/**
 * İndirim oranı ile fiyat ikilisi arasındaki çevrim.
 *
 * ArvoARC'ta indirim ayrı bir alan değil: satış fiyatı `price`,
 * indirimsiz fiyat `compare_at_price` olarak saklanıyor ve vitrin
 * `compare_at_price > price` olduğunda üstü çizili fiyatı gösteriyor.
 * Oran bu ikisinden TÜRETİLİR, saklanmaz — iki kaynak olsaydı biri
 * elle değişince diğeri yalan söylerdi.
 *
 * Panelde operasyon bunun tersini istiyordu: "%20 indir" demek için
 * hesap makinesiyle yeni fiyatı bulup iki alanı elle doldurmak
 * gerekiyordu. Bu dosya çevrimin iki yönünü de veriyor.
 *
 * Tutarlar TL, kuruşta yuvarlanır: veritabanı kuruş tamsayısı tuttuğu
 * için üç ondalıklı bir ara değer zaten kaydedilemez.
 */

/** Satış ve indirimsiz fiyattan oran (%). İndirim yoksa null. */
export function indirimOrani(satis: number, liste: number): number | null {
  if (!Number.isFinite(satis) || !Number.isFinite(liste)) return null;
  if (liste <= 0 || satis < 0) return null;
  /* Karşılaştırma fiyatı satıştan büyük değilse indirim yok demektir;
     vitrin de bu durumda üstü çizili fiyatı hiç göstermiyor. */
  if (liste <= satis) return null;
  return Math.round(((liste - satis) / liste) * 10000) / 100;
}

/** İndirimsiz fiyat ve orandan satış fiyatı. Geçersiz oranda null. */
export function indirimliFiyat(liste: number, oran: number): number | null {
  if (!Number.isFinite(liste) || !Number.isFinite(oran)) return null;
  if (liste <= 0 || oran <= 0 || oran >= 100) return null;
  return Math.round(liste * (1 - oran / 100) * 100) / 100;
}

/**
 * Alanlardaki metinden sayı. Boş alan 0 değil, NaN sayılır: boş
 * karşılaştırma fiyatı "indirim yok" demek, "0 TL" demek değil.
 */
export function tutar(metin: string): number {
  const sade = metin.trim();
  if (!sade) return Number.NaN;
  return Number(sade.replace(",", "."));
}

/** Alana yazılacak biçim. Geçersiz sayı alanı boşaltır. */
export function tutarMetni(deger: number | null): string {
  return deger === null || !Number.isFinite(deger) ? "" : deger.toFixed(2);
}

/** Oran alanına yazılacak biçim: %20 "20", %14,93 "14.93". */
export function oranMetni(oran: number | null): string {
  if (oran === null || !Number.isFinite(oran)) return "";
  return String(Math.round(oran * 100) / 100);
}

/* ---------- Alanların birbirini güncellemesi ---------- */

export type FiyatDurumu = { satis: string; liste: string; oran: string };

/** Kayıtlı varyanttan başlangıç durumu; oran iki fiyattan türetilir. */
export function fiyatDurumu(satis: string, liste: string): FiyatDurumu {
  return { satis, liste, oran: oranMetni(indirimOrani(tutar(satis), tutar(liste))) };
}

/**
 * Oran alanı açık mı. Uygulanacak bir taban fiyat yoksa kapalı:
 * boş varyant formunda önce orana yazılsaydı hiçbir şey olmaz, sonra
 * fiyat girilince yazılan oran sessizce silinirdi.
 */
export function tabanVar(durum: FiyatDurumu): boolean {
  return tutar(durum.satis) > 0 || tutar(durum.liste) > 0;
}

/** Satış fiyatı elle değişti: oran iki fiyattan yeniden türetilir. */
export function satisYazildi(durum: FiyatDurumu, deger: string): FiyatDurumu {
  return { ...durum, satis: deger, oran: oranMetni(indirimOrani(tutar(deger), tutar(durum.liste))) };
}

/** Karşılaştırma fiyatı elle değişti. */
export function listeYazildi(durum: FiyatDurumu, deger: string): FiyatDurumu {
  return { ...durum, liste: deger, oran: oranMetni(indirimOrani(tutar(durum.satis), tutar(deger))) };
}

/**
 * Oran yazıldı: fiyatlar buna göre kurulur.
 *
 * HESAP HER ZAMAN KARŞILAŞTIRMA FİYATINDAN YAPILIYOR, satıştan değil —
 * alana önce "2" sonra "25" yazılırken satış taban alınsaydı indirimler
 * üst üste biner ve fiyat her tuşta biraz daha düşerdi.
 *
 * Alan boşaltılınca indirim KALKIYOR: satış indirimsiz fiyata döner,
 * karşılaştırma boşalır. Bu aynı zamanda oranı silip yeniden yazmayı
 * güvenli kılıyor; ara adımda taban kaybolmuyor.
 */
export function oranYazildi(durum: FiyatDurumu, deger: string): FiyatDurumu {
  const istenen = tutar(deger);

  if (!Number.isFinite(istenen) || istenen <= 0) {
    const taban = tutar(durum.liste);
    return taban > 0
      ? { satis: tutarMetni(taban), liste: "", oran: deger }
      : { ...durum, oran: deger };
  }

  const taban = tutar(durum.liste) > 0 ? tutar(durum.liste) : tutar(durum.satis);
  const indirimli = indirimliFiyat(taban, istenen);
  if (indirimli === null) return { ...durum, oran: deger };

  return { satis: tutarMetni(indirimli), liste: tutarMetni(taban), oran: deger };
}
