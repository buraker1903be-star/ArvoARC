"use server";

import { formTutari } from "@/lib/money";
import { revalidatePath } from "next/cache";
import { bildirimliDonus } from "@/lib/panel-bildirim";
import { basariMetni, hataMetni } from "./mesajlar";
import { requireTenant } from "@/lib/tenant";
import { trLocalToIso } from "@/lib/tr-time";
import { backUrl } from "@/lib/back-url";

const allowedRoles=new Set(["owner","admin","manager"]);
const clean=(formData:FormData,name:string,max:number)=>String(formData.get(name)??"").trim().slice(0,max);
/*
  GERİ DÖNÜŞ ADRESİ (16.10.2026). İşlem her durumda listenin başına
  dönüyordu: süzgeç, arama ve sayfa gidiyordu, kampanya detayından
  verilen karar da sayfayı listeye atıyordu. Adres formdan geldiği
  için backUrl doğruluyor (açık yönlendirme kapalı).
*/
const geriAdresi=(formData:FormData)=>backUrl(formData.get("back"),"/indirimler",{});
/* Sayı olmayan girdi 0 sayılır; öncesinde NaN veritabanına gidiyordu.
   Türkçe yazım (formTutari): "1.500" bin beş yüz liradır, 1,5 değil. */
const cents=(value:FormDataEntryValue|null)=>formTutari(value)??0;

export async function createDiscount(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  if(!allowedRoles.has(membership.role))return await bildirimliDonus(geriAdresi(formData),{hata:hataMetni("forbidden")});

  const name=clean(formData,"name",160);
  const code=clean(formData,"code",40).toUpperCase().replace(/[^A-Z0-9_-]/g,"");
  const type=clean(formData,"discount_type",30);
  /* Yüzde "12,5" de yazılabilir: virgül ondalık. */
  const rawValue=Number(String(formData.get("value")??0).trim().replace(",","."));
  const value=type==="percentage"?Math.round(rawValue):type==="fixed_amount"?cents(formData.get("value")):0;
  const minimumSubtotal=cents(formData.get("minimum_subtotal"));
  const status=formData.get("active")==="on"?"active":"draft";
  const combinable=formData.get("combinable")==="on";
  const usageLimitRaw=Number(formData.get("usage_limit")??0);
  const perCustomerRaw=Number(formData.get("per_customer_limit")??0);
  const startsAt=clean(formData,"starts_at",40);
  const endsAt=clean(formData,"ends_at",40);

  const validType=["percentage","fixed_amount","free_shipping"].includes(type);
  const validValue=(type==="percentage"&&value>=1&&value<=100)||(type==="fixed_amount"&&value>0)||(type==="free_shipping"&&value===0);
  if(!name||!validType||!validValue)return await bildirimliDonus(geriAdresi(formData),{hata:hataMetni("invalid-discount")});

  /* Tarihler Türkiye saati; geçersiz tarih artık hata ekranı açmıyor. */
  const startsIso=startsAt?trLocalToIso(startsAt):null;
  const endsIso=endsAt?trLocalToIso(endsAt):null;
  if((startsAt&&!startsIso)||(endsAt&&!endsIso))return await bildirimliDonus(geriAdresi(formData),{hata:hataMetni("invalid-date")});
  if(startsIso&&endsIso&&endsIso<=startsIso)return await bildirimliDonus(geriAdresi(formData),{hata:hataMetni("invalid-range")});

  const {error}=await supabase.from("arc_discounts").insert({
    organization_id:organization.id,name,code:code||null,discount_type:type,value,
    minimum_subtotal:minimumSubtotal,usage_limit:usageLimitRaw>0?Math.floor(usageLimitRaw):null,
    per_customer_limit:perCustomerRaw>0?Math.floor(perCustomerRaw):null,
    starts_at:startsIso,ends_at:endsIso,
    status,combinable,metadata:{badge:type==="free_shipping"?"Ücretsiz Kargo":type==="percentage"?`%${value} İndirim`:"Sepet İndirimi"}
  });
  if(error)return await bildirimliDonus(geriAdresi(formData),{hata:hataMetni(error.code??error.message)});
  revalidatePath("/indirimler");return await bildirimliDonus(geriAdresi(formData),{basari:basariMetni("created")});
}

