import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refundPayment, type RefundResult } from "@/lib/paytr/refund";
import { tamiAyari } from "./tami/ayar";
import { iadeEt as tamiIadeEt } from "./tami/istemci";
import { kurusuTutara } from "./tami/istek";
import { garantiAyari } from "./garanti/ayar";
import { iadeEt as garantiIadeEt } from "./garanti/istemci";

/*
  İADE, TAHSİLATIN YAPILDIĞI SAĞLAYICIYA GİDER.

  Ödeme hangi sağlayıcıyla alındıysa iadesi de oradan yapılmak zorunda:
  yedeğe düşülen bir günde Tami ile tahsil edilmiş bir siparişin iadesini
  PayTR'a göndermek, PayTR'da "işlem bulunamadı" ile döner ve müşteri
  parasını alamaz. Sağlayıcı ödeme açılırken siparişin üstverisine
  yazılıyor (api/storefront/odeme).

  Üstveride kayıt yoksa PayTR varsayılıyor: Tami'den önceki bütün
  siparişler PayTR'dan geçti.

  TAMİ DALI, TAMİ BIRAKILDIKTAN SONRA DA DURUYOR. Yeni ödeme Tami'den
  açılmıyor (lib/odeme/secim.ts) ama onunla tahsil edilmiş geçmiş
  siparişlerin iadesi hâlâ oraya gitmek zorunda. Dalı silmek, o
  siparişlerin iadesini sessizce PayTR'a göndermek olurdu — PayTR
  "işlem bulunamadı" der ve müşteri parasını alamaz.

  BİLİNMEYEN SAĞLAYICI PAYTR'A DÜŞMÜYOR ARTIK. Önceki sürüm "tami
  değilse PayTR" diyordu; Garanti eklenince bu, Garanti'yle çekilmiş
  paranın iadesini PayTR'a göndermek anlamına gelirdi. Sağlayıcı artık
  tek tek eşleştiriliyor.
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

  if (saglayici === "garanti") {
    const ayar = await garantiAyari(supabase, organizationId);
    if (!ayar) {
      return { ok: false, message: "Mağazanın Garanti bilgileri girilmemiş. Ayarlar → Ödeme bölümünden girin." };
    }
    if (!Number.isInteger(amountKurus) || amountKurus <= 0) {
      return { ok: false, message: "İade tutarı geçersiz." };
    }
    /* Bankaya gönderilen sipariş numarası siparişin uuid'siydi; iade de
       aynı kimlikle isteniyor. */
    const sonuc = await garantiIadeEt(ayar, {
      siparisNo: order.id,
      tutarKurus: amountKurus,
      /* Banka alanı zorunlu tutuyor; iade sunucudan isteniyor ve
         müşterinin adresi burada yok. */
      musteriIp: "0.0.0.0",
    });
    if (!sonuc.ok) return { ok: false, message: sonuc.mesaj };
    return { ok: true, amount: amountKurus, reference: sonuc.referans ?? referenceNo, isTest: ayar.testModu };
  }

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
  const sonuc = await tamiIadeEt(ayar, {
    odemeKimligi: order.id,
    tutar: kurusuTutara(amountKurus),
    sebep: referenceNo,
  });

  if (!sonuc.ok) return { ok: false, message: sonuc.hata };
  return { ok: true, amount: amountKurus, reference: referenceNo, isTest: ayar.testModu };
}
