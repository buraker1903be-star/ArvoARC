"use server";

import { revalidatePath } from "next/cache";
import { bildirimBirak } from "@/lib/panel-bildirim";
import { basariMetni, hataMetni } from "./mesajlar";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { bolmeSorunu, izlenmeliMi, type Gonderi, type SiparisKalemi } from "@/lib/kargo-bolme";
import { gonderiDurumunuYenile } from "@/lib/kargo-durumu-yenile";
import { KARGO_FIRMALARI, takipAdresi } from "@/lib/kargo-firmalari";
import { decryptSecret } from "@/lib/payment-credentials";
import { OtoHatasi, zatenVarMi } from "@/lib/tryoto/hatalar";
import { otoIstek } from "@/lib/tryoto/istemci";
import { createOrderGovdesi, govdeSorunu } from "@/lib/tryoto/siparis-govdesi";
import { gondericiCoz, gondericiEksigi, type GondericiBilgisi, type MagazaAdresSatiri } from "@/lib/tryoto/gonderici";
import { durumOzeti, etiketHazir, etiketiCozumle, gonderiOzeti, type EtiketBilgisi } from "@/lib/tryoto/etiket";
import { otodaGonderiyiIptalEt } from "@/lib/tryoto/iptal";
import { kargoBildirimiGonder } from "@/lib/kargo-bildirimi-gonder";
import { siparisiKargoyaVerildiYap } from "@/lib/siparis-kargo-durumu";

/*
  GÖNDERİ İŞLEMLERİ.

  İki çalışma biçimi var ve bu dosya şimdilik ikincisini karşılıyor:
   1. Etiketi biz üretiyoruz (tryOTO) — ayrı bir tur.
   2. Tedarikçi kendi gönderiyor, bize takip numarası veriyor. Burada OTO
      hiç devreye girmiyor, OTO bakiyesi harcanmıyor.

  Adet bütünlüğü asıl olarak VERİTABANI TETİKLEYİCİSİNDE korunuyor
  (arvo_arc_shipment_item_guard). Buradaki denetim kullanıcıya anlaşılır
  mesaj vermek için; tetikleyicinin mesajı teknik ve hangi ürün olduğunu
  söylemiyor.
*/

const MANAGERS = ["owner", "admin", "manager"];

/* Dönüş tipi never: redirect akışı kesiyor ve derleyici bunu ancak böyle
   biliyor — yoksa sonraki satırlar "değer null olabilir" diye uyarıyor. */
/*
  İşlem sonucu ÇEREZE yazılıyor, adrese değil: adresteki mesaj dışarıdan
  uydurulabiliyordu ve sayfa tanımadığı kodu olduğu gibi basıyordu
  (lib/panel-bildirim.ts). Kod → Türkçe metin çevirisi burada yapılıyor;
  sayfa artık yalnızca yazılanı gösteriyor.

  Fonksiyon `never` dönüyor çünkü redirect akışı kesiyor; çağıranların
  `return await geriDon(...)` yazması yalnızca okunurluk içindir.
*/
const geriDon = async (orderId: string, sonuc: { error?: string; saved?: string }): Promise<never> => {
  if (sonuc.error) await bildirimBirak({ hata: hataMetni(sonuc.error) });
  else if (sonuc.saved) await bildirimBirak({ basari: basariMetni(sonuc.saved) });
  redirect(`/siparisler/${orderId}`);
};

/** Formdaki "kalem_<id>" alanlarından seçilen adetler. */
function secimiOku(formData: FormData): Record<string, number> {
  const secim: Record<string, number> = {};
  for (const [ad, deger] of formData.entries()) {
    if (!ad.startsWith("kalem_")) continue;
    const adet = Number(String(deger).trim());
    if (Number.isFinite(adet) && adet > 0) secim[ad.slice(6)] = adet;
  }
  return secim;
}

