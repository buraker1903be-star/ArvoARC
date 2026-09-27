"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { bolmeSorunu, otoDurumunuCevir, type Gonderi, type SiparisKalemi } from "@/lib/kargo-bolme";
import { KARGO_FIRMALARI, takipAdresi } from "@/lib/kargo-firmalari";
import { decryptSecret } from "@/lib/payment-credentials";
import { OtoHatasi } from "@/lib/tryoto/hatalar";
import { otoIstek } from "@/lib/tryoto/istemci";
import { createOrderGovdesi, govdeSorunu } from "@/lib/tryoto/siparis-govdesi";

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
const geriDon = (orderId: string, sonuc: Record<string, string>): never => {
  const p = new URLSearchParams(sonuc);
  redirect(`/siparisler/${orderId}?${p.toString()}`);
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
  if (!MANAGERS.includes(membership.role)) return geriDon(orderId, { error: "forbidden" });

  const carrierCode = String(formData.get("carrier_code") ?? "").trim();
  const trackingNumber = String(formData.get("tracking_number") ?? "").trim();
  const supplier = String(formData.get("supplier") ?? "").trim();
  const elleAdres = String(formData.get("tracking_url") ?? "").trim();
  const secim = secimiOku(formData);

  if (!KARGO_FIRMALARI.some((firma) => firma.kod === carrierCode)) return geriDon(orderId, { error: "kargo-firmasi-gecersiz" });
  /*
    Takip numarası burada da isteniyor, veritabanı da istiyor. İkisi
    birden: veritabanı kuralı güvenlik sınırı, buradaki ise kullanıcıya
    Türkçe ve alanı işaret eden bir mesaj verebilmek için.
  */
  if (!trackingNumber) return geriDon(orderId, { error: "takip-numarasi-gerekli" });

  const [{ data: kalemler }, { data: gonderiler }] = await Promise.all([
    supabase.from("arc_order_items").select("id,quantity,product_name").eq("organization_id", organization.id).eq("order_id", orderId),
    supabase.from("arc_shipments").select("id,status,sequence,arc_shipment_items(order_item_id,quantity)").eq("organization_id", organization.id).eq("order_id", orderId),
  ]);

  const mevcutGonderiler: Gonderi[] = ((gonderiler ?? []) as Array<{ id: string; status: string; arc_shipment_items: { order_item_id: string; quantity: number }[] | null }>)
    .map((satir) => ({ id: satir.id, status: satir.status, items: satir.arc_shipment_items ?? [] }));
  const sorun = bolmeSorunu(secim, (kalemler ?? []) as SiparisKalemi[], mevcutGonderiler);
  if (sorun) return geriDon(orderId, { error: sorun });

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
  if (error || !gonderi) return geriDon(orderId, { error: error?.message ?? "gonderi-olusturulamadi" });

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
    geriDon(orderId, { error: kalemHatasi.message });
  }

  revalidatePath(`/siparisler/${orderId}`);
  geriDon(orderId, { saved: "gonderi" });
}

