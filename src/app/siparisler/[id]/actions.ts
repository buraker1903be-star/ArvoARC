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

  const {data:ownedOrder}=await supabase.from("arc_orders").select("id").eq("organization_id",organization.id).eq("id",orderId).maybeSingle();
  if(!ownedOrder)redirect(`/siparisler/${orderId}?error=order-not-found`);
  const {error}=await supabase.rpc("arc_update_order_status",{p_order_id:orderId,p_status:status,p_payment_status:paymentStatus});
  if(error)redirect(`/siparisler/${orderId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/");revalidatePath("/siparisler");revalidatePath("/stok");revalidatePath("/urunler");revalidatePath(`/siparisler/${orderId}`);
  redirect(`/siparisler/${orderId}?saved=1`);
}
