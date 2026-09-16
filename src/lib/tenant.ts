import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/*
  cache(): panel yerleşimi ve sayfa aynı istekte çağırıyor; oturum
  doğrulaması ve kiracı sorgusu istek başına bir kez çalışır.
*/
export const requireTenant = cache(async function requireTenant() {
  const supabase = await createClient();
  const {data:claimsData,error:claimsError}=await supabase.auth.getClaims();
  const userId=typeof claimsData?.claims?.sub==="string"?claimsData.claims.sub:null;
  if(claimsError||!userId)redirect("/login");
  const {data:tenantData,error}=await supabase.rpc("arc_resolve_commerce_tenant");
  if(error)throw new Error(`Tenant could not be resolved: ${error.message}`);
  const tenant=tenantData?.[0];
  if(!tenant)redirect("/login?error=no-organization");
  const organization={id:tenant.organization_id,name:tenant.organization_name,slug:tenant.organization_slug,plan_code:tenant.plan_code,status:tenant.organization_status};
  if (organization.status !== "active" && organization.status !== "trial") {
    redirect("/login?error=organization-inactive");
  }
  if(!tenant.commerce_enabled)redirect("/login?error=commerce-disabled");
  /*
    Arc aboneliği ArvoOS üzerinden yönetilir. Kademe kuralı veritabanında
    tek yerde (public.arc_store_stage); panel "open" dışındaki her kademede
    kapanır — ödeme gecikince ilk kapanan panel, vitrin ve satış bir süre
    daha sürer.

    Kademe hiç gelmezse (RPC'nin arc_stage döndürmeyen bir sürümü yayındaysa)
    engellenmez: yayın sırası yüzünden mağaza sahibini paneline kilitlemek
    istemiyoruz. Ama sessiz de geçmiyoruz — bu durumda yaptırım tamamen
    kapalıdır ve fark edilmezse aylarca öyle kalır. Tek sahibi
    supabase/migrations/20260916200500_tenant_rpc_canonical.sql; ArvoOS'un eski
    bir migration'ı fonksiyonu geri almış olabilir.
  */
  if(tenant.arc_stage===undefined||tenant.arc_stage===null){
    console.error("[kiracı] arc_resolve_commerce_tenant arc_stage döndürmüyor; Arc kademe yaptırımı KAPALI. 20260916200500_tenant_rpc_canonical.sql yeniden uygulanmalı.");
  }else if(tenant.arc_stage!=="open"){
    redirect("/login?error=license-inactive");
  }
  return {supabase,user:{id:userId},membership:{organization_id:organization.id,role:tenant.membership_role},organization};
});