export async function elleGonderiEkle(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const orderId = String(formData.get("order_id") ?? "");
  if (!MANAGERS.includes(membership.role)) return await geriDon(orderId, { error: "forbidden" });

  const carrierCode = String(formData.get("carrier_code") ?? "").trim();
  const trackingNumber = String(formData.get("tracking_number") ?? "").trim();
  const supplier = String(formData.get("supplier") ?? "").trim();
  const elleAdres = String(formData.get("tracking_url") ?? "").trim();
  const secim = secimiOku(formData);

  if (!KARGO_FIRMALARI.some((firma) => firma.kod === carrierCode)) return await geriDon(orderId, { error: "kargo-firmasi-gecersiz" });
  /*
    Takip numarası burada da isteniyor, veritabanı da istiyor. İkisi
    birden: veritabanı kuralı güvenlik sınırı, buradaki ise kullanıcıya
    Türkçe ve alanı işaret eden bir mesaj verebilmek için.
  */
  if (!trackingNumber) return await geriDon(orderId, { error: "takip-numarasi-gerekli" });

  const [{ data: kalemler }, { data: gonderiler }] = await Promise.all([
    supabase.from("arc_order_items").select("id,quantity,product_name").eq("organization_id", organization.id).eq("order_id", orderId),
    supabase.from("arc_shipments").select("id,status,sequence,arc_shipment_items(order_item_id,quantity)").eq("organization_id", organization.id).eq("order_id", orderId),
  ]);

  const mevcutGonderiler: Gonderi[] = ((gonderiler ?? []) as Array<{ id: string; status: string; arc_shipment_items: { order_item_id: string; quantity: number }[] | null }>)
    .map((satir) => ({ id: satir.id, status: satir.status, items: satir.arc_shipment_items ?? [] }));
  const sorun = bolmeSorunu(secim, (kalemler ?? []) as SiparisKalemi[], mevcutGonderiler);
  if (sorun) return await geriDon(orderId, { error: sorun });

  // Sipariş içindeki sıra: ekranda "2. paket" diye okunuyor.
  const sonrakiSira = Math.max(0, ...((gonderiler ?? []) as { sequence: number }[]).map((s) => s.sequence)) + 1;

  const { data: gonderi, error } = await supabase.from("arc_shipments").insert({
    organization_id: organization.id,
    order_id: orderId,
    sequence: sonrakiSira,
    source: "manual",
    status: "created",
    carrier_code: carrierCode,
    carrier_name: KARGO_FIRMALARI.find((firma) => firma.kod === carrierCode)?.ad ?? carrierCode,
    tracking_number: trackingNumber,
    tracking_url: takipAdresi(carrierCode, trackingNumber, elleAdres),
    supplier: supplier || null,
    shipped_at: new Date().toISOString(),
  }).select("id").single();
  if (error || !gonderi) return await geriDon(orderId, { error: error?.message ?? "gonderi-olusturulamadi" });

  /*
    Kalemler gönderiden SONRA yazılıyor; tetikleyici gönderinin siparişini
    kontrol ediyor, yani önce gönderi var olmalı. Bir kalem reddedilirse
    gönderi kalemsiz kalıyor — kullanıcıya hata gösteriliyor ve boş gönderi
    siliniyor, yoksa ekranda "0 ürün" taşıyan bir paket duruyordu.
  */
  const satirlar = Object.entries(secim).map(([kalemId, adet]) => ({
    organization_id: organization.id,
    shipment_id: gonderi.id,
    order_item_id: kalemId,
    quantity: adet,
  }));
  const { error: kalemHatasi } = await supabase.from("arc_shipment_items").insert(satirlar);
  if (kalemHatasi) {
    await supabase.from("arc_shipments").delete().eq("id", gonderi.id).eq("organization_id", organization.id);
    await geriDon(orderId, { error: kalemHatasi.message });
  }

  /*
    Elle girilen gönderide takip numarası ZATEN dolu: tedarikçi kendi
    gönderdiğinde bize verdiği tek şey o. Bildirim burada gidiyor.
  */
  await siparisiKargoyaVerildiYap(supabase, organization.id, orderId);
  await kargoBildirimiGonder(supabase, organization.id, orderId, gonderi.id);

  revalidatePath(`/siparisler/${orderId}`);
  await geriDon(orderId, { saved: "gonderi" });
}

/*
  Gönderi iptali kaydı SİLMİYOR, durumunu değiştiriyor: iptal edilen
  gönderinin kalemleri yeniden bölünebilir sayılıyor (tetikleyici iptali
  saymıyor) ve geçmişte hangi firmaya ne verildiği görünür kalıyor.
*/
export async function gonderiIptal(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const orderId = String(formData.get("order_id") ?? "");
  if (!MANAGERS.includes(membership.role)) return await geriDon(orderId, { error: "forbidden" });
  const gonderiId = String(formData.get("shipment_id") ?? "");

  const [{ data: gonderi }, { data: order }] = await Promise.all([
    supabase.from("arc_shipments").select("id,sequence,status,source")
      .eq("organization_id", organization.id).eq("id", gonderiId).maybeSingle(),
    supabase.from("arc_orders").select("order_number")
      .eq("organization_id", organization.id).eq("id", orderId).maybeSingle(),
  ]);
  if (!gonderi || !order) return await geriDon(orderId, { error: "gonderi-bulunamadi" });

  /*
    TESLİM EDİLMİŞ GÖNDERİ İPTAL EDİLMEZ. Paket müşteride; "iptal" demek
    hem yanlış kayıt hem de kalemleri yeniden bölünebilir sayıp ikinci
    kez göndermeye açık bırakmak olurdu.
  */
  if (gonderi.status === "delivered") {
    return await geriDon(orderId, { error: "Teslim edilmiş gönderi iptal edilemez. İade için iade talebi açın." });
  }

  /*
    OTO'DA DA İPTAL EDİLİYOR. Önce yalnızca bizim kayıt işaretleniyordu
    ve gönderi OTO'da canlı kalıyordu: kurye alıma gelebiliyor,
    tedarikçi etiketi yapıştırıp gönderebiliyor ve harcanan bakiye geri
    gelmiyordu. Ayrışma ancak müşteri beklemediği bir paket aldığında
    fark edilirdi.

    Taslak ve tedarikçinin kendi gönderdiği kayıtlar OTO'ya hiç
    dokunmamış; onlarda yalnızca yerel iptal doğru olanı.
  */
  if (gonderi.source === "oto" && gonderi.status !== "draft") {
    const ayar = await kargoAyari(supabase, organization.id);
    if (!ayar) return await geriDon(orderId, { error: "tryoto-kapali" });
    const sonuc = await otodaGonderiyiIptalEt(
      organization.id,
      ayar.anahtar,
      otoSiparisKimligi(order.order_number as string, gonderi.sequence as number),
    );
    /*
      OTO İPTAL ETMEDİYSE BİZİM KAYIT DA İPTAL EDİLMİYOR. Tersi,
      panelin "iptal" dediği bir paketin yola çıkması demekti; sebebi
      kullanıcıya söyleyip kararı ona bırakmak daha doğru.
    */
    if (sonuc.durum === "hata") {
      await supabase.from("arc_shipments").update({ failure_reason: `OTO iptal etmedi · ${sonuc.mesaj}` })
        .eq("id", gonderiId).eq("organization_id", organization.id);
      revalidatePath(`/siparisler/${orderId}`);
      return await geriDon(orderId, { error: `Gönderi OTO'da iptal edilemedi: ${sonuc.mesaj}` });
    }
  }

  const { error } = await supabase.from("arc_shipments")
    .update({ status: "cancelled", failure_reason: null })
    .eq("id", gonderiId).eq("organization_id", organization.id);
  if (error) return await geriDon(orderId, { error: error.message });

  revalidatePath(`/siparisler/${orderId}`);
  await geriDon(orderId, { saved: "gonderi-iptal" });
}