export async function toggleDiscount(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const id=clean(formData,"id",80);
  if(!allowedRoles.has(membership.role))return await bildirimliDonus(geriAdresi(formData),{hata:hataMetni("forbidden")});
  const nextStatus=clean(formData,"next_status",20)==="active"?"active":"paused";
  const {error}=await supabase.from("arc_discounts").update({status:nextStatus,updated_at:new Date().toISOString()}).eq("id",id).eq("organization_id",organization.id);
  if(error)return await bildirimliDonus(geriAdresi(formData),{hata:hataMetni(error.code??error.message)});
  revalidatePath("/indirimler");return await bildirimliDonus(geriAdresi(formData),{basari:basariMetni("status")});
}

export async function deleteDiscount(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const id=clean(formData,"id",80);
  if(!allowedRoles.has(membership.role))return await bildirimliDonus(geriAdresi(formData),{hata:hataMetni("forbidden")});
  const {error}=await supabase.from("arc_discounts").delete().eq("id",id).eq("organization_id",organization.id);
  if(error)return await bildirimliDonus(geriAdresi(formData),{hata:hataMetni(error.code??error.message)});
  revalidatePath("/indirimler");return await bildirimliDonus(geriAdresi(formData),{basari:basariMetni("deleted")});
}


/* ---------------------------------------------------------------- */

type Sonuc = { hata?: string; basari?: string };

/*
  DURUM ÇEKİRDEĞİ. Durum üç yerden değiştiriliyor: listedeki satır
  düğmesi, seçilenlerin toplu işlemi ve kampanya detayı. Üçü de aynı
  koşulu kurmalı, yoksa biri başka mağazanın kaydına dokunabilir.

  `status` kısıtı yalnızca dört değere izin veriyor (draft, active,
  paused, expired); panelden yazılan değer bu yüzden burada da
  süzülüyor — kısıt hatası kullanıcıya ham kod olarak dönerdi.
*/
async function durumuYaz(idler: string[], durum: string): Promise<Sonuc> {
  const { supabase, organization, membership } = await requireTenant();
  if (!allowedRoles.has(membership.role)) return { hata: hataMetni("forbidden") };
  const hedef = durum === "active" ? "active" : durum === "draft" ? "draft" : "paused";
  const temiz = [...new Set(idler.filter((id) => typeof id === "string" && id))].slice(0, 100);
  if (!temiz.length) return { hata: hataMetni("invalid") };

  const { data, error } = await supabase.from("arc_discounts")
    .update({ status: hedef, updated_at: new Date().toISOString() })
    .eq("organization_id", organization.id)
    .in("id", temiz)
    .select("id");
  if (error) return { hata: hataMetni(error.code ?? error.message) };
  /* Hiçbir satıra dokunulmadıysa "güncellendi" DENMİYOR: kayıt silinmiş
     ya da başka mağazanın olabilir. */
  if (!data?.length) return { hata: hataMetni("not-found") };

  revalidatePath("/indirimler");
  /* Kural vitrinde anında geçerli olmalı: sepet ve ödeme bu tablodan okuyor. */
  revalidatePath("/");
  return {
    basari: data.length === 1
      ? basariMetni("status")
      : `${data.length} kampanya ${hedef === "active" ? "etkinleştirildi" : hedef === "draft" ? "taslağa alındı" : "duraklatıldı"}.`,
  };
}

/*
  LİSTEDE YERİNDE DURUM. Sipariş listesindeki "Onayla →" ile aynı
  kalıp: eylem sonuç DÖNDÜRÜYOR, yönlendirmiyor — kaydırma yeri ve
  seçim korunuyor.
*/
export async function indirimDurumSonuc(id: string, durum: string): Promise<Sonuc> {
  return await durumuYaz([id], durum);
}