/*
  Gönderi iptali kaydı SİLMİYOR, durumunu değiştiriyor: iptal edilen
  gönderinin kalemleri yeniden bölünebilir sayılıyor (tetikleyici iptali
  saymıyor) ve geçmişte hangi firmaya ne verildiği görünür kalıyor.
*/
export async function gonderiIptal(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const orderId = String(formData.get("order_id") ?? "");
  if (!MANAGERS.includes(membership.role)) return geriDon(orderId, { error: "forbidden" });
  const gonderiId = String(formData.get("shipment_id") ?? "");

  const { error } = await supabase.from("arc_shipments")
    .update({ status: "cancelled" })
    .eq("id", gonderiId).eq("organization_id", organization.id);
  if (error) return geriDon(orderId, { error: error.message });

  revalidatePath(`/siparisler/${orderId}`);
  geriDon(orderId, { saved: "gonderi-iptal" });
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

type MagazaKargoAyari = {
  tryoto_enabled: boolean | null;
  tryoto_refresh_token_enc: string | null;
  tryoto_pickup_location_code: string | null;
};

async function kargoAyari(
  supabase: Awaited<ReturnType<typeof requireTenant>>["supabase"],
  organizationId: string,
): Promise<{ anahtar: string; gondericiKodu: string | null } | null> {
  const { data } = await supabase.from("arc_store_settings")
    .select("tryoto_enabled,tryoto_refresh_token_enc,tryoto_pickup_location_code")
    .eq("organization_id", organizationId).maybeSingle();
  const ayar = data as MagazaKargoAyari | null;
  if (!ayar?.tryoto_enabled || !ayar.tryoto_refresh_token_enc) return null;
  return { anahtar: decryptSecret(ayar.tryoto_refresh_token_enc), gondericiKodu: ayar.tryoto_pickup_location_code };
}

/*
  ETİKET (AWB) BİLGİSİ print ucundan alınıyor.

  createOrder yanıtındaki alan adları belgelenmemiş ve canlıda firma adı
  da takip numarası da boş geldi. print/{orderId} ise belgeli ve üçünü
  birden veriyor: printAWBURL, trackingNumber, deliveryCompany. Etiket
  üretiminin hemen ardından çağrılıyor; başarısız olursa gönderi yine
  oluşmuş sayılıyor ve karttaki düğmeyle sonradan alınabiliyor — kargo
  firması etiketi bazen birkaç saniye gecikmeyle üretiyor.

  orderId olarak BİZİM verdiğimiz kimlik kullanılıyor ("AC-1042-1"):
  createOrder'a onu gönderdik ve print de onu bekliyor.
*/
async function etiketBilgisi(
  magazaId: string,
  anahtar: string,
  otoSiparisKimligi: string,
): Promise<{ awbUrl: string | null; takipNo: string | null; firma: string | null } | null> {
  try {
    const yanit = await otoIstek<Record<string, unknown>>({
      magazaId,
      yenilemeAnahtari: anahtar,
      yol: `print/${encodeURIComponent(otoSiparisKimligi)}`,
      yontem: "GET",
    });
    const metin = (ad: string) => (typeof yanit[ad] === "string" && (yanit[ad] as string).trim() ? (yanit[ad] as string).trim() : null);
    return {
      awbUrl: metin("printAWBURL"),
      takipNo: metin("trackingNumber") ?? metin("dcTrackingNumber"),
      firma: metin("deliveryCompany"),
    };
  } catch {
    return null;
  }
}

/** Gönderinin OTO'daki sipariş kimliği; createOrder'a verilen değerle aynı. */
const otoSiparisKimligi = (siparisNo: string, sira: number) => `${siparisNo}-${sira}`;

export async function otoTaslakOlustur(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const orderId = String(formData.get("order_id") ?? "");
  if (!MANAGERS.includes(membership.role)) return geriDon(orderId, { error: "forbidden" });

  const supplier = String(formData.get("supplier") ?? "").trim();
  const secim = secimiOku(formData);

  const [{ data: kalemler }, { data: gonderiler }] = await Promise.all([
    supabase.from("arc_order_items").select("id,quantity,product_name").eq("organization_id", organization.id).eq("order_id", orderId),
    supabase.from("arc_shipments").select("id,status,sequence,arc_shipment_items(order_item_id,quantity)").eq("organization_id", organization.id).eq("order_id", orderId),
  ]);
  const mevcut: Gonderi[] = ((gonderiler ?? []) as Array<{ id: string; status: string; arc_shipment_items: { order_item_id: string; quantity: number }[] | null }>)
    .map((satir) => ({ id: satir.id, status: satir.status, items: satir.arc_shipment_items ?? [] }));
  const sorun = bolmeSorunu(secim, (kalemler ?? []) as SiparisKalemi[], mevcut);
  if (sorun) return geriDon(orderId, { error: sorun });

  const sonrakiSira = Math.max(0, ...((gonderiler ?? []) as { sequence: number }[]).map((s) => s.sequence)) + 1;
  const { data: gonderi, error } = await supabase.from("arc_shipments").insert({
    organization_id: organization.id,
    order_id: orderId,
    sequence: sonrakiSira,
    source: "oto",
    status: "draft",
    supplier: supplier || null,
  }).select("id").single();
  if (error || !gonderi) return geriDon(orderId, { error: error?.message ?? "gonderi-olusturulamadi" });

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
    return geriDon(orderId, { error: kalemHatasi.message });
  }

  revalidatePath(`/siparisler/${orderId}`);
  return geriDon(orderId, { saved: "taslak" });
}

