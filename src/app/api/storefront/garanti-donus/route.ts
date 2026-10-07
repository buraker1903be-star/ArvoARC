import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/paytr/service-client";
import { magazaAdresi } from "@/lib/magaza-adresi";
import { garantiAyariCoz, GARANTI_ALANLARI } from "@/lib/odeme/garanti/ayar";
import { donusHashiDogru } from "@/lib/odeme/garanti/imza";
import { tutarAlani } from "@/lib/odeme/garanti/istek";
import { donusuCoz } from "@/lib/odeme/garanti/yanit";
import { sendOrderConfirmation } from "@/lib/siparis-onay-postasi";
import { recordOrderEvent } from "@/lib/siparis-olayi";

/*
  MÜŞTERİNİN GARANTİ'DEN DÖNÜŞÜ.

  Banka müşteriyi buraya bir FORM POST'uyla geri gönderiyor (başarı ve
  hata aynı uca). Dönüşün kendisi tarayıcıdan geliyor, yani adres elle
  de çağrılabilir — KANIT İMZA.

  Bankanın StoreKey'ini yalnızca banka ve biz biliyoruz; dönüşteki
  `hash` o anahtarla üretiliyor ve hangi alanların imzalandığını banka
  `hashparams` ile kendisi bildiriyor. İmza tutmuyorsa istek bankadan
  gelmemiştir ve siparişe HİÇ dokunulmuyor: "ödendi" demek bir yana,
  "başarısız" bile denmiyor — uydurma bir istekle gerçek bir ödemeyi
  başarısız işaretlemek de bir saldırı olurdu.

  TUTAR AYRICA KARŞILAŞTIRILIYOR. İmza doğruysa tutar da bankanın
  imzaladığı değerdir, ama siparişin tutarıyla aynı olduğunu burada
  görmek gerekiyor: aynı anahtarla imzalanmış BAŞKA bir siparişin
  dönüşü bu siparişi kapatmamalı.

  Müşteri geri dönmezse (sekmeyi kapattı, ağ koptu) sipariş
  "bekliyor"da kalır. Garanti'de sunucudan sunucuya bildirim yok;
  o siparişler panelden görülüp elle sorgulanıyor.
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

/*
  BANKANIN NE DEDİĞİ KÜTÜĞE YAZILIR.

  İlk sürümde başarısız dönüş sessizdi: imza ve tutar denetimlerinin
  kendi olayları vardı ama "banka reddetti" dalı hiçbir şey yazmıyordu.
  07.10.2026'da ilk canlı denemede tam o dal çalıştı ve sebebi
  arayacak YER YOKTU — ne olay kütüğünde ne sunucu günlüğünde. Oysa
  teşhisin tamamı bankanın o dönüşteki alanlarındaydı.

  DEĞERİ TAŞINAN ALANLAR TEK TEK SEÇİLİYOR. Dönüşün tamamını kütüğe
  yazmak, bankanın ileride ekleyeceği bir alanla birlikte maskeli kart
  numarası gibi şeyleri de kalıcı kayda almak olurdu. Tanımadığımız
  alanların yalnızca ADI yazılıyor: bir sonraki sefer "bankanın
  söylediği bir şey var ama biz bakmıyoruz" durumunu görebilelim.
*/
const TANILAMA_ALANLARI = [
  "mdstatus", "mderrormessage", "errmsg", "hostmsg", "procreturncode",
  "response", "hostrefnum", "retrefnum", "secure3dsecuritylevel",
  "apiversion", "txnstatus", "errorurl", "terminalid", "txnamount",
] as const;

function tanilama(alanlar: Record<string, string>): Record<string, string> {
  const cikti: Record<string, string> = {};
  for (const ad of TANILAMA_ALANLARI) {
    const deger = (alanlar[ad] ?? "").trim();
    if (deger) cikti[ad] = deger.slice(0, 300);
  }
  const bilinmeyen = Object.keys(alanlar).filter((ad) => !TANILAMA_ALANLARI.includes(ad as never));
  if (bilinmeyen.length) cikti.diger_alanlar = bilinmeyen.join(",").slice(0, 500);
  return cikti;
}

const vitrineDon = (adres: string | null, yol: string) =>
  NextResponse.redirect(adres ? `${adres}${yol}` : "https://arvo-os.com", { status: 303 });