/*
  tryOTO İLE GÖNDERİ — iki adım.

  1) TASLAK: kalemler ayrılır, gönderi "draft" olarak kaydedilir. OTO'ya
     henüz dokunulmaz. Kalemleri önce ayırmak, fiyat sorgusunun hangi
     paket için yapıldığını belirli kılıyor; tek adımda yapılsaydı
     kullanıcı fiyatı görmeden firma seçmek zorunda kalırdı.
  2) ETİKET: seçilen teslimat seçeneğiyle OTO'da sipariş ve gönderi
     açılır, takip numarası ve AWB adresi kayda yazılır.

  Taslak kayıt OTO bakiyesi harcamıyor; harcama 2. adımda oluyor.
*/

type MagazaKargoAyari = MagazaAdresSatiri & {
  tryoto_enabled: boolean | null;
  tryoto_refresh_token_enc: string | null;
  tryoto_pickup_location_code: string | null;
};

/*
  Ayarla birlikte MAĞAZANIN ÇIKIŞ ADRESİ de okunuyor: OTO'ya gönderici ya
  tanımlı bir konumun koduyla ya adresin tek tek yazılmasıyla veriliyor ve
  ikinci yol daha önce hiç kurulmamıştı — konum kodu boş olan hesapta
  etiket üretimi "gönderici bilgisi yok" diyip duruyordu.
*/
async function kargoAyari(
  supabase: Awaited<ReturnType<typeof requireTenant>>["supabase"],
  organizationId: string,
): Promise<{ anahtar: string; gondericiKodu: string | null; gonderici: GondericiBilgisi | null; adresEksigi: string | null } | null> {
  const { data } = await supabase.from("arc_store_settings")
    .select("tryoto_enabled,tryoto_refresh_token_enc,tryoto_pickup_location_code,legal_name,store_name,contact_phone,contact_email,address_line,address_district,address_city,address_country")
    .eq("organization_id", organizationId).maybeSingle();
  const ayar = data as MagazaKargoAyari | null;
  if (!ayar?.tryoto_enabled || !ayar.tryoto_refresh_token_enc) return null;
  return {
    anahtar: decryptSecret(ayar.tryoto_refresh_token_enc),
    gondericiKodu: ayar.tryoto_pickup_location_code,
    gonderici: gondericiCoz(ayar),
    adresEksigi: gondericiEksigi(ayar),
  };
}

/*
  GÖNDERİ AYRI BİR ÇAĞRIYLA AÇILIYOR: createShipment(orderId,
  deliveryOptionId).

  Önceden createOrder'a createShipment:true bayrağı konuyordu ve "sipariş
  ile gönderi tek çağrıda açılır" varsayılıyordu. Canlıda öyle olmadı
  (27.09.2026): sipariş oluştu — orderStatus onu buluyordu — ama gönderi
  hiç açılmadı, dolayısıyla AWB de üretilmedi ve print ucu hem bizim
  numaramızla hem OTO'nun otoId'siyle 404 döndü. Bayrağın sessizce
  yoksayılması, ekranda "etiket hazır değil" diye görünüyordu.

  Ayrı çağrının asıl kazancı görünürlük: gönderi açılamazsa SEBEBİ
  geliyor. Yarı yolda kalan sipariş zaten oluşuyordu, farkı yalnızca
  bunun bilinmesiydi.
*/
async function gonderiAc(
  magazaId: string,
  anahtar: string,
  otoSiparisNo: string,
  teslimatSecenegiId: string,
): Promise<string | null> {
  const yanit = await otoIstek<Record<string, unknown>>({
    magazaId,
    yenilemeAnahtari: anahtar,
    yol: "createShipment",
    govde: { orderId: otoSiparisNo, deliveryOptionId: Number(teslimatSecenegiId) || teslimatSecenegiId },
  });
  const kimlik = yanit.otoId;
  if (typeof kimlik === "string" && kimlik.trim()) return kimlik.trim();
  if (typeof kimlik === "number") return String(kimlik);
  return null;
}

