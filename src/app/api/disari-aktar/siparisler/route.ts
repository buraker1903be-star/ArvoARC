import { requireTenant } from "@/lib/tenant";
import { fetchAllRows } from "@/lib/fetch-all";

function csvCell(value:unknown){
  let text=String(value??"").replace(/\r?\n/g," ");
  if(/^[=+\-@]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}

const dateTime=new Intl.DateTimeFormat("tr-TR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"});

type OrderRow={id:string;order_number:string;source:string|null;status:string;payment_status:string;customer_name:string|null;customer_email:string|null;currency:string;subtotal:number;tax:number;shipping:number;total:number;created_at:string};

/*
  Tüm siparişler 1000'lik sayfalarla okunur. Öncesinde tek istekte
  çekiliyordu ve Supabase 1000 satırda kestiği için dosyada yalnızca
  en yeni 1000 sipariş bulunuyordu. İkincil sıralama (id) sayfalar
  arasında satır kaybını ve tekrarını önler.
*/
export async function GET(){
  const {supabase,organization}=await requireTenant();
  let orders:OrderRow[];
  try{
    ({rows:orders}=await fetchAllRows<OrderRow>((from,to)=>supabase.from("arc_orders").select("id,order_number,source,status,payment_status,customer_name,customer_email,currency,subtotal,tax,shipping,total,created_at").eq("organization_id",organization.id).order("created_at",{ascending:false}).order("id").range(from,to) as unknown as PromiseLike<{data:OrderRow[]|null;error:{message:string}|null}>,100_000));
  }catch{return new Response("Rapor oluşturulamadı",{status:500});}
  const headers=["Sipariş No","Kaynak","Sipariş Durumu","Ödeme Durumu","Müşteri","E-posta","Para Birimi","Ara Toplam","Vergi","Kargo","Toplam","Tarih"];
  const rows=orders.map(order=>[order.order_number,order.source,order.status,order.payment_status,order.customer_name,order.customer_email,order.currency,((order.subtotal??0)/100).toFixed(2),((order.tax??0)/100).toFixed(2),((order.shipping??0)/100).toFixed(2),(order.total/100).toFixed(2),dateTime.format(new Date(order.created_at))]);
  const csv="﻿"+[headers,...rows].map(row=>row.map(csvCell).join(";")).join("\r\n");
  return new Response(csv,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="arvoarc-siparisler-${new Date().toISOString().slice(0,10)}.csv"`,"cache-control":"private, no-store"}});
}