export async function POST(request: Request) {
  let alanlar: Record<string, string>;
  try {
    const veri = await request.formData();
    alanlar = Object.fromEntries([...veri.entries()].map(([ad, deger]) => [ad, String(deger)]));
  } catch {
    console.error("[garanti] dönüş gövdesi okunamadı");
    return vitrineDon(null, "/");
  }

  /* Sipariş kimliği bankaya `orderid` olarak gönderilmişti; dönüşte de
     o adla geliyor. */
  const siparisKimligi = (alanlar.orderid ?? "").trim();
  const supabase = createServiceClient();

  const { data: siparis } = await supabase
    .from("arc_orders")
    .select("id,organization_id,order_number,total,payment_status")
    .eq("id", siparisKimligi)
    .maybeSingle();

  if (!siparis) {
    /* Uydurma kimlikle gelen istek: hiçbir şey açıklamadan ana sayfaya. */
    console.error("[garanti] dönüşte sipariş bulunamadı", siparisKimligi);
    return vitrineDon(null, "/");
  }
  const order = siparis as Siparis;

  const { data: ayarSatiri } = await supabase
    .from("arc_store_settings")
    .select(`custom_domain,domain_verified_at,platform_subdomain,storefront_url,${GARANTI_ALANLARI}`)
    .eq("organization_id", order.organization_id)
    .maybeSingle();

  const vitrin = magazaAdresi(ayarSatiri as never);
  const basariYolu = `/siparis/tamam?no=${encodeURIComponent(order.order_number)}`;
  const hataYolu = `/siparis/hata?no=${encodeURIComponent(order.order_number)}`;

  /* Ödeme zaten kesinleşmişse ikinci kez işlenmiyor: müşteri dönüş
     sayfasını yenilerse ya da geri tuşuna basarsa buraya tekrar gelir. */
  if (order.payment_status === "paid") return vitrineDon(vitrin, basariYolu);

  const ayar = garantiAyariCoz(ayarSatiri as never);
  if (!ayar) {
    console.error("[garanti] dönüşte yapılandırma yok", order.order_number);
    await recordOrderEvent(supabase, order, "payment_settle_failed", { reason: "Garanti yapılandırması okunamadı" });
    return vitrineDon(vitrin, hataYolu);
  }

  if (!donusHashiDogru(ayar.kimlik, alanlar)) {
    /*
      SİPARİŞE DOKUNULMUYOR. İmzasız bir isteğin siparişi "başarısız"
      yapabilmesi, ödenmiş bir siparişi dışarıdan bozmaya yeterdi.
      Kütüğe yazılıyor ki panelde görünsün.
    */
    console.error("[garanti] dönüş imzası tutmadı", order.order_number);
    await recordOrderEvent(supabase, order, "payment_settle_failed", {
      saglayici: "garanti",
      reason: "Dönüş imzası doğrulanamadı",
      /* İmza doğrulanmadığı için DEĞER yazmıyoruz, yalnızca hangi
         alanların geldiğini: doğrulanmamış veriyi kütüğe almak, uydurma
         bir isteğin siparişin geçmişine metin yazabilmesi demekti. */
      gelen_alanlar: Object.keys(alanlar).join(",").slice(0, 500),
    });
    return vitrineDon(vitrin, hataYolu);
  }

  const gelenTutar = (alanlar.txnamount ?? "").trim();
  if (gelenTutar && gelenTutar !== tutarAlani(order.total)) {
    console.error("[garanti] dönüşte tutar uyuşmuyor", order.order_number, gelenTutar, order.total);
    await recordOrderEvent(supabase, order, "payment_settle_failed", {
      saglayici: "garanti",
      reason: `Tutar uyuşmuyor: banka ${gelenTutar}, sipariş ${tutarAlani(order.total)}`,
    });
    return vitrineDon(vitrin, hataYolu);
  }

  const sonuc = donusuCoz(alanlar, ayar.yariGuvenliKabul);
  const odendi = sonuc.durum === "basarili";

  const { error: settleError } = await supabase.rpc("arc_settle_storefront_order", {
    p_order_id: order.id,
    p_paid: odendi,
    /* İade bu referansla isteniyor; banka vermediyse sipariş kimliği
       kalıyor ki alan hiç boş olmasın. */
    p_payment_reference: (odendi && sonuc.referans) || order.id,
    p_failure_reason: odendi ? null : sonuc.mesaj,
  });

  if (settleError) {
    /* Para çekilmiş ama sipariş kapanmamış olabilir: panelde görünsün. */
    console.error("[garanti] sipariş kapatılamadı", order.order_number, settleError.message);
    await recordOrderEvent(supabase, order, "payment_settle_failed", {
      saglayici: "garanti",
      reason: settleError.message,
      odeme_durumu: odendi ? "odendi" : "basarisiz",
      mdstatus: sonuc.mdstatus,
    });
    return vitrineDon(vitrin, hataYolu);
  }

  if (!odendi) {
    /* Bankanın reddi de bir olay: sebebi burada yazmazsak hiçbir yerde
       yazmıyor (yukarıdaki açıklama). */
    console.error("[garanti] banka ödemeyi tamamlamadı", order.order_number, sonuc.mdstatus, sonuc.mesaj);
    await recordOrderEvent(supabase, order, "payment_settle_failed", {
      saglayici: "garanti",
      reason: sonuc.mesaj,
      mdstatus: sonuc.mdstatus,
      ...tanilama(alanlar),
    });
    return vitrineDon(vitrin, hataYolu);
  }

  /* Posta ikincil: gönderilemezse ödeme yine kesinleşmiş sayılır. */
  try {
    await sendOrderConfirmation(supabase, order.id);
  } catch (hata) {
    console.error("[garanti] sipariş e-postası gönderilemedi", order.order_number, hata);
  }
  return vitrineDon(vitrin, basariYolu);
}
