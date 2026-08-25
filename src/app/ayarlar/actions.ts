"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";

export async function updateStoreSettings(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  if(!["owner","admin","manager"].includes(membership.role))redirect("/ayarlar?error=forbidden");
  const storeName=String(formData.get("store_name")??"").trim();
  const storefrontUrl=String(formData.get("storefront_url")??"").trim();
  const currency=String(formData.get("currency")??"TRY").trim().toUpperCase();
  const locale=String(formData.get("locale")??"tr-TR").trim();
  const threshold=Number(formData.get("low_stock_threshold")??5);
  let url:URL;
  try{url=new URL(storefrontUrl);}catch{redirect("/ayarlar?error=invalid-url");}
  if(url.protocol!=="https:"||url.username||url.password||!storeName||!/^[A-Z]{3}$/.test(currency)||!Number.isInteger(threshold)||threshold<0||threshold>10000)redirect("/ayarlar?error=invalid-settings");

  const {error}=await supabase.from("arc_store_settings").upsert({organization_id:organization.id,store_name:storeName,storefront_url:url.toString().replace(/\/$/,""),currency,locale,low_stock_threshold:threshold,updated_at:new Date().toISOString()},{onConflict:"organization_id"});
  if(error)redirect(`/ayarlar?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/ayarlar");revalidatePath("/stok");
  redirect("/ayarlar?saved=1");
}
