import { requireTenant } from "@/lib/tenant";

function csvCell(value:unknown){
  let text=String(value??"").replace(/\r?\n/g," ");
  if(/^[=+\-@]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}

export async function GET(){
  const {supabase,organization}=await requireTenant();
  const {data:orders,error}=await supabase.from("arc_orders").select("order_number,source,status,payment_status,customer_name,customer_email,currency,subtotal,tax,shipping,total,created_at").eq("organization_id",organization.id).order("created_at",{ascending:false});
  if(error)return new Response("Rapor oluşturulamadı",{status:500});
  const headers=["Sipariş No","Kaynak","Sipariş Durumu","Ödeme Durumu","Müşteri","E-posta","Para Birimi","Ara Toplam","Vergi","Kargo","Toplam","Tarih"];
  const rows=(orders??[]).map(order=>[order.order_number,order.source,order.status,order.payment_status,order.customer_name,order.customer_email,order.currency,(order.subtotal/100).toFixed(2),(order.tax/100).toFixed(2),(order.shipping/100).toFixed(2),(order.total/100).toFixed(2),new Date(order.created_at).toLocaleString("tr-TR")]);
  const csv="\uFEFF"+[headers,...rows].map(row=>row.map(csvCell).join(";")).join("\r\n");
  return new Response(csv,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="arvoarc-siparisler-${new Date().toISOString().slice(0,10)}.csv"`,"cache-control":"private, no-store"}});
}