export async function otoEtiketUret(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const orderId = String(formData.get("order_id") ?? "");
  if (!MANAGERS.includes(membership.role)) return geriDon(orderId, { error: "forbidden" });
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
  if (!ayar) return geriDon(orderId, { error: "tryoto-kapali" });

  const [{ data: order }, { data: gonderi }] = await Promise.all([
    supabase.from("arc_orders").select("id,order_number,currency,payment_status,customer_name,customer_email,metadata")
      .eq("organization_id", organization.id).eq("id", orderId).maybeSingle(),
    supabase.from("arc_shipments").select("id,sequence,status,arc_shipment_items(order_item_id,quantity)")
      .eq("organization_id", organization.id).eq("id", gonderiId).maybeSingle(),
  ]);
  if (!order || !gonderi) return geriDon(orderId, { error: "gonderi-bulunamadi" });
  if (gonderi.status !== "draft") return geriDon(orderId, { error: "gonderi-zaten-olusturuldu" });

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
    gonderici: null,
    teslimatSecenegiId: secenekId || null,
    agirlikKg: Number.isFinite(agirlik) && agirlik > 0 ? agirlik : null,
    enCm,
    boyCm,
    yukseklikCm,
  };

  const govdeHatasi = govdeSorunu(girdi);
  if (govdeHatasi) return geriDon(orderId, { error: govdeHatasi });

  try {
    /*
      createShipment: true — sipariş ve gönderi tek çağrıda açılıyor.
      Ayrı createShipment çağrısı, araya hata girdiğinde OTO'da gönderisiz
      bir sipariş bırakıyor ve o sipariş elle temizlenmek zorunda kalıyor.
    */
    const yanit = await otoIstek<Record<string, unknown>>({
      magazaId: organization.id,
      yenilemeAnahtari: ayar.anahtar,
      yol: "createOrder",
      govde: { ...createOrderGovdesi(girdi), createShipment: true },
    });

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
    const etiket = await etiketBilgisi(
      organization.id,
      ayar.anahtar,
      otoSiparisKimligi(order.order_number as string, gonderi.sequence as number),
    );

    await supabase.from("arc_shipments").update({
      status: "created",
      oto_order_id: oku(["otoId", "orderId", "id"]),
      delivery_option_id: secenekId || null,
      carrier_name: etiket?.firma ?? oku(["deliveryCompanyName", "deliveryCompany"]) ?? secilenFirma ?? null,
      tracking_number: etiket?.takipNo ?? oku(["trackingNumber", "waybill", "awb"]),
      tracking_url: oku(["trackingLink", "trackingUrl"]),
      awb_url: etiket?.awbUrl ?? oku(["printAWBURL", "awbUrl", "labelUrl"]),
      failure_reason: etiket ? null : "Etiket adresi henüz alınamadı; karttan “Etiketi al” ile deneyin.",
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
    return geriDon(orderId, { error: mesaj });
  }

  revalidatePath(`/siparisler/${orderId}`);
  return geriDon(orderId, { saved: "etiket" });
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
  if (!MANAGERS.includes(membership.role)) return geriDon(orderId, { error: "forbidden" });
  const gonderiId = String(formData.get("shipment_id") ?? "");

  const ayar = await kargoAyari(supabase, organization.id);
  if (!ayar) return geriDon(orderId, { error: "tryoto-kapali" });

  const [{ data: order }, { data: gonderi }] = await Promise.all([
    supabase.from("arc_orders").select("order_number").eq("organization_id", organization.id).eq("id", orderId).maybeSingle(),
    supabase.from("arc_shipments").select("id,sequence").eq("organization_id", organization.id).eq("id", gonderiId).maybeSingle(),
  ]);
  if (!order || !gonderi) return geriDon(orderId, { error: "gonderi-bulunamadi" });

  const etiket = await etiketBilgisi(
    organization.id,
    ayar.anahtar,
    otoSiparisKimligi(order.order_number as string, gonderi.sequence as number),
  );
  if (!etiket?.awbUrl) {
    return geriDon(orderId, { error: "Etiket henüz hazır değil. Kargo firması oluşturunca tekrar deneyin." });
  }

  await supabase.from("arc_shipments").update({
    awb_url: etiket.awbUrl,
    ...(etiket.takipNo ? { tracking_number: etiket.takipNo } : {}),
    ...(etiket.firma ? { carrier_name: etiket.firma } : {}),
    failure_reason: null,
  }).eq("id", gonderiId).eq("organization_id", organization.id);

  revalidatePath(`/siparisler/${orderId}`);
  return geriDon(orderId, { saved: "etiket-alindi" });
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
  if (!MANAGERS.includes(membership.role)) return geriDon(orderId, { error: "forbidden" });

  const ayar = await kargoAyari(supabase, organization.id);
  if (!ayar) return geriDon(orderId, { error: "tryoto-kapali" });

  const [{ data: order }, { data: gonderiler }] = await Promise.all([
    supabase.from("arc_orders").select("order_number").eq("organization_id", organization.id).eq("id", orderId).maybeSingle(),
    supabase.from("arc_shipments").select("id,sequence,status,oto_order_id")
      .eq("organization_id", organization.id).eq("order_id", orderId).eq("source", "oto"),
  ]);
  if (!order) return geriDon(orderId, { error: "order-not-found" });

  const izlenecek = ((gonderiler ?? []) as Array<{ id: string; sequence: number; status: string; oto_order_id: string | null }>)
    .filter((gonderi) => !["draft", "cancelled", "delivered"].includes(gonderi.status));
  if (!izlenecek.length) return geriDon(orderId, { error: "Güncellenecek açık bir tryOTO gönderisi yok." });

  let guncellenen = 0;
  for (const gonderi of izlenecek) {
    try {
      const yanit = await otoIstek<Record<string, unknown>>({
        magazaId: organization.id,
        yenilemeAnahtari: ayar.anahtar,
        yol: "orderStatus",
        govde: { orderId: otoSiparisKimligi(order.order_number as string, gonderi.sequence) },
      });
      const metin = (ad: string) => (typeof yanit[ad] === "string" && (yanit[ad] as string).trim() ? (yanit[ad] as string).trim() : null);
      const yeniDurum = otoDurumunuCevir(metin("status"));
      await supabase.from("arc_shipments").update({
        status: yeniDurum,
        /*
          Teslim anı bir kez yazılıyor: her güncellemede now() yazmak,
          gerçek teslim zamanını son tıklamanın zamanına kaydırırdı.
        */
        ...(yeniDurum === "delivered" && gonderi.status !== "delivered" ? { delivered_at: new Date().toISOString() } : {}),
        ...(metin("trackingUrl") ? { tracking_url: metin("trackingUrl") } : {}),
        ...(metin("dcTrackingNumber") ? { tracking_number: metin("dcTrackingNumber") } : {}),
        ...(metin("printAWBURL") ? { awb_url: metin("printAWBURL") } : {}),
        ...(metin("deliveryCompany") ? { carrier_name: metin("deliveryCompany") } : {}),
        ...(metin("otoId") ? { oto_order_id: metin("otoId") } : {}),
        failure_reason: null,
      }).eq("id", gonderi.id).eq("organization_id", organization.id);
      guncellenen += 1;
    } catch (hata) {
      const mesaj = hata instanceof OtoHatasi ? hata.message : "Durum alınamadı.";
      await supabase.from("arc_shipments").update({ failure_reason: mesaj })
        .eq("id", gonderi.id).eq("organization_id", organization.id);
    }
  }

  revalidatePath(`/siparisler/${orderId}`);
  return guncellenen
    ? geriDon(orderId, { saved: `${guncellenen} gönderinin durumu güncellendi` })
    : geriDon(orderId, { error: "Hiçbir gönderinin durumu alınamadı; kartlardaki sebebe bakın." });
}
