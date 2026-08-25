"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";

const roles=new Set(["owner","admin","manager"]);
const orderStatuses=new Set(["pending","confirmed","processing","fulfilled","cancelled","refunded"]);
const paymentStatuses=new Set(["pending","authorized","paid","partially_refunded","refunded","failed"]);

export async function updateOrderStatus(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const orderId=String(formData.get("order_id")??"");
  if(!roles.has(membership.role))redirect(`/siparisler/${orderId}?error=forbidden`);
  const status=String(formData.get("status")??"");
  const paymentStatus=String(formData.get("payment_status")??"");
  if(!orderId||!orderStatuses.has(status)||!paymentStatuses.has(paymentStatus))redirect(`/siparisler/${orderId}?error=invalid-status`);

  const {error}=await supabase.from("arc_orders").update({status,payment_status:paymentStatus,updated_at:new Date().toISOString()}).eq("organization_id",organization.id).eq("id",orderId);
  if(error)redirect(`/siparisler/${orderId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/");revalidatePath("/siparisler");revalidatePath(`/siparisler/${orderId}`);
  redirect(`/siparisler/${orderId}?saved=1`);
}
