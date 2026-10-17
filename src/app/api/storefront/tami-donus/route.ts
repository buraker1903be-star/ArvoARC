import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/paytr/service-client";
import { dogrulanamadiSayfasi } from "@/lib/odeme/sonuc-sayfasi";
import { magazaAdresi } from "@/lib/magaza-adresi";
import { tamiAyariCoz, TAMI_ALANLARI } from "@/lib/odeme/tami/ayar";
import { sorgula } from "@/lib/odeme/tami/istemci";
import { odemeSonucu } from "@/lib/odeme/tami/yanit";
import { sendOrderConfirmation } from "@/lib/siparis-onay-postasi";
import { recordOrderEvent } from "@/lib/siparis-olayi";

/*
  MÜŞTERİNİN TAMİ'DEN DÖNÜŞÜ.

  Ortak ödeme sayfasında sunucudan sunucuya bildirim YOK: sonucu ancak
  müşteri buraya döndüğünde öğreniyoruz. Bu yüzden dönüşün KENDİSİ
  kanıt sayılmıyor — adres elle de çağrılabilir. Ödeme, Tami'nin
  /payment/query cevabıyla doğrulanıyor (lib/odeme/tami/yanit.ts:
  PaymentStatus SUCCESS + orderStatus AUTH + tutar eşit).

  Adresten yalnızca sipariş kimliği (uuid) okunuyor; tutar, durum ve
  para birimi gibi hiçbir değer istemciden alınmıyor. PayTR tarafında
  öğrendiğimiz kuralın aynısı.

  Müşteri geri dönmezse (sekmeyi kapattı, ağ koptu) sipariş
  "bekliyor"da kalır; onları zamanlanmış görev sorgulayacak.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Siparis = {
  id: string;
  organization_id: string;
  order_number: string;
  total: number;
  payment_status: string | null;
};

const vitrineDon = (adres: string | null, yol: string) =>
  NextResponse.redirect(adres ? `${adres}${yol}` : `https://arvo-os.com${yol}`, { status: 303 });

export async function GET(request: Request) {
  const odemeKimligi = new URL(request.url).searchParams.get("odeme") ?? "";
  const supabase = createServiceClient();

  /*
    OKUMA HATASI "SİPARİŞ YOK" DEĞİLDİR (17.10.2026). Kayıt
    okunamadığında da `siparis` null geliyordu ve kod bunu uydurma
    kimlikle gelen istekle aynı saymış, müşteriyi hiçbir açıklama
    yapmadan ana sayfaya atıyordu — üstelik kart dönüşünde, yani
    paranın çekilmiş olabileceği anda. PayTR'de ayrı bir bildirim ucu
    var, burada yok: bu dönüş siparişi kapatan TEK yol.

    Geçici bir kesinti olabileceği için bir kez daha deneniyor; yine
    okunamazsa müşteriye ne olduğu yazılıyor (lib/odeme/sonuc-sayfasi).
  */
  const siparisiOku = () => supabase
    .from("arc_orders")
    .select("id,organization_id,order_number,total,payment_status")
    .eq("id", odemeKimligi)
    .maybeSingle();
  let { data: siparis, error: okumaHatasi } = await siparisiOku();
  if (okumaHatasi) {
    console.error("[tami] sipariş okunamadı, yeniden deneniyor", odemeKimligi, okumaHatasi.message);
    ({ data: siparis, error: okumaHatasi } = await siparisiOku());
  }
  if (okumaHatasi) {
    console.error("[tami] sipariş okunamadı, ödeme doğrulanamadı", odemeKimligi, okumaHatasi.message);
    return dogrulanamadiSayfasi(odemeKimligi);
  }

  if (!siparis) {
    /* Uydurma kimlikle gelen istek: hiçbir şey açıklamadan ana sayfaya. */
    console.error("[tami] dönüşte sipariş bulunamadı", odemeKimligi);
    return vitrineDon(null, "/");
  }
  const order = siparis as Siparis;

  const { data: ayarSatiri } = await supabase
    .from("arc_store_settings")
    .select(`custom_domain,domain_verified_at,platform_subdomain,storefront_url,${TAMI_ALANLARI}`)
    .eq("organization_id", order.organization_id)
    .maybeSingle();

  const vitrin = magazaAdresi(ayarSatiri as never);
  const basariYolu = `/siparis/tamam?no=${encodeURIComponent(order.order_number)}`;
  const hataYolu = `/siparis/hata?no=${encodeURIComponent(order.order_number)}`;

  /* Ödeme zaten kesinleşmişse ikinci kez işlenmiyor: müşteri dönüş
     adresini yenilerse ya da geri tuşuna basarsa buraya tekrar gelir. */
  if (order.payment_status === "paid") return vitrineDon(vitrin, basariYolu);

  const ayar = tamiAyariCoz(ayarSatiri as never);
  if (!ayar) {
    console.error("[tami] dönüşte yapılandırma yok", order.order_number);
    await recordOrderEvent(supabase, order, "payment_settle_failed", { reason: "Tami yapılandırması okunamadı" });
    return vitrineDon(vitrin, hataYolu);
  }

  const cevap = await sorgula(ayar, order.id);
  if (!cevap.ok) {
    /*
      Sorgulama düştüyse ödeme BAŞARISIZ SAYILMIYOR: para çekilmiş
      olabilir. Sipariş bekliyorda kalıyor, olay kütüğe yazılıyor ve
      zamanlanmış görev yeniden soracak.
    */
    console.error("[tami] sorgulama başarısız", order.order_number, cevap.hata);
    await recordOrderEvent(supabase, order, "payment_settle_failed", { reason: cevap.hata, saglayici: "tami" });
    return vitrineDon(vitrin, hataYolu);
  }

  const sonuc = odemeSonucu(cevap.veri, order.total);
  if (sonuc.durum === "bekliyor") return vitrineDon(vitrin, hataYolu);

  const { error: settleError } = await supabase.rpc("arc_settle_storefront_order", {
    p_order_id: order.id,
    p_paid: sonuc.durum === "odendi",
    p_payment_reference: order.id,
    p_failure_reason: sonuc.durum === "odendi" ? null : sonuc.hata,
  });

  if (settleError) {
    /* Ödeme alınmış ama sipariş kapanmamış: panelde görünür olsun. */
    console.error("[tami] sipariş kapatılamadı", order.order_number, settleError.message);
    await recordOrderEvent(supabase, order, "payment_settle_failed", {
      reason: settleError.message,
      saglayici: "tami",
      odeme_durumu: sonuc.durum,
    });
    return vitrineDon(vitrin, hataYolu);
  }

  if (sonuc.durum === "odendi") {
    /* Posta ikincil: gönderilemezse ödeme yine kesinleşmiş sayılır. */
    try {
      await sendOrderConfirmation(supabase, order.id);
    } catch (hata) {
      console.error("[tami] sipariş e-postası gönderilemedi", order.order_number, hata);
    }
    return vitrineDon(vitrin, basariYolu);
  }

  return vitrineDon(vitrin, hataYolu);
}
