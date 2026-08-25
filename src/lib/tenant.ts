import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireTenant() {
  const supabase = await createClient();
  const {data,error:claimsError}=await supabase.auth.getClaims();
  const userId=typeof data?.claims?.sub==="string"?data.claims.sub:null;
  if(claimsError||!userId)redirect("/login");
  const {data,error}=await supabase.rpc("arc_resolve_commerce_tenant");
  if(error)throw new Error(`Tenant could not be resolved: ${error.message}`);
  const tenant=data?.[0];
  if(!tenant)redirect("/login?error=no-organization");
  const organization={id:tenant.organization_id,name:tenant.organization_name,slug:tenant.organization_slug,plan_code:tenant.plan_code,status:tenant.organization_status};
  if (organization.status !== "active" && organization.status !== "trial") {
    redirect("/login?error=organization-inactive");
  }
  if(!tenant.commerce_enabled)redirect("/login?error=commerce-disabled");
  return {supabase,user:{id:userId},membership:{organization_id:organization.id,role:tenant.membership_role},organization};
}
