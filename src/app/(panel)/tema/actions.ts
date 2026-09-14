"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";

const roles=new Set(["owner","admin","manager"]);
const text=(fd:FormData,key:string,max:number)=>String(fd.get(key)??"").trim().slice(0,max);
const href=(value:string)=>value.startsWith("/")?value.slice(0,240):"/";
const color=(value:string,fallback:string)=>/^#[0-9A-Fa-f]{6}$/.test(value)?value.toUpperCase():fallback;
const number=(fd:FormData,key:string,fallback:number,min=0,max=100)=>{const value=Number(fd.get(key));return Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback};
const allowedSections=new Set(["hero","manifest","worlds","featured","campaign","values","footer"]);
type ThemeSection={id:string;type:string;enabled:boolean;order:number};
function sectionLayout(fd:FormData):ThemeSection[]{
  try{
    const parsed=JSON.parse(String(fd.get("section_layout_json")??"[]")) as unknown;
    if(!Array.isArray(parsed))throw new Error();
    const seen=new Set<string>();
    const layout=parsed.flatMap((item,index)=>{
      if(!item||typeof item!=="object")return[];
      const value=item as Record<string,unknown>,id=String(value.id??""),type=String(value.type??id);
      if(!allowedSections.has(type)||!id||seen.has(id))return[];
      seen.add(id);return[{id,type,enabled:value.enabled!==false,order:(index+1)*10}];
    });
    return layout.length?layout:["hero","manifest","worlds","featured","campaign","values","footer"].map((id,index)=>({id,type:id,enabled:true,order:(index+1)*10}));
  }catch{return["hero","manifest","worlds","featured","campaign","values","footer"].map((id,index)=>({id,type:id,enabled:true,order:(index+1)*10}));}
}

export async function saveThemeDraft(formData:FormData){
  const {supabase,user,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))redirect("/tema?error=forbidden");
  const {data:current}=await supabase.from("arc_store_themes").select("version,config").eq("organization_id",organization.id).eq("mode","draft").maybeSingle();
  const layout=sectionLayout(formData);const section=(type:string)=>layout.find(item=>item.type===type);const config={
    ...((current?.config??{}) as Record<string,unknown>),
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
    hero_style:["editorial-orbs","minimal","split"].includes(text(formData,"hero_style",30))?text(formData,"hero_style",30):"editorial-orbs",
    header_layout:["centered","logo-left","minimal"].includes(text(formData,"header_layout",20))?text(formData,"header_layout",20):"centered",
    sticky_header:formData.get("sticky_header")==="on",show_search:formData.get("show_search")==="on",show_account:formData.get("show_account")==="on",
    product_card_style:["editorial","bordered","minimal"].includes(text(formData,"product_card_style",20))?text(formData,"product_card_style",20):"editorial",
    product_image_ratio:["portrait","square","landscape"].includes(text(formData,"product_image_ratio",20))?text(formData,"product_image_ratio",20):"portrait",
    products_per_row:number(formData,"products_per_row",4,2,5),
    show_vendor:formData.get("show_vendor")==="on",show_badges:formData.get("show_badges")==="on",show_quick_add:formData.get("show_quick_add")==="on",
    section_layout:layout,show_manifest:section("manifest")?.enabled??false,show_worlds:section("worlds")?.enabled??false,show_featured:section("featured")?.enabled??false,
    show_campaign:section("campaign")?.enabled??false,show_values:section("values")?.enabled??false,
    order_manifest:section("manifest")?.order??20,order_worlds:section("worlds")?.order??30,order_featured:section("featured")?.order??40,
    order_campaign:section("campaign")?.order??50,order_values:section("values")?.order??60,
    manifest_title:text(formData,"manifest_title",140),manifest_description:text(formData,"manifest_description",360),
    apparel_title:text(formData,"apparel_title",100),apparel_description:text(formData,"apparel_description",180),
    beauty_title:text(formData,"beauty_title",100),beauty_description:text(formData,"beauty_description",180),
    trust_one:text(formData,"trust_one",80),trust_two:text(formData,"trust_two",80),trust_three:text(formData,"trust_three",80),trust_four:text(formData,"trust_four",80),
    footer_tagline:text(formData,"footer_tagline",240),instagram_url:text(formData,"instagram_url",240),facebook_url:text(formData,"facebook_url",240)
  };
  if(!config.hero_title||!config.hero_description)redirect("/tema?error=required-fields");
  const {error}=await supabase.from("arc_store_themes").upsert({organization_id:organization.id,mode:"draft",version:current?.version??1,config,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:"organization_id,mode"});
  if(error)redirect(`/tema?error=${encodeURIComponent(error.code??error.message)}`);
  revalidatePath("/tema");redirect("/tema?saved=draft");
}


