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
