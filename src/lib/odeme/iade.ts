import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refundPayment, type RefundResult } from "@/lib/paytr/refund";
import { tamiAyari } from "./tami/ayar";
import { iadeEt } from "./tami/istemci";
import { kurusuTutara } from "./tami/istek";

/*
  İADE, TAHSİLATIN YAPILDIĞI SAĞLAYICIYA GİDER.

  Ödeme hangi sağlayıcıyla alındıysa iadesi de oradan yapılmak zorunda:
  yedeğe düşülen bir günde Tami ile tahsil edilmiş bir siparişin iadesini
  PayTR'a göndermek, PayTR'da "işlem bulunamadı" ile döner ve müşteri
  parasını alamaz. Sağlayıcı ödeme açılırken siparişin üstverisine
  yazılıyor (api/storefront/odeme).

  Üstveride kayıt yoksa PayTR varsayılıyor: Tami'den önceki bütün
  siparişler PayTR'dan geçti.
*/

export type { RefundResult };

export async function odemeyiIadeEt({
  supabase,
  organizationId,
  order,
  amountKurus,
  referenceNo,
}: {
  supabase: SupabaseClient;
  organizationId: string;
  order: { id: string; order_number: string; metadata: Record<string, unknown> | null };
  amountKurus: number;
  referenceNo?: string;
}): Promise<RefundResult> {
  const saglayici = String((order.metadata ?? {}).odeme_saglayicisi ?? "paytr");

  if (saglayici !== "tami") {
    /*
      PayTR sipariş numarasını harf ve rakam dışındaki karakterler
      olmadan bekliyor; ödeme oluşturulurken de böyle gönderilmişti.
    */
    return await refundPayment({
      supabase,
      organizationId,
      merchantOid: order.order_number.replace(/[^A-Za-z0-9]/g, ""),
      amountKurus,
      referenceNo,
    });
  }

  const ayar = await tamiAyari(supabase, organizationId);
  if (!ayar) {
    return { ok: false, message: "Mağazanın Tami bilgileri girilmemiş. Ayarlar → Ödeme bölümünden girin." };
  }
  if (!Number.isInteger(amountKurus) || amountKurus <= 0) {
    return { ok: false, message: "İade tutarı geçersiz." };
  }

  /*
    Tami'nin sipariş numarası ödemeyi açarken siparişin uuid'siydi;
    iade de aynı kimlikle isteniyor. Tutar verildiği için KISMİ iade
    destekleniyor (tutarsız istek siparişin tamamını iade ederdi).
  */
  const sonuc = await iadeEt(ayar, {
    odemeKimligi: order.id,
    tutar: kurusuTutara(amountKurus),
    sebep: referenceNo,
  });

  if (!sonuc.ok) return { ok: false, message: sonuc.hata };
  return { ok: true, amount: amountKurus, reference: referenceNo, isTest: ayar.testModu };
}