/*
  ETİKET (AWB) BİLGİSİ. createOrder yanıtındaki alan adları belgelenmemiş
  ve canlıda firma adı da takip numarası da boş geldi; belgeli iki uç var
  ve ikisi de aynı alanları veriyor: print/{orderId} ve orderStatus.

  ÜÇ DENEME sırayla yapılıyor, çünkü tek denemeye güvenmek bizi iki tur
  körlemesine bıraktı (27.09.2026, etiket hiç gelmedi ve sebep
  görünmüyordu):
    1) print + BİZİM kimliğimiz ("AC-1042-1") — createOrder'a verdiğimiz.
    2) orderStatus + aynı kimlik — print plana göre kapalı olabiliyor,
       dcList'in ücretsiz hesapta 403 dönmesi gibi.
    3) print + OTO'nun kendi kimliği (otoId) — print'in hangi kimliği
       beklediği belgede net değil ve bizimkiyle 404 dönebiliyor.

  HATA ARTIK YUTULMUYOR. Eskiden catch boş dönüyordu ve ekranda her
  durumda "etiket henüz hazır değil" yazıyordu: 404, yetki hatası ve
  gerçekten gecikmiş etiket ayırt edilemiyordu.
*/
async function etiketBilgisi(
  magazaId: string,
  anahtar: string,
  siparisKimligi: string,
  otoKimligi?: string | null,
): Promise<{ bilgi: EtiketBilgisi | null; hata: string | null }> {
  const denemeler: { print: boolean; kimlik: string }[] = [
    { print: true, kimlik: siparisKimligi },
    { print: false, kimlik: siparisKimligi },
  ];
  const oto = otoKimligi?.trim();
  if (oto && oto !== siparisKimligi) denemeler.push({ print: true, kimlik: oto });

  /*
    HER DENEMENİN sonucu ayrı yazılıyor, yalnızca son hata değil. Son
    hatayı göstermek yanıltıcıydı: üç uçtan hangisinin neden düştüğü
    bilinmeden ne kimlik ne plan sorunu ayırt edilebiliyor.
  */
  const notlar: string[] = [];
  /*
    AWB'si olmayan ama takip numarası ya da firma taşıyan yanıt SAKLANIYOR:
    etiket gecikmişken bile takip numarasını kayda yazmak, müşteriye
    bilgi verebilmek için yeterli.
  */
  let kismi: EtiketBilgisi | null = null;
  for (const deneme of denemeler) {
    const ad = `${deneme.print ? "print" : "orderStatus"} (${deneme.kimlik})`;
    try {
      const yanit = deneme.print
        ? await otoIstek<Record<string, unknown>>({
            magazaId,
            yenilemeAnahtari: anahtar,
            yol: `print/${encodeURIComponent(deneme.kimlik)}`,
            yontem: "GET",
          })
        : await otoIstek<Record<string, unknown>>({
            magazaId,
            yenilemeAnahtari: anahtar,
            yol: "orderStatus",
            govde: { orderId: deneme.kimlik },
          });
      const bilgi = etiketiCozumle(yanit);
      if (etiketHazir(bilgi)) return { bilgi, hata: null };
      if (!kismi && (bilgi.takipNo || bilgi.firma)) kismi = bilgi;
      /*
        Yanıt geldi ama etiket adresi yok. DURUM da yazılıyor: yanıtın en
        bilgilendirici alanı o ve gösterilmediği için iki tur boyunca
        "etiket adresi boş" cümlesiyle kaldık.
      */
      const ozet = durumOzeti(yanit);
      notlar.push(`${ad}: etiket adresi boş${ozet ? ` (${ozet})` : ""}`);
    } catch (hata) {
      notlar.push(`${ad}: ${hata instanceof OtoHatasi ? hata.message : "istek başarısız"}`);
    }
  }
  /*
    SON SORU: OTO'da bu siparişe bağlı bir gönderi gerçekten var mı?
    createShipment "başarılı" dönüp gönderi yine oluşmayabiliyor — kargo
    firması reddederse OTO bunu kendi Shipment Error Logs'una yazıyor ve
    API tarafında hiçbir şey görünmüyor. Cevap "yok" ise beklemek
    sonuçsuz ve bunu bilmek gerekiyor.
  */
  try {
    const liste = await otoIstek<Record<string, unknown>>({
      magazaId,
      yenilemeAnahtari: anahtar,
      yol: `shipmentTransactions?orderId=${encodeURIComponent(siparisKimligi)}`,
      yontem: "GET",
    });
    const ozet = gonderiOzeti(liste);
    if (ozet) notlar.push(`gönderi kaydı: ${ozet}`);
  } catch (hata) {
    notlar.push(`shipmentTransactions: ${hata instanceof OtoHatasi ? hata.message : "istek başarısız"}`);
  }

  return { bilgi: kismi, hata: notlar.length ? `Etiket alınamadı · ${notlar.join(" · ")}` : null };
}

/** Gönderinin OTO'daki sipariş kimliği; createOrder'a verilen değerle aynı. */
const otoSiparisKimligi = (siparisNo: string, sira: number) => `${siparisNo}-${sira}`;