/** Seçilenlerin durumu: aynı çekirdek, tek istek. */
export async function topluIndirimDurumu(idler: string[], durum: string): Promise<Sonuc> {
  return await durumuYaz(idler, durum);
}

/*
  KAMPANYA DÜZENLEME (detay sayfası). Önce yalnızca oluşturma ve
  durum değiştirme vardı: yazım hatası olan bir kuponu düzeltmenin
  tek yolu silip yeniden yaratmaktı ve o da kullanım sayacını
  sıfırlıyordu.

  Doğrulama createDiscount ile aynı: kısıtlar veritabanında da var
  (arc_discounts_check), buradaki kontrol kullanıcıya Türkçe sebep
  söylemek için.
*/
export async function updateDiscount(formData: FormData) {
  const { supabase, organization, membership } = await requireTenant();
  const geri = geriAdresi(formData);
  if (!allowedRoles.has(membership.role)) return await bildirimliDonus(geri, { hata: hataMetni("forbidden") });

  const id = clean(formData, "id", 80);
  const name = clean(formData, "name", 160);
  const code = clean(formData, "code", 40).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  const type = clean(formData, "discount_type", 30);
  const rawValue = Number(String(formData.get("value") ?? 0).trim().replace(",", "."));
  const value = type === "percentage" ? Math.round(rawValue) : type === "fixed_amount" ? cents(formData.get("value")) : 0;
  const minimumSubtotal = cents(formData.get("minimum_subtotal"));
  const combinable = formData.get("combinable") === "on";
  const usageLimitRaw = Number(formData.get("usage_limit") ?? 0);
  const perCustomerRaw = Number(formData.get("per_customer_limit") ?? 0);
  const startsAt = clean(formData, "starts_at", 40);
  const endsAt = clean(formData, "ends_at", 40);

  const validType = ["percentage", "fixed_amount", "free_shipping"].includes(type);
  const validValue = (type === "percentage" && value >= 1 && value <= 100) || (type === "fixed_amount" && value > 0) || (type === "free_shipping" && value === 0);
  if (!id || !name || !validType || !validValue) return await bildirimliDonus(geri, { hata: hataMetni("invalid-discount") });

  const startsIso = startsAt ? trLocalToIso(startsAt) : null;
  const endsIso = endsAt ? trLocalToIso(endsAt) : null;
  if ((startsAt && !startsIso) || (endsAt && !endsIso)) return await bildirimliDonus(geri, { hata: hataMetni("invalid-date") });
  if (startsIso && endsIso && endsIso <= startsIso) return await bildirimliDonus(geri, { hata: hataMetni("invalid-range") });

  /*
    KULLANIM SAYACINA DOKUNULMUYOR. usage_count tetikleyiciyle artıyor
    (arc_count_coupon_use); forma koyup yazmak, kampanyayı
    düzenleyenin sayacı sıfırlaması demek olurdu.
  */
  const { data, error } = await supabase.from("arc_discounts").update({
    name, code: code || null, discount_type: type, value,
    minimum_subtotal: minimumSubtotal,
    usage_limit: usageLimitRaw > 0 ? Math.floor(usageLimitRaw) : null,
    per_customer_limit: perCustomerRaw > 0 ? Math.floor(perCustomerRaw) : null,
    starts_at: startsIso, ends_at: endsIso, combinable,
    updated_at: new Date().toISOString(),
  }).eq("organization_id", organization.id).eq("id", id).select("id");

  if (error) return await bildirimliDonus(geri, { hata: hataMetni(error.code ?? error.message) });
  if (!data?.length) return await bildirimliDonus(geri, { hata: hataMetni("not-found") });
  revalidatePath("/indirimler");
  revalidatePath("/");
  return await bildirimliDonus(geri, { basari: basariMetni("updated") });
}
