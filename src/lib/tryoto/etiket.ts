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
