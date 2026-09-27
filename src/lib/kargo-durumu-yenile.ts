import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { otoDurumunuCevir } from "@/lib/kargo-bolme";
import { OtoHatasi } from "@/lib/tryoto/hatalar";
import { otoIstek } from "@/lib/tryoto/istemci";

/*
  BİR GÖNDERİNİN DURUMUNU OTO'DAN ÇEKME.

  İki çağıran var: sipariş ekranındaki düğme ve zamanlanmış görev
  (api/cron/kargo-durumlari). Ortak modül, çünkü iki kopya er geç
  birbirinden sapar — "teslim anını bir kez yaz" gibi bir kural yalnızca
  birinde kalırsa fark ancak canlıda, yanlış teslim tarihiyle görünür.

  OTO'nun webhook'u da var ama gönderdiği yükün şekli belgelenmemiş;
  tahmine dayalı bir uç, yanlış eşleşen bir bildirimin gönderiyi "teslim
  edildi" yapması demekti. orderStatus belgeli ve tek çağrıda durumu,
  takip adresini, etiket adresini ve firmayı veriyor.
*/

export interface YenilenecekGonderi {
  id: string;
  sequence: number;
  status: string;
  /** Siparişin ArvoARC numarası; OTO'daki kimlik bundan türüyor. */
  siparisNo: string;
}

export async function gonderiDurumunuYenile(
  supabase: SupabaseClient,
  magazaId: string,
  anahtar: string,
  gonderi: YenilenecekGonderi,
): Promise<{ guncellendi: boolean; hata: string | null }> {
  try {
    const yanit = await otoIstek<Record<string, unknown>>({
      magazaId,
      yenilemeAnahtari: anahtar,
      yol: "orderStatus",
      govde: { orderId: `${gonderi.siparisNo}-${gonderi.sequence}` },
    });
    const metin = (ad: string) =>
      typeof yanit[ad] === "string" && (yanit[ad] as string).trim() ? (yanit[ad] as string).trim() : null;
    const yeniDurum = otoDurumunuCevir(metin("status"));

    await supabase.from("arc_shipments").update({
      status: yeniDurum,
      /*
        Teslim anı BİR KEZ yazılıyor: her güncellemede now() yazmak,
        gerçek teslim zamanını son çalıştırmanın zamanına kaydırırdı ve
        zamanlanmış görevde bu her 30 dakikada bir olurdu.
      */
      ...(yeniDurum === "delivered" && gonderi.status !== "delivered"
        ? { delivered_at: new Date().toISOString() }
        : {}),
      ...(metin("trackingUrl") ? { tracking_url: metin("trackingUrl") } : {}),
      ...(metin("dcTrackingNumber") ? { tracking_number: metin("dcTrackingNumber") } : {}),
      ...(metin("printAWBURL") ? { awb_url: metin("printAWBURL") } : {}),
      ...(metin("deliveryCompany") ? { carrier_name: metin("deliveryCompany") } : {}),
      ...(metin("otoId") ? { oto_order_id: metin("otoId") } : {}),
      failure_reason: null,
    }).eq("id", gonderi.id).eq("organization_id", magazaId);

    return { guncellendi: true, hata: null };
  } catch (hata) {
    const mesaj = hata instanceof OtoHatasi ? hata.message : "Durum alınamadı.";
    /*
      Sebep KAYDA yazılıyor, yalnızca döndürülmüyor: zamanlanmış görevin
      çıktısını kimse okumuyor ve sebep yalnızca orada kalsaydı gönderi
      ekranda sessizce takılı kalırdı.
    */
    await supabase.from("arc_shipments").update({ failure_reason: mesaj })
      .eq("id", gonderi.id).eq("organization_id", magazaId);
    return { guncellendi: false, hata: mesaj };
  }
}