export async function otoTaslakOlustur(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const orderId = String(formData.get("order_id") ?? "");
  if (!MANAGERS.includes(membership.role)) return await geriDon(orderId, { error: "forbidden" });

  const supplier = String(formData.get("supplier") ?? "").trim();
  const secim = secimiOku(formData);

  const [{ data: kalemler }, { data: gonderiler }] = await Promise.all([
    supabase.from("arc_order_items").select("id,quantity,product_name").eq("organization_id", organization.id).eq("order_id", orderId),
    supabase.from("arc_shipments").select("id,status,sequence,arc_shipment_items(order_item_id,quantity)").eq("organization_id", organization.id).eq("order_id", orderId),
  ]);
  const mevcut: Gonderi[] = ((gonderiler ?? []) as Array<{ id: string; status: string; arc_shipment_items: { order_item_id: string; quantity: number }[] | null }>)
    .map((satir) => ({ id: satir.id, status: satir.status, items: satir.arc_shipment_items ?? [] }));
  const sorun = bolmeSorunu(secim, (kalemler ?? []) as SiparisKalemi[], mevcut);
  if (sorun) return await geriDon(orderId, { error: sorun });

  const sonrakiSira = Math.max(0, ...((gonderiler ?? []) as { sequence: number }[]).map((s) => s.sequence)) + 1;
  const { data: gonderi, error } = await supabase.from("arc_shipments").insert({
    organization_id: organization.id,
    order_id: orderId,
    sequence: sonrakiSira,
    source: "oto",
    status: "draft",
    supplier: supplier || null,
  }).select("id").single();
  if (error || !gonderi) return await geriDon(orderId, { error: error?.message ?? "gonderi-olusturulamadi" });

  const { error: kalemHatasi } = await supabase.from("arc_shipment_items").insert(
    Object.entries(secim).map(([kalemId, adet]) => ({
      organization_id: organization.id,
      shipment_id: gonderi.id,
      order_item_id: kalemId,
      quantity: adet,
    })),
  );
  if (kalemHatasi) {
    await supabase.from("arc_shipments").delete().eq("id", gonderi.id).eq("organization_id", organization.id);
    return await geriDon(orderId, { error: kalemHatasi.message });
  }

  revalidatePath(`/siparisler/${orderId}`);
  return await geriDon(orderId, { saved: "taslak" });
}

