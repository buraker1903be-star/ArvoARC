"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";

const allowedRoles=new Set(["owner","admin","manager"]);
const slugify=(value:string)=>value.toLocaleLowerCase("tr-TR").replace(/[çÇ]/g,"c").replace(/[ğĞ]/g,"g").replace(/[ıİ]/g,"i").replace(/[öÖ]/g,"o").replace(/[şŞ]/g,"s").replace(/[üÜ]/g,"u").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,160);
const field=(formData:FormData,name:string,max:number)=>String(formData.get(name)??"").trim().slice(0,max);

export async function createCollection(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  if(!allowedRoles.has(membership.role))redirect("/koleksiyonlar?error=forbidden");
  const title=field(formData,"title",160);
  const slug=slugify(field(formData,"slug",180)||title);
  if(!title||!slug)redirect("/koleksiyonlar?error=invalid-collection");
  const {data,error}=await supabase.from("arc_collections").insert({
    organization_id:organization.id,title,slug,description:"",status:"draft",source:"native",seo_title:title,seo_description:"",metadata:{}
  }).select("id").single();
  if(error)redirect(`/koleksiyonlar?error=${encodeURIComponent(error.code??error.message)}`);
  revalidatePath("/koleksiyonlar");
  redirect(`/koleksiyonlar/${data.id}?created=1`);
}

export async function updateCollection(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const id=field(formData,"id",80);
  if(!allowedRoles.has(membership.role))redirect(`/koleksiyonlar/${id}?error=forbidden`);
  const title=field(formData,"title",160);
  const slug=slugify(field(formData,"slug",180)||title);
  const description=field(formData,"description",10000);
  const seoTitle=field(formData,"seo_title",70);
  const seoDescription=field(formData,"seo_description",180);
  const requestedStatus=field(formData,"status",20);
  const status=["draft","active","archived"].includes(requestedStatus)?requestedStatus:"draft";
  if(!id||!title||!slug)redirect(`/koleksiyonlar/${id}?error=invalid-collection`);

  const {data:collection,error:collectionError}=await supabase.from("arc_collections").select("id,metadata").eq("organization_id",organization.id).eq("id",id).maybeSingle();
  if(collectionError||!collection)redirect(`/koleksiyonlar/${id}?error=not-found`);
  const {error:updateError}=await supabase.from("arc_collections").update({
    title,slug,description,status,seo_title:seoTitle,seo_description:seoDescription,updated_at:new Date().toISOString()
  }).eq("organization_id",organization.id).eq("id",id);
  if(updateError)redirect(`/koleksiyonlar/${id}?error=${encodeURIComponent(updateError.code??updateError.message)}`);

  const requestedProductIds=[...new Set(formData.getAll("product_ids").map(String).filter(Boolean))].slice(0,1000);
  let validProductIds:string[]=[];
  if(requestedProductIds.length){
    const {data:validProducts,error:productsError}=await supabase.from("arc_products").select("id").eq("organization_id",organization.id).in("id",requestedProductIds);
    if(productsError)redirect(`/koleksiyonlar/${id}?error=${encodeURIComponent(productsError.message)}`);
    validProductIds=(validProducts??[]).map(product=>product.id);
  }
  const {error:deleteError}=await supabase.from("arc_collection_products").delete().eq("organization_id",organization.id).eq("collection_id",id);
  if(deleteError)redirect(`/koleksiyonlar/${id}?error=${encodeURIComponent(deleteError.message)}`);
  if(validProductIds.length){
    const {error:insertError}=await supabase.from("arc_collection_products").insert(validProductIds.map((productId,position)=>({
      organization_id:organization.id,collection_id:id,product_id:productId,position
    })));
    if(insertError)redirect(`/koleksiyonlar/${id}?error=${encodeURIComponent(insertError.message)}`);
  }
  revalidatePath("/koleksiyonlar");revalidatePath(`/koleksiyonlar/${id}`);revalidatePath("/urunler");
  redirect(`/koleksiyonlar/${id}?saved=1`);
}
