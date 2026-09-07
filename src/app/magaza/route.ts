import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/tenant";

export async function GET(){
  const {supabase,organization}=await requireTenant();
  const {data}=await supabase.from("arc_store_settings").select("storefront_url").eq("organization_id",organization.id).maybeSingle();
  let target:URL;
  try{target=new URL(data?.storefront_url??"https://arvoculture.com");}catch{target=new URL("https://arvoculture.com");}
  if(target.protocol!=="https:")target=new URL("https://arvoculture.com");
  return NextResponse.redirect(target);
}
