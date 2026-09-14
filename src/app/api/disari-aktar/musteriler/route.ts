import { requireTenant } from "@/lib/tenant";
import { currentTime, customerTags, loadCustomers } from "@/app/(panel)/musteriler/customer-data";

function csvCell(value:unknown){
  let text=String(value??"").replace(/\r?\n/g," ");
  if(/^[=+\-@]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}

const date=new Intl.DateTimeFormat("tr-TR",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"Europe/Istanbul"});

/*
  Müşteri listesi CSV. Toplamlar panelle aynı fonksiyondan
  (loadCustomers): net harcama iptal ve iadeler hariç.
*/
export async function GET(){
  const {supabase,organization,membership}=await requireTenant();
  /* Müşteri e-postaları kişisel veri: dosya yalnızca yöneticilere. */
  if(!["owner","admin","manager"].includes(membership.role))return new Response("Bu raporu yalnızca mağaza yöneticileri indirebilir.",{status:403});
  let result:Awaited<ReturnType<typeof loadCustomers>>;
  try{result=await loadCustomers(supabase,organization.id);}
  catch{return new Response("Rapor oluşturulamadı",{status:500});}
  const now=currentTime();
  const headers=["Müşteri","E-posta","Sipariş","Geçerli Sipariş","Net Harcama","Ortalama Sepet","İlk Sipariş","Son Sipariş","Segment"];
  const rows=result.customers
    .sort((a,b)=>b.spent-a.spent)
    .map(customer=>[
      customer.name,
      customer.email,
      customer.orders,
      customer.paidOrders,
      (customer.spent/100).toFixed(2),
      (customer.paidOrders?customer.spent/customer.paidOrders/100:0).toFixed(2),
      date.format(new Date(customer.firstOrderAt)),
      date.format(new Date(customer.lastOrderAt)),
      customerTags(customer,now).map(tag=>tag.label).join(", "),
    ]);
  const csv="﻿"+[headers,...rows].map(row=>row.map(csvCell).join(";")).join("\r\n");
  return new Response(csv,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="arvoarc-musteriler-${new Date().toISOString().slice(0,10)}.csv"`,"cache-control":"private, no-store"}});
}
