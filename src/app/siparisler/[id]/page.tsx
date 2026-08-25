import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { updateOrderStatus } from "./actions";

const money=(value:number,currency:string)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:currency||"TRY"}).format(value/100);
const statusLabels:Record<string,string>={pending:"Bekliyor",confirmed:"Onaylandı",processing:"Hazırlanıyor",fulfilled:"Tamamlandı",cancelled:"İptal",refunded:"İade"};
const paymentLabels:Record<string,string>={pending:"Bekliyor",authorized:"Onaylandı",paid:"Ödendi",partially_refunded:"Kısmi iade",refunded:"İade edildi",failed:"Başarısız"};

type Address={name?:string;address1?:string;address2?:string;city?:string;province?:string;zip?:string;country?:string;phone?:string};
type OrderMeta={billing?:Address;shipping_address?:Address;payment_method?:string;payment_reference?:string;notes?:string;tags?:string;historical_import?:boolean};

function AddressCard({title,address}:{title:string;address?:Address}){
  const lines=[address?.name,address?.address1,address?.address2,[address?.zip,address?.city].filter(Boolean).join(" "),address?.province,address?.country,address?.phone].filter(Boolean);
  return <article style={{padding:18,border:"1px solid rgba(0,0,0,.08)",borderRadius:12}}><small>{title}</small>{lines.length?lines.map((line,index)=><p key={index} style={{margin:"7px 0"}}>{line}</p>):<p>Bilgi bulunmuyor.</p>}</article>;
}

export default async function OrderDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{saved?:string;error?:string}>}){
  const {id}=await params;const query=await searchParams;
  const {supabase,organization,membership}=await requireTenant();
  const [{data:order,error},{data:items,error:itemsError}]=await Promise.all([
    supabase.from("arc_orders").select("id,order_number,source,status,payment_status,customer_name,customer_email,currency,subtotal,tax,shipping,total,metadata,created_at,updated_at").eq("organization_id",organization.id).eq("id",id).maybeSingle(),
    supabase.from("arc_order_items").select("id,product_name,sku,quantity,unit_price,total").eq("organization_id",organization.id).eq("order_id",id).order("product_name")
  ]);
  if(error)throw new Error(error.message);if(itemsError)throw new Error(itemsError.message);if(!order)notFound();
  const canManage=["owner","admin","manager"].includes(membership.role);const meta=(order.metadata??{}) as OrderMeta;
  return <Shell active="orders" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small><Link href="/siparisler">SİPARİŞLER</Link> · {order.source.toUpperCase()}</small><h2>{order.order_number}</h2><p>{new Date(order.created_at).toLocaleString("tr-TR")} · {order.customer_name||order.customer_email||"Misafir müşteri"}</p></div></section>
    {query.saved&&<section className="card" style={{padding:16,marginBottom:20}}><strong>Sipariş durumu güncellendi.</strong></section>}
    {query.error&&<section className="card" style={{padding:16,marginBottom:20}}><strong>İşlem tamamlanamadı: {query.error}</strong></section>}

    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.5fr) minmax(280px,.7fr)",gap:24}}>
      <section className="card" style={{padding:24}}><div className="head"><div><small>SİPARİŞ KALEMLERİ</small><h3>{items?.length??0} kalem</h3></div><span>{order.source==="shopify"?"Shopify arşivi":"ARC Native"}</span></div>
        <div style={{marginTop:16}}>{items?.map(item=><div key={item.id} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:18,padding:"15px 0",borderTop:"1px solid rgba(0,0,0,.08)",alignItems:"center"}}><div><b>{item.product_name}</b><small style={{display:"block",marginTop:5}}>SKU: {item.sku}</small></div><span>{item.quantity} × {money(item.unit_price,order.currency)}</span><strong>{money(item.total,order.currency)}</strong></div>)}</div>
        <div style={{marginTop:20,marginLeft:"auto",maxWidth:330,display:"grid",gap:9}}><span style={{display:"flex",justifyContent:"space-between"}}>Ara toplam <b>{money(order.subtotal,order.currency)}</b></span><span style={{display:"flex",justifyContent:"space-between"}}>Kargo <b>{money(order.shipping,order.currency)}</b></span><span style={{display:"flex",justifyContent:"space-between"}}>Vergi <b>{money(order.tax,order.currency)}</b></span><strong style={{display:"flex",justifyContent:"space-between",fontSize:18,borderTop:"1px solid",paddingTop:12}}>Toplam <b>{money(order.total,order.currency)}</b></strong></div>
      </section>
      <aside className="card" style={{padding:24}}><div className="head"><div><small>DURUM</small><h3>Yönetim</h3></div></div>
        {canManage?<form action={updateOrderStatus} style={{display:"grid",gap:14,marginTop:16}}><input type="hidden" name="order_id" value={order.id}/><label>Sipariş durumu<select name="status" defaultValue={order.status} style={{display:"block",width:"100%",padding:12,marginTop:6}}>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Ödeme durumu<select name="payment_status" defaultValue={order.payment_status} style={{display:"block",width:"100%",padding:12,marginTop:6}}>{Object.entries(paymentLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button type="submit" style={{padding:12}}>Durumu kaydet</button></form>:<p>{statusLabels[order.status]} · {paymentLabels[order.payment_status]}</p>}
        <div style={{marginTop:24,borderTop:"1px solid rgba(0,0,0,.08)",paddingTop:18}}><small>MÜŞTERİ</small><p><b>{order.customer_name||"İsimsiz müşteri"}</b><br/>{order.customer_email||"E-posta yok"}</p>{meta.payment_method&&<p><b>Ödeme:</b> {meta.payment_method}</p>}{meta.notes&&<p><b>Not:</b> {meta.notes}</p>}</div>
      </aside>
    </div>
    <section style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:20,marginTop:24}}><AddressCard title="FATURA ADRESİ" address={meta.billing}/><AddressCard title="TESLİMAT ADRESİ" address={meta.shipping_address}/></section>
  </Shell>;
}
