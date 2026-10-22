/*
  KURUN YAŞI İNSAN DİLİNDE — SAF.

  Ham damga ("2026-10-22T13:45:02Z") bayatlığı okunur kılmıyor; panele
  bakan kişi "dün" ile "on bir gün önce" arasındaki farkı bir bakışta
  görmeli. Donmuş bir kur, fiyatı sessizce bayatlatıyor ve bu satır
  onun tek görünür izi.

  AYRI DOSYA: aynı eşikleri günlük öz denetim de kullanıyor
  (lib/oz-denetim) ve iki yerde iki ayrı eşik, panelin "güncel" dediği
  bir kuru denetimin "bayat" sayması demekti.
*/

/** Kaç günden sonra kur bayat sayılıyor. */
export const BAYAT_GUN = 4;

/*
  DÖRT GÜN, BİR DEĞİL. TCMB bülteni hafta sonu ve resmî tatilde
  yayımlanmıyor: cuma akşamı güncellenen kur pazartesi sabahı üç
  günlüktür ve bu olağan. Eşiği bir güne çekmek her hafta sonu yanlış
  alarm üretirdi — her hafta gelen bir uyarı, okunmayan bir uyarıdır.
  Dört gün, araya bir resmî tatil girse bile sessiz kalıyor; beşinci
  gün gerçekten bir şey durmuş demektir.
*/

export type KurYasi = {
  /** Panelde ve bildirimde yazılan metin ("dün", "3 gün önce"). */
  metin: string;
  gun: number;
  bayat: boolean;
};

/** Damgadan yaş; damga yoksa `null` (panel "bilinmiyor" diyor). */
export function kurYasi(damga: string | null | undefined, simdi: number): KurYasi | null {
  if (!damga) return null;
  const an = Date.parse(damga);
  if (!Number.isFinite(an)) return null;

  /*
    GÜN SAYISI TAM GÜNE YUVARLANIYOR (floor): 25 saat önce yazılmış
    bir kur "1 gün" olmalı, "2 gün" değil. İleri tarihli bir damga
    (sunucu saati kaymış) sıfır sayılıyor — eksi gün yazmak,
    okuyanı kuru sorgulamaktan çok sistemi sorgulamaya götürürdü.
  */
  const gun = Math.max(0, Math.floor((simdi - an) / 86_400_000));

  const metin = gun === 0 ? "bugün" : gun === 1 ? "dün" : `${gun} gün önce`;
  return { metin, gun, bayat: gun >= BAYAT_GUN };
}

/** Panelin tek satırı; damga yoksa `null`. */
export function kurYasiYazisi(damga: string | null | undefined, simdi = Date.now()): string | null {
  return kurYasi(damga, simdi)?.metin ?? null;
}