export async function otoEtiketUret(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const orderId = String(formData.get("order_id") ?? "");
  if (!MANAGERS.includes(membership.role)) return await geriDon(orderId, { error: "forbidden" });
  const gonderiId = String(formData.get("shipment_id") ?? "");
  /*
    Seçenek "id|ad" biçiminde geliyor: firma adı createOrder yanıtından
    okunamıyor (alan adları belgelenmemiş ve canlıda boş geldi, kart
    "Etiket üretildi · firma belirtilmedi" diyordu). Kullanıcının seçtiği
    ad kayda doğrudan yazılıyor; yanıttan bir ad gelirse o tercih ediliyor.
  */
  const secenekHam = String(formData.get("delivery_option_id") ?? "").trim();
  const ayrac = secenekHam.indexOf("|");
  const secenekId = ayrac >= 0 ? secenekHam.slice(0, ayrac) : secenekHam;
  const secilenFirma = ayrac >= 0 ? secenekHam.slice(ayrac + 1).trim() : "";
  const agirlik = Number(String(formData.get("weight") ?? "").trim());
  /*
    Ölçüler fiyat sorgusundakiyle AYNI değerlerle gidiyor: OTO fiyatı
    hacimsel ağırlıktan hesaplıyor ve etiket farklı ölçüyle üretilirse
    gerçekleşen ücret seçilenden sapar.
  */
  const sayi = (ad: string) => {
    const deger = Number(String(formData.get(ad) ?? "").trim());
    return Number.isFinite(deger) && deger > 0 ? deger : null;
  };
  const enCm = sayi("en");
  const boyCm = sayi("boy");
  const yukseklikCm = sayi("yuk");

  const ayar = await kargoAyari(supabase, organization.id);
  if (!ayar) return await geriDon(orderId, { error: "tryoto-kapali" });

  const [{ data: order }, { data: gonderi }] = await Promise.all([
    supabase.from("arc_orders").select("id,order_number,currency,payment_status,customer_name,customer_email,metadata")
      .eq("organization_id", organization.id).eq("id", orderId).maybeSingle(),
    supabase.from("arc_shipments").select("id,sequence,status,arc_shipment_items(order_item_id,quantity)")
      .eq("organization_id", organization.id).eq("id", gonderiId).maybeSingle(),
  ]);
  if (!order || !gonderi) return await geriDon(orderId, { error: "gonderi-bulunamadi" });
  if (gonderi.status !== "draft") return await geriDon(orderId, { error: "gonderi-zaten-olusturuldu" });

  const satirlar = (gonderi.arc_shipment_items ?? []) as { order_item_id: string; quantity: number }[];
  const { data: kalemler } = await supabase.from("arc_order_items")
    .select("id,product_name,sku,unit_price").eq("organization_id", organization.id)
    .in("id", satirlar.map((satir) => satir.order_item_id));
  const kalemBilgisi = new Map(((kalemler ?? []) as Array<{ id: string; product_name: string; sku: string; unit_price: number }>).map((k) => [k.id, k]));

  const meta = (order.metadata ?? {}) as { shipping_address?: { name?: string; address1?: string; address2?: string; city?: string; province?: string; zip?: string; country?: string; phone?: string } };
  const adres = meta.shipping_address ?? {};
  const girdi = {
    siparisNo: order.order_number as string,
    sira: gonderi.sequence as number,
    paraBirimi: (order.currency as string) || "TRY",
    musteri: {
      ad: adres.name || (order.customer_name as string) || "",
      telefon: adres.phone || "",
      adres: [adres.address1, adres.address2].filter(Boolean).join(" ").trim(),
      sehir: adres.city || "",
      ilce: adres.province ?? null,
      postaKodu: adres.zip ?? null,
      ulke: adres.country ?? null,
      eposta: (order.customer_email as string) || null,
    },
    kalemler: satirlar.map((satir) => {
      const bilgi = kalemBilgisi.get(satir.order_item_id);
      const birim = bilgi?.unit_price ?? 0;
      return {
        ad: bilgi?.product_name ?? "Ürün",
        sku: bilgi?.sku ?? null,
        adet: satir.quantity,
        birimFiyatKurus: birim,
        toplamKurus: birim * satir.quantity,
      };
    }),
    gondericiKodu: ayar.gondericiKodu,
    /*
      Konum kodu varsa gövdeye YALNIZCA o giriyor (OTO ikisini birlikte
      kabul etmiyor); yoksa mağazanın çıkış adresi tek tek gidiyor.
    */
    gonderici: ayar.gondericiKodu?.trim() ? null : ayar.gonderici,
    teslimatSecenegiId: secenekId || null,
    agirlikKg: Number.isFinite(agirlik) && agirlik > 0 ? agirlik : null,
    enCm,
    boyCm,
    yukseklikCm,
  };

  /*
    Adres eksikse HANGİ ALANIN eksik olduğu söyleniyor. Genel "gönderici
    bilgisi yok" mesajı, adresin girildiği yeri bilen kullanıcıyı bile
    hangi satırın boş kaldığını aramaya bırakıyordu.
  */
  if (!girdi.gondericiKodu?.trim() && !girdi.gonderici && ayar.adresEksigi) {
    return await geriDon(orderId, { error: `Gönderici adresi eksik (${ayar.adresEksigi}): Ayarlar → Kargo altyapısı bölümünde çıkış adresini doldurun.` });
  }
  const govdeHatasi = govdeSorunu(girdi);
  if (govdeHatasi) return await geriDon(orderId, { error: govdeHatasi });
  /*
    KARGO SEÇENEĞİ ZORUNLU. createShipment deliveryOptionId olmadan
    çağrılamıyor; seçenek boşken eskiden sipariş yine oluşturuluyordu ve
    gönderisiz kalıyordu — ekranda "etiket hazır değil" yazıyor, gerçekte
    açılacak bir gönderi hiç yoktu.
  */
  if (!secenekId) {
    return await geriDon(orderId, { error: "Kargo seçeneği seçilmedi: ağırlık ve ölçüyü girip fiyatları yenileyin, sonra bir firma seçin." });
  }

  const otoSiparisNo = otoSiparisKimligi(order.order_number as string, gonderi.sequence as number);

  try {
    /*
      SİPARİŞ ve GÖNDERİ iki ayrı çağrı. createOrder'a createShipment:true
      koymak yetmiyordu: bayrak sessizce yoksayıldı, sipariş açıldı ama
      gönderi açılmadı ve AWB hiç üretilmedi (27.09.2026).
    */
    let yanit: Record<string, unknown> = {};
    try {
      yanit = await otoIstek<Record<string, unknown>>({
        magazaId: organization.id,
        yenilemeAnahtari: ayar.anahtar,
        yol: "createOrder",
        govde: createOrderGovdesi(girdi),
      });
    } catch (hata) {
      /*
        SİPARİŞ ZATEN VARSA devam ediliyor. Önceki denemeden OTO'da
        siparişi olup gönderisi olmayan bir kayıt kalmış olabiliyor;
        durmak, o kaydı erişilemez yapıyordu — yapılacak iş gönderiyi
        açmak, siparişi yeniden yaratmak değil.
      */
      if (!(hata instanceof OtoHatasi && zatenVarMi(hata.hamMesaj))) throw hata;
    }

    const oku = (adlar: string[]): string | null => {
      for (const ad of adlar) {
        const deger = yanit[ad];
        if (typeof deger === "string" && deger.trim()) return deger.trim();
        if (typeof deger === "number") return String(deger);
      }
      return null;
    };
    /*
      Etiket bilgisi print ucundan çekiliyor: createOrder yanıtında firma
      ve takip numarası boş geliyordu. Başarısız olursa gönderi yine
      oluşmuş sayılıyor; kullanıcı karttaki düğmeyle sonradan alabiliyor.
    */
    /*
      OTO'nun kendi kimliği ETİKETTEN ÖNCE okunuyor: print ucu bizim
      kimliğimizle 404 dönerse ikinci deneme onunla yapılıyor.
    */
    const siparisKimligi = oku(["otoId", "orderId", "id"]);

    /*
      Gönderi burada açılıyor ve HATASI YUTULMUYOR: açılamazsa etiket de
      olmayacak, sebebini şimdi söylemek gerekiyor.
    */
    const gonderiKimligi = await gonderiAc(organization.id, ayar.anahtar, otoSiparisNo, secenekId);
    const otoKimligi = gonderiKimligi ?? siparisKimligi;
    /*
      createShipment'ın ne döndürdüğü de kayda yazılıyor: "başarılı" dönüp
      gönderi yine oluşmayabiliyor ve o zaman yanıtta otoId de olmuyor.
      Bu ayrım olmadan hatanın gönderide mi etikette mi olduğu bilinemiyor.
    */
    const gonderiNotu = gonderiKimligi ? `createShipment: otoId=${gonderiKimligi}` : "createShipment: yanıtta otoId yok";

    const { bilgi: etiket, hata: etiketHatasi } = await etiketBilgisi(
      organization.id,
      ayar.anahtar,
      otoSiparisNo,
      otoKimligi,
    );

    await supabase.from("arc_shipments").update({
      status: "created",
      oto_order_id: otoKimligi,
      delivery_option_id: secenekId || null,
      carrier_name: etiket?.firma ?? oku(["deliveryCompanyName", "deliveryCompany"]) ?? secilenFirma ?? null,
      tracking_number: etiket?.takipNo ?? oku(["trackingNumber", "waybill", "awb"]),
      tracking_url: oku(["trackingLink", "trackingUrl"]),
      awb_url: etiket?.awbUrl ?? oku(["printAWBURL", "awbUrl", "labelUrl"]),
      /*
        Sebep OTO'nun kendi mesajı; yoksa gecikme varsayılıyor. Eskiden
        her iki durumda da "henüz alınamadı" yazıyordu ve gerçek hata
        (404, yetki) hiçbir yerde görünmüyordu.
      */
      failure_reason: etiketHazir(etiket)
        ? null
        : [gonderiNotu, etiketHatasi ?? "Etiket adresi henüz alınamadı; karttan “Etiketi al” ile deneyin."].join(" · "),
      shipped_at: new Date().toISOString(),
    }).eq("id", gonderiId).eq("organization_id", organization.id);
  } catch (hata) {
    /*
      Hata gönderiyi SİLMİYOR, taslakta bırakıp sebebi yazıyor: kalemler
      ayrılmış durumda ve silinirse kullanıcı seçimi baştan yapmak zorunda
      kalır. Sebep ekranda görünüyor, düzeltilip tekrar denenebiliyor.
    */
    const mesaj = hata instanceof OtoHatasi ? hata.message : "OTO gönderisi oluşturulamadı.";
    await supabase.from("arc_shipments").update({ failure_reason: mesaj })
      .eq("id", gonderiId).eq("organization_id", organization.id);
    revalidatePath(`/siparisler/${orderId}`);
    return await geriDon(orderId, { error: mesaj });
  }

  /*
    Bildirim etiketten SONRA: takip numarası ancak burada doluyor ve
    numarasız bir "siparişiniz kargoda" e-postası müşteriye hiçbir şey
    söylemez. Gönderim hatası etiketi geçersiz saymıyor.
  */
  await siparisiKargoyaVerildiYap(supabase, organization.id, orderId);
  await kargoBildirimiGonder(supabase, organization.id, orderId, gonderiId);

  revalidatePath(`/siparisler/${orderId}`);
  return await geriDon(orderId, { saved: "etiket" });
}

