"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";

const allowedRoles=new Set(["owner","admin","manager"]);
const clean=(formData:FormData,name:string,max:number)=>String(formData.get(name)??"").trim().slice(0,max);
const cents=(value:FormDataEntryValue|null)=>Math.max(0,Math.round(Number(value??0)*100));

export async function createDiscount(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  if(!allowedRoles.has(membership.role))redirect("/indirimler?error=forbidden");

  const name=clean(formData,"name",160);
  const code=clean(formData,"code",40).toUpperCase().replace(/[^A-Z0-9_-]/g,"");
  const type=clean(formData,"discount_type",30);
  const rawValue=Number(formData.get("value")??0);
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
  if(!name||!validType||!validValue)redirect("/indirimler?error=invalid-discount");

  const {error}=await supabase.from("arc_discounts").insert({
    organization_id:organization.id,name,code:code||null,discount_type:type,value,
    minimum_subtotal:minimumSubtotal,usage_limit:usageLimitRaw>0?Math.floor(usageLimitRaw):null,
    per_customer_limit:perCustomerRaw>0?Math.floor(perCustomerRaw):null,
    starts_at:startsAt?new Date(startsAt).toISOString():null,ends_at:endsAt?new Date(endsAt).toISOString():null,
    status,combinable,metadata:{badge:type==="free_shipping"?"Ücretsiz Kargo":type==="percentage"?`%${value} İndirim`:"Sepet İndirimi"}
  });
  if(error)redirect(`/indirimler?error=${encodeURIComponent(error.code??error.message)}`);
  revalidatePath("/indirimler");redirect("/indirimler?created=1");
}

export async function toggleDiscount(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const id=clean(formData,"id",80);
  if(!allowedRoles.has(membership.role))redirect("/indirimler?error=forbidden");
  const nextStatus=clean(formData,"next_status",20)==="active"?"active":"paused";
  const {error}=await supabase.from("arc_discounts").update({status:nextStatus,updated_at:new Date().toISOString()}).eq("id",id).eq("organization_id",organization.id);
  if(error)redirect(`/indirimler?error=${encodeURIComponent(error.code??error.message)}`);
  revalidatePath("/indirimler");redirect("/indirimler?saved=status");
}

export async function deleteDiscount(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const id=clean(formData,"id",80);
  if(!allowedRoles.has(membership.role))redirect("/indirimler?error=forbidden");
  const {error}=await supabase.from("arc_discounts").delete().eq("id",id).eq("organization_id",organization.id);
  if(error)redirect(`/indirimler?error=${encodeURIComponent(error.code??error.message)}`);
  revalidatePath("/indirimler");redirect("/indirimler?deleted=1");
}
