"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { fetchAllRows } from "@/lib/fetch-all";

const allowedRoles=new Set(["owner","admin","manager"]);
const slugify=(value:string)=>value.toLocaleLowerCase("tr-TR").replace(/[çÇ]/g,"c").replace(/[ğĞ]/g,"g").replace(/[ıİ]/g,"i").replace(/[öÖ]/g,"o").replace(/[şŞ]/g,"s").replace(/[üÜ]/g,"u").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,160);
const field=(formData:FormData,name:string,max:number)=>String(formData.get(name)??"").trim().slice(0,max);
/* Kimlik listeleri URL'ye yazıldığı için 150'lik parçalarla gönderilir. */
const chunked=<T,>(items:T[],size=150)=>Array.from({length:Math.ceil(items.length/size)},(_,index)=>items.slice(index*size,index*size+size));

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

type Membership={product_id:string;position:number|null};

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

  /*
    Üyelik değişikliği fark olarak uygulanır.

    Öncesinde koleksiyonun tüm üyelikleri silinip formda işaretli
    ürünler yeniden ekleniyordu. Seçici yalnızca son güncellenen
    300 ürünü gösterdiği (ve üyelikler 1000 satırda kesildiği) için
    listede görünmeyen üyeler her kayıtta koleksiyondan düşüyordu.

    Artık yalnızca formda gösterilen üyelerden işareti kaldırılanlar
    silinir, yeni işaretlenen ürünler sona eklenir. Formda hiç
    gösterilmeyen üyeliklere dokunulmaz.
  */
  const shown=new Set(formData.getAll("member_ids").map(String).filter(Boolean));
  const checked=new Set(formData.getAll("product_ids").map(String).filter(Boolean));
  let current:Membership[];
  try{
    ({rows:current}=await fetchAllRows<Membership>((from,to)=>supabase.from("arc_collection_products").select("product_id,position").eq("organization_id",organization.id).eq("collection_id",id).order("position").order("product_id").range(from,to) as unknown as PromiseLike<{data:Membership[]|null;error:{message:string}|null}>,100_000));
  }catch(error){redirect(`/koleksiyonlar/${id}?error=${encodeURIComponent(error instanceof Error?error.message:"memberships")}`);}
  const currentIds=new Set(current.map(item=>item.product_id));
  const toRemove=[...shown].filter(productId=>currentIds.has(productId)&&!checked.has(productId));
  const requestedAdd=[...checked].filter(productId=>!currentIds.has(productId)).slice(0,1000);

  /* Eklenecek ürünler bu mağazaya ait olmalı. */
  const validAdd:string[]=[];
  for(const chunk of chunked(requestedAdd)){
    const {data,error}=await supabase.from("arc_products").select("id").eq("organization_id",organization.id).in("id",chunk);
    if(error)redirect(`/koleksiyonlar/${id}?error=${encodeURIComponent(error.message)}`);
    validAdd.push(...(data??[]).map(product=>product.id));
  }

  for(const chunk of chunked(toRemove)){
    const {error}=await supabase.from("arc_collection_products").delete().eq("organization_id",organization.id).eq("collection_id",id).in("product_id",chunk);
    if(error)redirect(`/koleksiyonlar/${id}?error=${encodeURIComponent(error.message)}`);
  }
  if(validAdd.length){
    const lastPosition=current.reduce((max,item)=>Math.max(max,item.position??0),-1);
    const {error:insertError}=await supabase.from("arc_collection_products").insert(validAdd.map((productId,index)=>({
      organization_id:organization.id,collection_id:id,product_id:productId,position:lastPosition+1+index
    })));
    if(insertError)redirect(`/koleksiyonlar/${id}?error=${encodeURIComponent(insertError.message)}`);
  }
  revalidatePath("/koleksiyonlar");revalidatePath(`/koleksiyonlar/${id}`);revalidatePath("/urunler");
  redirect(`/koleksiyonlar/${id}?saved=1&added=${validAdd.length}&removed=${toRemove.length}`);
}