/*
  Etiketi sonradan alma. Kargo firması AWB'yi bazen birkaç saniye
  gecikmeyle üretiyor ve ilk çağrıda adres boş dönüyor; bu düğme aynı ucu
  yeniden soruyor. Takip numarası ve firma adı da burada güncelleniyor —
  ikisi de print yanıtında geliyor.
*/
export async function etiketiAl(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const orderId = String(formData.get("order_id") ?? "");
  if (!MANAGERS.includes(membership.role)) return await geriDon(orderId, { error: "forbidden" });
  const gonderiId = String(formData.get("shipment_id") ?? "");

  const ayar = await kargoAyari(supabase, organization.id);
  if (!ayar) return await geriDon(orderId, { error: "tryoto-kapali" });

  const [{ data: order }, { data: gonderi }] = await Promise.all([
    supabase.from("arc_orders").select("order_number").eq("organization_id", organization.id).eq("id", orderId).maybeSingle(),
    supabase.from("arc_shipments").select("id,sequence,oto_order_id,delivery_option_id").eq("organization_id", organization.id).eq("id", gonderiId).maybeSingle(),
  ]);
  if (!order || !gonderi) return await geriDon(orderId, { error: "gonderi-bulunamadi" });

  const otoSiparisNo = otoSiparisKimligi(order.order_number as string, gonderi.sequence as number);
  let otoKimligi = gonderi.oto_order_id as string | null;

  let { bilgi: etiket, hata: etiketHatasi } = await etiketBilgisi(
    organization.id,
    ayar.anahtar,
    otoSiparisNo,
    otoKimligi,
  );

  /*
    ETİKET YOKSA GÖNDERİ HİÇ AÇILMAMIŞ OLABİLİR. 27.09.2026'da tam bu
    oldu: createOrder'ın createShipment bayrağı yoksayıldı, OTO'da sipariş
    vardı ama gönderi yoktu ve AWB hiç üretilmedi. O kayıtların tek çıkış
    yolu bu düğme — "etiketi al" burada "eksik adımı tamamla" anlamına da
    geliyor, yoksa gönderi kalıcı olarak yarı yolda kalıyordu.

    Gönderi zaten açıksa createShipment "zaten var" diyor; o hata
    yutuluyor, çünkü istenen durum sağlanmış demektir.
  */
  const secenekId = gonderi.delivery_option_id as string | null;
  if (!etiketHazir(etiket) && secenekId) {
    try {
      const yeniKimlik = await gonderiAc(organization.id, ayar.anahtar, otoSiparisNo, secenekId);
      if (yeniKimlik) otoKimligi = yeniKimlik;
      ({ bilgi: etiket, hata: etiketHatasi } = await etiketBilgisi(organization.id, ayar.anahtar, otoSiparisNo, otoKimligi));
    } catch (hata) {
      if (!(hata instanceof OtoHatasi && zatenVarMi(hata.hamMesaj))) {
        etiketHatasi = `Gönderi açılamadı · ${hata instanceof OtoHatasi ? hata.message : "OTO isteği başarısız"}`;
      }
    }
  }

  /*
    Etiket gelmese bile TAKİP NUMARASI geldiyse kayda yazılıyor: paket
    yoldayken müşteriye verilecek bilgi o ve bir sonraki denemeyi
    beklemesi gereksiz.
  */
  const kismi = {
    ...(etiket?.takipNo ? { tracking_number: etiket.takipNo } : {}),
    ...(etiket?.firma ? { carrier_name: etiket.firma } : {}),
  };

  if (!etiketHazir(etiket)) {
    /*
      SEBEP OTO'NUN KENDİ MESAJI. Eskiden her durumda "etiket henüz hazır
      değil" yazıyordu; 404, yetki hatası ve gerçekten gecikmiş etiket
      ekranda ayırt edilemiyor, beklemekten başka bir şey denenemiyordu.
    */
    const mesaj = etiketHatasi ?? "Etiket henüz hazır değil. Kargo firması oluşturunca tekrar deneyin.";
    await supabase.from("arc_shipments").update({ ...kismi, failure_reason: mesaj })
      .eq("id", gonderiId).eq("organization_id", organization.id);
    revalidatePath(`/siparisler/${orderId}`);
    return await geriDon(orderId, { error: mesaj });
  }

  await supabase.from("arc_shipments").update({
    awb_url: etiket!.awbUrl,
    ...kismi,
    ...(otoKimligi && otoKimligi !== gonderi.oto_order_id ? { oto_order_id: otoKimligi } : {}),
    failure_reason: null,
  }).eq("id", gonderiId).eq("organization_id", organization.id);

  // Takip numarası ilk kez burada gelmiş olabilir: etiket gecikmeli üretiliyor.
  await siparisiKargoyaVerildiYap(supabase, organization.id, orderId);
  await kargoBildirimiGonder(supabase, organization.id, orderId, gonderiId);

  revalidatePath(`/siparisler/${orderId}`);
  return await geriDon(orderId, { saved: "etiket-alindi" });
}

