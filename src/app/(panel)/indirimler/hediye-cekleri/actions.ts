"use server";

import { revalidatePath } from "next/cache";
import { formTutari } from "@/lib/money";
import { bildirimliDonus } from "@/lib/panel-bildirim";
import { requireTenant } from "@/lib/tenant";
import { createServiceClient } from "@/lib/paytr/service-client";
import { trLocalToIso } from "@/lib/tr-time";
import { backUrl } from "@/lib/back-url";
import { basariMetni, hataMetni } from "./mesajlar";

/*
  HEDİYE ÇEKİ İŞLEMLERİ.

  YETKİ BURADA, YAZMA SERVİS ANAHTARIYLA. `arc_gift_cards` RLS
  açık ve POLİTİKASIZ: tabloya doğrudan gelen hiç kimse bir şey
  görmemeli, okuma ve yazma yalnızca SECURITY DEFINER
  fonksiyonlardan geçmeli. `arc_gift_card_issue` da para yaratan
  bir çağrı olduğu için yalnızca service_role'a açık.

  Yani yetkiyi veritabanı değil BU DOSYA daraltıyor; rol kontrolü
  atlanırsa herkes çek basabilir. İndirimlerdeki aynı rol kümesi
  kullanılıyor.
*/

const IZINLI_ROLLER = new Set(["owner", "admin", "manager"]);

const temiz = (form: FormData, ad: string, uzunluk: number) =>
  String(form.get(ad) ?? "").trim().slice(0, uzunluk);

const geriAdresi = (form: FormData) =>
  backUrl(form.get("back"), "/indirimler/hediye-cekleri", {});

export async function createGiftCard(formData: FormData) {
  const { organization, membership } = await requireTenant();
  if (!IZINLI_ROLLER.has(membership.role)) {
    return await bildirimliDonus(geriAdresi(formData), {
      hata: hataMetni("forbidden"),
    });
  }

  const kod = temiz(formData, "code", 40)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
  /* Türkçe yazım: "1.500" bin beş yüz liradır, 1,5 değil (formTutari). */
  const tutar = formTutari(formData.get("amount")) ?? 0;
  const asgari = formTutari(formData.get("minimum_subtotal")) ?? 0;
  const eposta = temiz(formData, "recipient_email", 160).toLowerCase();
  const ad = temiz(formData, "recipient_name", 160);
  const not = temiz(formData, "note", 400);
  const sonKullanim = temiz(formData, "expires_at", 40);

  if (kod.length < 4 || tutar <= 0) {
    return await bildirimliDonus(geriAdresi(formData), {
      hata: hataMetni("invalid-card"),
    });
  }

  /* Tarih Türkiye saatine göre okunuyor; geçersiz tarih hata
     ekranı açmıyor, mesaj dönüyor. */
  const sonKullanimIso = sonKullanim ? trLocalToIso(sonKullanim) : null;
  if (sonKullanim && !sonKullanimIso) {
    return await bildirimliDonus(geriAdresi(formData), {
      hata: hataMetni("invalid-date"),
    });
  }
  if (sonKullanimIso && sonKullanimIso <= new Date().toISOString()) {
    return await bildirimliDonus(geriAdresi(formData), {
      hata: hataMetni("past-date"),
    });
  }

  const servis = createServiceClient();
  const { error } = await servis.rpc("arc_gift_card_issue", {
    p_organization_id: organization.id,
    p_code: kod,
    p_amount: tutar,
    p_recipient_email: eposta || null,
    p_recipient_name: ad || null,
    p_expires_at: sonKullanimIso,
    p_note: not || null,
    p_minimum_subtotal: asgari,
  });

  if (error) {
    return await bildirimliDonus(geriAdresi(formData), {
      hata: hataMetni(error.code ?? error.message),
    });
  }

  revalidatePath("/indirimler/hediye-cekleri");
  return await bildirimliDonus(geriAdresi(formData), {
    basari: basariMetni("created"),
  });
}

/*
  ÇEK SİLİNMİYOR, KAPATILIYOR.

  Silmek kütükteki hareketleri de (on delete cascade) götürürdü ve
  "bu para nereye gitti" sorusu yanıtsız kalırdı. Kapatılan çek
  ödemede geçmiyor (`arc_gift_card_apply` status'e bakıyor) ama
  geçmişi duruyor.
*/
export async function toggleGiftCard(formData: FormData) {
  const { organization, membership } = await requireTenant();
  if (!IZINLI_ROLLER.has(membership.role)) {
    return await bildirimliDonus(geriAdresi(formData), {
      hata: hataMetni("forbidden"),
    });
  }

  const id = temiz(formData, "id", 80);
  const sonraki = temiz(formData, "next_status", 20);
  if (!id || !["active", "disabled"].includes(sonraki)) {
    return await bildirimliDonus(geriAdresi(formData), {
      hata: hataMetni("invalid"),
    });
  }

  const servis = createServiceClient();
  /*
    Mağaza kapsamı KOŞULDA: id tahmin edilerek başka mağazanın çeki
    kapatılamasın. Sonuç da okunuyor — eskiden indirim tarafında
    güncelleme sonucuna bakılmıyordu ve silinmiş kayıtta da
    "güncellendi" deniyordu.
  */
  const { data, error } = await servis
    .from("arc_gift_cards")
    .update({ status: sonraki, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organization.id)
    .select("id");

  if (error) {
    return await bildirimliDonus(geriAdresi(formData), {
      hata: hataMetni(error.code ?? error.message),
    });
  }
  if (!data || data.length === 0) {
    return await bildirimliDonus(geriAdresi(formData), {
      hata: hataMetni("not-found"),
    });
  }

  revalidatePath("/indirimler/hediye-cekleri");
  return await bildirimliDonus(geriAdresi(formData), {
    basari: basariMetni(sonraki === "active" ? "enabled" : "disabled"),
  });
}
