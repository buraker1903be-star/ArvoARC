/*
  İADE NEREYE DÖNECEK? Saf modül; testi tests/iade-yonlendirme.test.ts.

  ArvoCulture iki tedarikçiyle çalışıyor ve paketler ayrı depolardan
  çıkıyor: Tarzyeri'nden gelen ürün Tarzyeri'ne, LR'dan gelen LR'a
  dönmeli. İade ekranında yalnızca ürün adı, SKU ve tutar yazıyordu;
  operasyoncu her iade için sipariş detayına gidip hangi pakette
  gittiğine bakmak zorundaydı — ve bölünmüş kargoda bu her seferinde
  ayrı bir arama demekti.

  Eşleştirme SKU üzerinden yapılıyor: iade talebi kalemleri SKU ile
  saklıyor (arc_return_requests.items), sipariş kalemi de SKU taşıyor.
*/

export interface SiparisKalemiEslesme {
  id: string;
  sku: string | null;
  /** Varyanttan gelen tedarikçi; boş olabilir (kendi ürünümüz). */
  tedarikci?: string | null;
}

export interface GonderiEslesme {
  id: string;
  sequence: number;
  status: string;
  carrier_name: string | null;
  tracking_number: string | null;
  /** Bu gönderideki sipariş kalemlerinin kimlikleri. */
  kalemIdleri: string[];
}

export interface IadeYonu {
  /** Ürün hangi tedarikçiye dönecek; bilinmiyorsa null. */
  tedarikci: string | null;
  /** Ürünün çıktığı paket; hiç kargoya verilmediyse null. */
  paket: { sequence: number; firma: string | null; takipNo: string | null; status: string } | null;
}

/**
 * Bir iade kalemi için tedarikçi ve çıkış paketi.
 *
 * İPTAL EDİLEN GÖNDERİ SAYILMIYOR: o paket yola çıkmadı, ürün müşteriye
 * ondan gitmedi. Aynı kalem birden çok pakette olamaz (tetikleyici adet
 * bütünlüğünü koruyor), ama iptal edilmiş bir denemeden sonra yenisi
 * açılmış olabilir; o yüzden iptaller elenmeden bakılırsa yanlış paket
 * gösterilirdi.
 */
export function iadeYonu(
  sku: string | null | undefined,
  kalemler: SiparisKalemiEslesme[],
  gonderiler: GonderiEslesme[],
): IadeYonu {
  const anahtar = (sku ?? "").trim();
  if (!anahtar) return { tedarikci: null, paket: null };

  const kalem = kalemler.find((k) => (k.sku ?? "").trim() === anahtar);
  if (!kalem) return { tedarikci: null, paket: null };

  const gonderi = gonderiler.find(
    (g) => g.status !== "cancelled" && g.kalemIdleri.includes(kalem.id),
  );

  return {
    tedarikci: kalem.tedarikci?.trim() || null,
    paket: gonderi
      ? { sequence: gonderi.sequence, firma: gonderi.carrier_name, takipNo: gonderi.tracking_number, status: gonderi.status }
      : null,
  };
}

/**
 * İade talebindeki tedarikçiler, tekrarsız ve sıralı.
 *
 * Başlıkta gösteriliyor: iki tedarikçiden ürün içeren bir iade TEK
 * paket olarak geri gönderilemez ve bunu kalem kalem okuyarak fark
 * etmek yerine kartın tepesinde görmek gerekiyor.
 */
export function iadeTedarikcileri(yonler: IadeYonu[]): string[] {
  return [...new Set(yonler.map((y) => y.tedarikci).filter((t): t is string => Boolean(t)))].sort((a, b) =>
    a.localeCompare(b, "tr"),
  );
}
