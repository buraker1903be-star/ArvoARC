/*
  Etiket (AWB) bilgisinin çözülmesi. Saf modül; testi tests/tryoto-etiket.test.ts.

  İki ayrı uç aynı alanları döndürüyor: print/{orderId} ve orderStatus.
  Çözüm tek yerde, çünkü etiket adresi ikisinden hangisinden gelirse
  gelsin aynı sütuna yazılıyor ve alan adları OTO'da tutarsız
  (trackingNumber / dcTrackingNumber ikisi de görülüyor).
*/

export interface EtiketBilgisi {
  awbUrl: string | null;
  takipNo: string | null;
  firma: string | null;
}

export function etiketiCozumle(govde: unknown): EtiketBilgisi {
  if (!govde || typeof govde !== "object") return { awbUrl: null, takipNo: null, firma: null };
  const kayit = govde as Record<string, unknown>;
  const metin = (ad: string): string | null => {
    const deger = kayit[ad];
    if (typeof deger === "string" && deger.trim()) return deger.trim();
    if (typeof deger === "number") return String(deger);
    return null;
  };
  return {
    awbUrl: metin("printAWBURL") ?? metin("awbUrl") ?? metin("labelUrl"),
    /*
      dcTrackingNumber de okunuyor: orderStatus örneğinde takip numarası o
      alanda geliyor ve gönderi henüz firmaya düşmemişken BOŞ oluyor —
      bu yüzden boş metin null sayılıyor, yoksa kayda boş takip numarası
      yazılıp müşteriye çalışmayan bir bağlantı gidiyordu.
    */
    takipNo: metin("trackingNumber") ?? metin("dcTrackingNumber"),
    firma: metin("deliveryCompany") ?? metin("deliveryCompanyName"),
  };
}

/** Etiket kullanılabilir mi: AWB adresi olmadan yazdırılacak bir şey yok. */
export const etiketHazir = (bilgi: EtiketBilgisi | null): boolean => Boolean(bilgi?.awbUrl);

/*
  TEŞHİS NOTLARI. Etiket gelmediğinde ekranda yalnızca "etiket adresi boş"
  yazıyordu ve yanıtın en bilgilendirici alanı — gönderinin OTO'daki
  DURUMU — hiç gösterilmiyordu (27.09.2026: iki tur bu yüzden kayboldu).
  Aşağıdaki iki fonksiyon yanıtı ekrana basılabilir tek satıra indiriyor.
*/

const metinAl = (kayit: Record<string, unknown>, ad: string): string | null => {
  const deger = kayit[ad];
  if (typeof deger === "string" && deger.trim()) return deger.trim();
  if (typeof deger === "number") return String(deger);
  return null;
};

/** orderStatus yanıtının özeti: durum, gönderi kimliği, firma. */
export function durumOzeti(govde: unknown): string | null {
  if (!govde || typeof govde !== "object" || Array.isArray(govde)) return null;
  const kayit = govde as Record<string, unknown>;
  const parcalar = [
    ["durum", metinAl(kayit, "status")],
    ["gönderi", metinAl(kayit, "shipmentId")],
    ["firma", metinAl(kayit, "deliveryCompany")],
  ]
    .filter(([, deger]) => deger)
    .map(([ad, deger]) => `${ad}=${deger}`);
  return parcalar.length ? parcalar.join(", ") : null;
}

/**
 * shipmentTransactions yanıtının özeti.
 *
 * Bu ucun tek sorusu var: OTO'da bu siparişe bağlı bir gönderi GERÇEKTEN
 * var mı? createShipment "başarılı" dönüp gönderi yine oluşmayabiliyor
 * (kargo firması reddederse OTO bunu Shipment Error Logs'a yazıyor) ve
 * o durumda beklemek sonuçsuz.
 */
export function gonderiOzeti(govde: unknown): string | null {
  if (!govde || typeof govde !== "object") return null;
  const liste = (govde as Record<string, unknown>).shipments;
  if (!Array.isArray(liste)) return null;
  if (!liste.length) return "OTO'da bu siparişe bağlı gönderi kaydı YOK";
  return liste
    .filter((satir): satir is Record<string, unknown> => Boolean(satir) && typeof satir === "object")
    .map((satir) => {
      // Alan adı OTO belgesinde "shipmentNumnber" diye yazılı; iki yazım da okunuyor.
      const no = metinAl(satir, "shipmentNumber") ?? metinAl(satir, "shipmentNumnber");
      const durum = metinAl(satir, "status");
      const firma = metinAl(satir, "deliveryCompanyName");
      return [no && `no=${no}`, durum && `durum=${durum}`, firma && `firma=${firma}`].filter(Boolean).join(", ");
    })
    .filter(Boolean)
    .join(" | ");
}
