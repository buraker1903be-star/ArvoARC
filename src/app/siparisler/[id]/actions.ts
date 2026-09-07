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


type OrderMetadata={shipping_carrier?:string;tracking_number?:string;tracking_url?:string;internal_note?:string;[key:string]:unknown};

export async function updateFulfillmentDetails(formData:FormData){
  const {supabase,organization,membership}=await requireTenant();
  const orderId=String(formData.get("order_id")??"");
  if(!roles.has(membership.role))redirect(`/siparisler/${orderId}?error=forbidden`);
  const carrier=String(formData.get("shipping_carrier")??"").trim();
  const trackingNumber=String(formData.get("tracking_number")??"").trim();
  const trackingInput=String(formData.get("tracking_url")??"").trim();
  const internalNote=String(formData.get("internal_note")??"").trim();
  if(carrier.length>100||trackingNumber.length>160||internalNote.length>1000)redirect(`/siparisler/${orderId}?error=invalid-fulfillment`);
  let trackingUrl="";
  if(trackingInput){
    try{const parsed=new URL(trackingInput);if(parsed.protocol!=="https:"||parsed.username||parsed.password)throw new Error();trackingUrl=parsed.toString();}
    catch{redirect(`/siparisler/${orderId}?error=invalid-tracking-url`);}
  }

  const {data:order,error:readError}=await supabase.from("arc_orders").select("metadata").eq("organization_id",organization.id).eq("id",orderId).maybeSingle();
  if(readError||!order)redirect(`/siparisler/${orderId}?error=order-not-found`);
  const metadata=(order.metadata??{}) as OrderMetadata;
  const {error}=await supabase.from("arc_orders").update({metadata:{...metadata,shipping_carrier:carrier||null,tracking_number:trackingNumber||null,tracking_url:trackingUrl||null,internal_note:internalNote||null},updated_at:new Date().toISOString()}).eq("organization_id",organization.id).eq("id",orderId);
  if(error)redirect(`/siparisler/${orderId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/siparisler");revalidatePath(`/siparisler/${orderId}`);
  redirect(`/siparisler/${orderId}?saved=fulfillment`);
}
