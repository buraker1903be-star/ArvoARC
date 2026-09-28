/*
  LR FİYAT AKTARIMI — kural.  Saf modül; testi tests/fiyat-aktarimi.test.ts.

  LR kendi de satış yapıyor, bu yüzden zincir Tarzyeri'nin tersi:
  Tarzyeri'nde maliyetin üstüne kâr oranı konuyor, LR'da ise LR'ın
  MÜŞTERİ FİYATI TAVAN ve altında kalınıyor.

    üstü çizili (compare_at) = LR'ın müşteri fiyatı
    satış fiyatı (price)     = tavan − sabit indirim
    maliyet (cost_price)     = girişliyken görünen alış fiyatı

  LR kendi kampanyasını yapınca tavan düşüyor; satış fiyatı da onunla
  düşüyor ve vitrinde üstü çizili fiyatla kampanya olarak görünüyor.
  Ayrı bir "kampanya" kaydı tutulmuyor — indirim LR'ın fiyatının bir
  sonucu, bizim kararımız değil.
*/

export interface FiyatKarari {
  /** Müşteriye gösterilecek satış fiyatı (kuruş). */
  satis: number;
  /** Üstü çizili fiyat; indirim yoksa null. */
  ustuCizili: number | null;
}

export type FiyatSorunu = "tavan-yok" | "indirim-fiyati-asiyor" | "maliyetin-altinda";

/**
 * LR müşteri fiyatından bizim satış fiyatımız.
 *
 * MALİYETİN ALTINA İNMİYOR. LR bazen kendi kampanyasında müşteri
 * fiyatını çok düşürüyor; üstüne bir de bizim indirimimizi uygulamak
 * zararına satış demek olurdu ve bu ekranda fark edilmezdi.
 */
export function fiyatKarari(
  tavanKurus: number,
  indirimKurus: number,
  maliyetKurus: number | null,
): { karar: FiyatKarari } | { sorun: FiyatSorunu } {
  if (!Number.isFinite(tavanKurus) || tavanKurus <= 0) return { sorun: "tavan-yok" };
  const indirim = Number.isFinite(indirimKurus) && indirimKurus > 0 ? indirimKurus : 0;
  const satis = tavanKurus - indirim;

  // İndirim fiyatı sıfıra ya da eksiye düşürüyorsa uygulanmaz.
  if (satis <= 0) return { sorun: "indirim-fiyati-asiyor" };
  if (maliyetKurus !== null && maliyetKurus > 0 && satis < maliyetKurus) {
    return { sorun: "maliyetin-altinda" };
  }

  return {
    karar: {
      satis,
      /*
        İndirim yoksa üstü çizili fiyat da yok: LR fiyatıyla aynı tutarı
        üstü çizili göstermek müşteriye sahte kampanya sunmak olurdu.
      */
      ustuCizili: indirim > 0 ? tavanKurus : null,
    },
  };
}

/**
 * Alış geçişinde yazılacak maliyet ŞÜPHELİ Mİ?
 *
 * Alış geçişinin hiçbir denetimi yoktu: gelen sayı ne olursa olsun
 * cost_price'a yazılıyordu. 26-28.09.2026'da tam bu yüzden 122 varyantın
 * maliyeti satış fiyatına EŞİTLENDİ (yer imiyle toplanan liste okuma
 * kusuru yüzünden düşüyor, geriye cron'un müşteri fiyatları kalıyordu)
 * ve marj sıfırlandığı halde ekranda hiçbir işaret çıkmadı.
 *
 * ENGELLEMİYOR, uyarıyor: LR kendi kampanyasında müşteri fiyatını alışın
 * altına indirebiliyor ve o satırı yazmamak maliyeti eski (yanlış)
 * değerinde bırakmak olurdu. Kararı kullanıcı veriyor.
 */
export function maliyetUyarisi(maliyetKurus: number, satisKurus: number): string | undefined {
  if (!Number.isFinite(satisKurus) || satisKurus <= 0) return undefined;
  return maliyetKurus >= satisKurus ? "maliyet satış fiyatına eşit ya da üstünde" : undefined;
}

/*
  AYNI SKU BİRDEN ÇOK VARYANTTA.

  arc_product_variants'ta (organization_id, sku) üzerinde benzersizlik
  kısıtı YOK — yalnızca external_id ve supplier_sku benzersiz. Canlıda
  aynı SKU'yu altı varyantın taşıdığı ürünler var, bazı SKU'lar da dört
  AYRI ÜRÜNE dağılmış (28.09.2026'da ölçüldü).

  Eskiden önizleme SKU'yu TEK satır gösteriyordu (eşleştirme haritası
  sonuncuyu tutuyordu) ama yazma `eq("sku", …)` ile bütün kopyalara
  gidiyordu: kullanıcı bir kayda yazdığını sanıp altısına yazıyordu.
  Artık önizleme VARYANT BAŞINA satır veriyor ve yazma varyant
  kimliğiyle yapılıyor, yani görünen ile yazılan aynı şey.

  Geriye kalan tek şey kullanıcıyı uyarmak: bir SKU birden çok varyanta
  ya da birden çok ÜRÜNE dağılmışsa aynı fiyat hepsine yazılacak ve bu,
  beden/renk varyantlarında istenen şey ama ayrı ürünlerde genellikle
  bir içe aktarma hatasının belirtisi.
*/
export function skuYinelemesi(varyantSayisi: number, urunSayisi: number): string | undefined {
  if (urunSayisi > 1) return `aynı SKU ${urunSayisi} ayrı üründe; hepsine yazılacak`;
  if (varyantSayisi > 1) return `aynı SKU ${varyantSayisi} varyantta; hepsine yazılacak`;
  return undefined;
}

/*
  SKU EŞLEŞTİRME. LR'ın ürün kimliği "20604-201" biçiminde: taban
  numara + varyant eki. ArvoARC'taki SKU'lar taban numara ("20604").
  Önce birebir, sonra tabandan eşleştiriliyor — birebir olanı
  kaçırmamak için o önce deneniyor.

  KESME İŞARETİ. Katalogdaki LR SKU'ları "'20604" diye duruyor: sayıyı
  metin yapmak için başına kesme işareti koyan bir tablo programından
  geçmişler (CSV aktarımının klasik izi). İlk taramada 135 üründen
  134'ü "katalogda bulunamadı" dedi, sebebi buydu (27.09.2026).

  Veriyi düzeltmek yerine EŞLEŞTİRME hoşgörülü: SKU'lar sipariş
  kalemlerinde, tedarikçi stok eşlemesinde ve dışa aktarımlarda da
  geçiyor; 15.000 varyantın kimliğini toplu değiştirmek, bu ekranı
  kurtarmak için başka yerleri kırmak olurdu.
*/
export function skuAdaylari(lrKimligi: string): string[] {
  const sade = String(lrKimligi ?? "").trim();
  if (!sade) return [];
  const taban = sade.split("-")[0]!.trim();
  const temel = taban && taban !== sade ? [sade, taban] : [sade];
  /* Birebir olan önce: "20604", "'20604", "20604-201"… sırası korunuyor. */
  return temel.flatMap((aday) => [aday, `'${aday}`]);
}
