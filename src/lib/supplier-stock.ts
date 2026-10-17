/*
  Tedarikçi stok tamponu.

  Panelde alanın açıklaması şu: "Tedarikçi stoğu bu değerin altına düşerse
  ürün satışa kapanır." Amaç, tedarikçi stoğunun gecikmeli gelmesine karşı
  güvenlik payı bırakmak: tedarikçide 2 adet göründüğü için sattığımız ürün,
  sipariş hazırlanırken tükenmiş olabiliyor.

  Alan panelde vardı, doğrulanıyordu, ama hiçbir yere kaydedilmiyordu ve
  kaydedilse bile hiçbir davranışı yoktu — ekranda duran, hiçbir şey yapmayan
  bir ayar. Kural burada uygulanıyor ve içe aktarımın iki stok yazma yolunda
  da kullanılıyor.

  Kural eşiktir, rezerv değil: tampon 5 iken tedarikçide 5 adet varsa ürün
  satılabilir ("altına düşmedi"), 4 adet varsa satışa kapanır.

  Tampon 0 kuralı devre dışı bırakır (hiçbir miktar 0'ın altına düşemez).
*/
export function sellableStock(supplierQuantity: number, stockBuffer: number | null | undefined) {
  const quantity = Number.isFinite(supplierQuantity) ? Math.max(0, Math.trunc(supplierQuantity)) : 0;
  const buffer = Number.isFinite(Number(stockBuffer)) ? Math.max(0, Math.trunc(Number(stockBuffer))) : 0;
  return quantity < buffer ? 0 : quantity;
}

/*
  AKIŞTAN DÜŞEN ÜRÜN SATIŞA KAPANIR — AMA YALNIZCA AKIŞ TAMSA.

  Tarzyeri satışa kapattığı ürünü XML'de miktarı 0'a çekmiyor, ürünü
  akıştan TAMAMEN ÇIKARIYOR. Stok turu yalnızca akışta gelen varyantları
  yazdığı için çıkarılan ürün bizde son görülen miktarla açık kalıyordu:
  16.10.2026'da iki sipariş tedarikçide çoktan kapanmış ürünlere düştü
  (bizde 92 ve 1000 adet görünüyordu, son değişiklik 9 Eylül). O gün
  akışta 14.902 varyant vardı, katalogda tedarikçi varyantı 15.365.

  Akışta olmayanı kapatmak tehlikeli bir kural: akış yarım ya da hatalı
  gelirse (tedarikçide kesinti, kesik yanıt) bütün mağaza satışa kapanır.
  Bu yüzden kapatma ancak akış, bir önceki tam turdaki ürün sayısının
  büyük kısmını taşıyorsa yapılır. Tedarikçi bir seferde çok sayıda ürünü
  gerçekten kaldırdıysa bu tur kapatma atlanır ve sayı yeni değerine
  oturur; sonraki tur (beş dakika sonra) kapatır.
*/
export const AKIS_TAMLIK_ESIGI = 0.9;

export function akisTamMi(akistakiUrun: number, oncekiToplam: number | null | undefined) {
  if (!Number.isFinite(akistakiUrun) || akistakiUrun <= 0) return false;
  const onceki = Number(oncekiToplam);
  // İlk tur: kıyaslanacak bir şey yok, akışın boş olmaması yeterli.
  if (!Number.isFinite(onceki) || onceki <= 0) return true;
  return akistakiUrun >= onceki * AKIS_TAMLIK_ESIGI;
}

/*
  VARYANT SATILABİLİR Mİ? — arc_variant_available'ın TS karşılığı.

  Aynı kural sipariş düzenleme ekranında elle yazılmıştı
  (siparisler/[id]/page.tsx: `v.supplier ? v.stock > tampon : …`).
  Yorumunda "bu kuralın ikizini çizmiyor, aynı kuralı okuyor" dense
  de yazılı hâli bir ikizdi: SQL'deki eşik değişirse rozet sessizce
  yanlış kalırdı. Kural artık burada, testi tests/supplier-stock.test.ts.

  Eşik `sellableStock` ile aynı: tampon 5 iken 5 adet satılabilir,
  4 adet kapanır. Tampon 0 kuralı devre dışı bırakır, bu yüzden
  "stok > 0" koşulu ayrıca duruyor — `>=` tek başına stoksuz
  tedarikçi ürününü de satılabilir yapardı.

  Panelin stok sayımları (operasyon, stok, tedarikçi sayfaları)
  PostgREST süzgeciyle `stock > 0` diyor ve tamponu bilmiyor; içe
  aktarım tamponun altını 0 yazdığı için tedarikçi varyantında ikisi
  aynı yanıtı veriyor. Elle stok girilen varyantta ayrışabilir.
*/
export type VaryantStogu = {
  stock: number | null | undefined;
  allow_backorder?: boolean | null;
  supplier?: string | null;
};

export function varyantSatilabilirMi(
  varyant: VaryantStogu,
  tamponlar: Map<string, number> | ((kod: string) => number | undefined),
  varsayilanTampon = 5,
): boolean {
  const stok = Number.isFinite(Number(varyant.stock)) ? Math.trunc(Number(varyant.stock)) : 0;
  if (!varyant.supplier) return stok > 0 || Boolean(varyant.allow_backorder);
  const bul = typeof tamponlar === "function" ? tamponlar : (kod: string) => tamponlar.get(kod);
  const tampon = Number(bul(varyant.supplier) ?? varsayilanTampon);
  return stok > 0 && stok >= (Number.isFinite(tampon) ? tampon : varsayilanTampon);
}

/*
  PANELDE "SATILAMAZ VARYANT" SÜZGECİ (17.10.2026).

  Üç ekran da şu süzgeci kullanıyordu: `stock <= 0 and
  allow_backorder = false`. Tedarikçi varyantında bu süzgeç HİÇ
  eşleşmiyor, çünkü arc_product_variants.allow_backorder sütununun
  varsayılanı `true` ve tedarikçi içe aktarımı bu alanı hiç
  yazmıyor — yani 15.000'den fazla tedarikçi varyantının hepsinde
  "stoksuz satış açık" duruyor.

  Ama arc_variant_available tedarikçi varyantında allow_backorder'a
  BAKMIYOR: kural yalnızca tampon. Yani stoğu 0 olan tedarikçi
  varyantı vitrinde satılamaz hâldeydi, panelin "satışa kapalı"
  sayacı ise onu görmüyordu. Operasyon merkezinin başlıca sayısı
  kataloğun büyük kısmına kördü.

  Süzgeç artık: stok sıfır ya da altında VE (tedarikçi ürünü ya da
  stoksuz satış kapalı).

  Tamponun 0 ile stok arasındaki bandı burada aranmıyor: içe aktarım
  tamponun altındaki miktarı 0 yazıyor (`sellableStock`), bu yüzden
  tedarikçi varyantının stoğu ya 0 ya tamponun üstündedir.
*/
export const SATILAMAZ_SUZGECI = "supplier.not.is.null,allow_backorder.is.false";