/*
  KARGO DURUMLARINI GÜNCELLEME.

  OTO'nun webhook'u da var ama gönderdiği yükün şekli belgelenmemiş;
  tahmine dayalı bir uç nokta yazmak, yanlış eşleşen bir bildirimin
  gönderiyi "teslim edildi" yapması demekti. orderStatus ucu ise belgeli
  ve tek çağrıda durumu, takip adresini, etiket adresini ve firmayı
  veriyor — düğmeyle çekmek hem güvenli hem yeterli.

  Siparişteki BÜTÜN açık OTO gönderileri birlikte güncelleniyor: tek tek
  düğmeye basmak, üç paketli bir siparişte üç tur demekti. Taslak ve iptal
  edilenler atlanıyor (OTO'da karşılıkları yok), teslim edilenler de
  (durumu değişmez).

  Bir gönderinin hatası ötekileri durdurmuyor: biri OTO'da bulunamazsa
  kalanların durumu yine güncelleniyor ve sonuç mesajında kaç tanesinin
  güncellendiği yazıyor.
*/
export async function kargoDurumlariniGuncelle(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const orderId = String(formData.get("order_id") ?? "");
  if (!MANAGERS.includes(membership.role)) return await geriDon(orderId, { error: "forbidden" });

  const ayar = await kargoAyari(supabase, organization.id);
  if (!ayar) return await geriDon(orderId, { error: "tryoto-kapali" });

  const [{ data: order }, { data: gonderiler }] = await Promise.all([
    supabase.from("arc_orders").select("order_number").eq("organization_id", organization.id).eq("id", orderId).maybeSingle(),
    supabase.from("arc_shipments").select("id,sequence,status,oto_order_id")
      .eq("organization_id", organization.id).eq("order_id", orderId).eq("source", "oto"),
  ]);
  if (!order) return await geriDon(orderId, { error: "order-not-found" });

  /*
    ELLE BASILAN DÜĞME süre sınırı tanımıyor: kullanıcı o gönderiyi
    bilerek soruyor. Sınırı yalnızca zamanlanmış görev uyguluyor.
  */
  const izlenecek = ((gonderiler ?? []) as Array<{ id: string; sequence: number; status: string; oto_order_id: string | null }>)
    .filter((gonderi) => izlenmeliMi(gonderi.status));
  if (!izlenecek.length) return await geriDon(orderId, { error: "Güncellenecek açık bir tryOTO gönderisi yok." });

  /*
    Yenileme mantığı ORTAK modülde (lib/kargo-durumu-yenile.ts): aynı işi
    zamanlanmış görev de yapıyor ve iki kopya er geç birbirinden sapardı.
  */
  let guncellenen = 0;
  for (const gonderi of izlenecek) {
    const sonuc = await gonderiDurumunuYenile(supabase, organization.id, ayar.anahtar, {
      id: gonderi.id,
      sequence: gonderi.sequence,
      status: gonderi.status,
      siparisNo: order.order_number as string,
    });
    if (sonuc.guncellendi) guncellenen += 1;
  }

  /*
    Gönderi kimliği VERİLMİYOR: tek çağrıda birkaç pakete birden takip
    numarası yazılmış olabilir ve her biri için ayrı bildirim gerekiyor.
  */
  await siparisiKargoyaVerildiYap(supabase, organization.id, orderId);
  await kargoBildirimiGonder(supabase, organization.id, orderId);

  revalidatePath(`/siparisler/${orderId}`);
  return guncellenen
    ? await geriDon(orderId, { saved: `${guncellenen} gönderinin durumu güncellendi` })
    : await geriDon(orderId, { error: "Hiçbir gönderinin durumu alınamadı; kartlardaki sebebe bakın." });
}
