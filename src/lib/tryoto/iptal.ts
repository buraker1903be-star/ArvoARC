import "server-only";
import { OtoHatasi } from "./hatalar";
import { otoIstek } from "./istemci";

/*
  OTO'DA GÖNDERİ İPTALİ.

  Panelde "İptal et" yalnızca BİZİM kaydımızı işaretliyordu; OTO'ya hiç
  haber gitmiyordu. Yani iptal edilmiş görünen bir gönderi OTO'da canlı
  kalıyor: kurye alıma gelebiliyor, tedarikçi etiketi yapıştırıp
  gönderebiliyor ve harcanan bakiye geri gelmiyor. İki taraf arasındaki
  bu ayrışma ancak müşteri beklemediği bir paket aldığında fark edilirdi.

  cancelShipment hem orderId hem shipmentId istiyor; shipmentId'yi
  saklamıyoruz, bu yüzden iptal anında orderStatus'tan okunuyor. Fazladan
  bir çağrı, ama iptal sık yapılan bir işlem değil ve bunun için sütun
  eklemek (dolayısıyla migration) gerekmiyor.
*/

/** orderStatus yanıtından OTO'nun gönderi kimliği. */
export function gonderiKimliginiOku(govde: unknown): string | null {
  if (!govde || typeof govde !== "object") return null;
  const kayit = govde as Record<string, unknown>;
  for (const ad of ["shipmentId", "shipment_id"]) {
    const deger = kayit[ad];
    if (typeof deger === "string" && deger.trim()) return deger.trim();
    if (typeof deger === "number") return String(deger);
  }
  return null;
}

export type IptalSonucu =
  | { durum: "iptal-edildi" }
  /** OTO'da böyle bir gönderi yok: bizim kaydımız iptal edilebilir. */
  | { durum: "otoda-yok" }
  | { durum: "hata"; mesaj: string };

/**
 * OTO'daki gönderiyi iptal eder.
 *
 * Başarısızlık YUTULMUYOR: çağıran, OTO iptal etmediyse bizim kaydı da
 * iptal etmemeli. Aksi hâlde panel "iptal" derken paket yola çıkar.
 */
export async function otodaGonderiyiIptalEt(
  magazaId: string,
  anahtar: string,
  otoSiparisNo: string,
): Promise<IptalSonucu> {
  let gonderiKimligi: string | null = null;
  try {
    const durum = await otoIstek<Record<string, unknown>>({
      magazaId,
      yenilemeAnahtari: anahtar,
      yol: "orderStatus",
      govde: { orderId: otoSiparisNo },
    });
    gonderiKimligi = gonderiKimliginiOku(durum);
  } catch (hata) {
    /*
      Sipariş OTO'da bulunamıyorsa iptal edilecek bir şey de yok: bizim
      kaydımız yarım kalmış bir denemeden olabilir. Bunu hata saymak,
      kullanıcıyı silinemeyen bir kayıtla baş başa bırakırdı.
    */
    if (hata instanceof OtoHatasi && hata.durumKodu === 404) return { durum: "otoda-yok" };
    return { durum: "hata", mesaj: hata instanceof OtoHatasi ? hata.message : "OTO durumu okunamadı." };
  }

  if (!gonderiKimligi) {
    /*
      Sipariş var ama gönderi hiç açılmamış (createShipment çalışmamış).
      İptal edilecek bir gönderi yok; kayıt güvenle kapatılabilir.
    */
    return { durum: "otoda-yok" };
  }

  try {
    await otoIstek({
      magazaId,
      yenilemeAnahtari: anahtar,
      yol: "cancelShipment",
      govde: { orderId: otoSiparisNo, shipmentId: gonderiKimligi },
    });
    return { durum: "iptal-edildi" };
  } catch (hata) {
    return { durum: "hata", mesaj: hata instanceof OtoHatasi ? hata.message : "OTO gönderiyi iptal etmedi." };
  }
}
