"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";

const roles=new Set(["owner","admin","manager"]);
const text=(fd:FormData,key:string,max:number)=>String(fd.get(key)??"").trim().slice(0,max);
const href=(value:string)=>value.startsWith("/")?value.slice(0,240):"/";
const color=(value:string,fallback:string)=>/^#[0-9A-Fa-f]{6}$/.test(value)?value.toUpperCase():fallback;

export async function saveThemeDraft(formData:FormData){
  const {supabase,user,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))redirect("/tema?error=forbidden");
  const config={
    announcement:text(formData,"announcement",180),
    hero_eyebrow:text(formData,"hero_eyebrow",100),
    hero_title:text(formData,"hero_title",100),
    hero_emphasis:text(formData,"hero_emphasis",100),
    hero_description:text(formData,"hero_description",360),
    primary_cta_label:text(formData,"primary_cta_label",60),
    primary_cta_href:href(text(formData,"primary_cta_href",240)),
    secondary_cta_label:text(formData,"secondary_cta_label",60),
    secondary_cta_href:href(text(formData,"secondary_cta_href",240)),
    featured_eyebrow:text(formData,"featured_eyebrow",80),
    featured_title:text(formData,"featured_title",100),
    campaign_title:text(formData,"campaign_title",100),
    campaign_description:text(formData,"campaign_description",240),
    primary_color:color(text(formData,"primary_color",7),"#111210"),
    accent_color:color(text(formData,"accent_color",7),"#D9FF43"),
    background_color:color(text(formData,"background_color",7),"#F5F2EC"),
    typography:["editorial","modern","minimal"].includes(text(formData,"typography",20))?text(formData,"typography",20):"editorial",
    hero_style:["editorial-orbs","minimal","split"].includes(text(formData,"hero_style",30))?text(formData,"hero_style",30):"editorial-orbs"
  };
  if(!config.hero_title||!config.hero_description)redirect("/tema?error=required-fields");
  const {data:current}=await supabase.from("arc_store_themes").select("version").eq("organization_id",organization.id).eq("mode","draft").maybeSingle();
  const {error}=await supabase.from("arc_store_themes").upsert({organization_id:organization.id,mode:"draft",version:current?.version??1,config,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:"organization_id,mode"});
  if(error)redirect(`/tema?error=${encodeURIComponent(error.code??error.message)}`);
  revalidatePath("/tema");redirect("/tema?saved=draft");
}

export async function publishTheme(){
  const {supabase,user,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))redirect("/tema?error=forbidden");
  const [{data:draft,error:draftError},{data:published}]=await Promise.all([
    supabase.from("arc_store_themes").select("config,version").eq("organization_id",organization.id).eq("mode","draft").maybeSingle(),
    supabase.from("arc_store_themes").select("version").eq("organization_id",organization.id).eq("mode","published").maybeSingle()
  ]);
  if(draftError||!draft)redirect("/tema?error=draft-not-found");
  const now=new Date().toISOString();
  const {error}=await supabase.from("arc_store_themes").upsert({organization_id:organization.id,mode:"published",version:(published?.version??0)+1,config:draft.config,updated_by:user.id,published_at:now,updated_at:now},{onConflict:"organization_id,mode"});
  if(error)redirect(`/tema?error=${encodeURIComponent(error.code??error.message)}`);
  revalidatePath("/tema");redirect("/tema?published=1");
}