const themeAssetTypes:Record<string,string>={"image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/avif":"avif"};
export async function uploadThemeAsset(formData:FormData){
  const {supabase,user,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))redirect("/tema?error=forbidden");
  const slot=["hero_image","campaign_image"].includes(text(formData,"slot",30))?text(formData,"slot",30):"";
  const file=formData.get("file");
  if(!slot||!(file instanceof File)||!file.size||file.size>8*1024*1024||!themeAssetTypes[file.type])redirect("/tema?error=invalid-theme-image");
  const {data:draft,error:draftError}=await supabase.from("arc_store_themes").select("config,version").eq("organization_id",organization.id).eq("mode","draft").maybeSingle();
  if(draftError||!draft)redirect("/tema?error=draft-not-found");
  const config=(draft.config??{}) as Record<string,unknown>;const oldPath=String(config[`${slot}_path`]??"");
  const path=`${organization.id}/commerce/theme/${slot}-${Date.now()}.${themeAssetTypes[file.type]}`;
  const {error:uploadError}=await supabase.storage.from("organization-assets").upload(path,await file.arrayBuffer(),{contentType:file.type,cacheControl:"31536000",upsert:false});
  if(uploadError)redirect(`/tema?error=${encodeURIComponent(uploadError.message)}`);
  const publicUrl=supabase.storage.from("organization-assets").getPublicUrl(path).data.publicUrl;
  const next={...config,[`${slot}_path`]:path,[`${slot}_url`]:publicUrl};
  const {error}=await supabase.from("arc_store_themes").update({config:next,updated_by:user.id,updated_at:new Date().toISOString()}).eq("organization_id",organization.id).eq("mode","draft");
  if(error){await supabase.storage.from("organization-assets").remove([path]);redirect(`/tema?error=${encodeURIComponent(error.message)}`);}
  if(oldPath&&oldPath.startsWith(`${organization.id}/`))await supabase.storage.from("organization-assets").remove([oldPath]);
  revalidatePath("/tema");redirect(`/tema?saved=${slot}`);
}

export async function publishTheme(){
  const {supabase,user,organization,membership}=await requireTenant();
  if(!roles.has(membership.role))redirect("/tema?error=forbidden");
  const [{data:draft,error:draftError},{data:published},{data:settings}]=await Promise.all([
    supabase.from("arc_store_themes").select("config,version").eq("organization_id",organization.id).eq("mode","draft").maybeSingle(),
    supabase.from("arc_store_themes").select("version").eq("organization_id",organization.id).eq("mode","published").maybeSingle(),
    supabase.from("arc_store_settings").select("store_name,logo_path,favicon_path,primary_color,accent_color").eq("organization_id",organization.id).maybeSingle()
  ]);
  if(draftError||!draft)redirect("/tema?error=draft-not-found");
  const now=new Date().toISOString();
  const logoUrl=settings?.logo_path?supabase.storage.from("organization-assets").getPublicUrl(settings.logo_path).data.publicUrl:undefined;
  const faviconUrl=settings?.favicon_path?supabase.storage.from("organization-assets").getPublicUrl(settings.favicon_path).data.publicUrl:undefined;
  const config={...(draft.config as Record<string,unknown>),store_name:settings?.store_name??organization.name,logo_url:logoUrl,favicon_url:faviconUrl};
  const {error}=await supabase.from("arc_store_themes").upsert({organization_id:organization.id,mode:"published",version:(published?.version??0)+1,config,updated_by:user.id,published_at:now,updated_at:now},{onConflict:"organization_id,mode"});
  if(error)redirect(`/tema?error=${encodeURIComponent(error.code??error.message)}`);
  revalidatePath("/tema");redirect("/tema?published=1");
}
