import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { updateFulfillmentDetails, updateOrderStatus } from "./actions";

const money=(value:number,currency:string)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:currency||"TRY"}).format(value/100);
const statusLabels:Record<string,string>={pending:"Bekliyor",confirmed:"Onaylandı",processing:"Hazırlanıyor",fulfilled:"Tamamlandı",cancelled:"İptal",refunded:"İade"};
const paymentLabels:Record<string,string>={pending:"Bekliyor",authorized:"Onaylandı",paid:"Ödendi",partially_refunded:"Kısmi iade",refunded:"İade edildi",failed:"Başarısız"};

type Address={name?:string;address1?:string;address2?:string;city?:string;province?:string;zip?:string;country?:string;phone?:string};
type OrderMeta={billing?:Address;shipping_address?:Address;payment_method?:string;payment_reference?:string;notes?:string;tags?:string;historical_import?:boolean;shipping_carrier?:string;tracking_number?:string;tracking_url?:string;internal_note?:string};

function AddressCard({title,address}:{title:string;address?:Address}){
  const lines=[address?.name,address?.address1,address?.address2,[address?.zip,address?.city].filter(Boolean).join(" "),address?.province,address?.country,address?.phone].filter(Boolean);
  return <article style={{padding:18,border:"1px solid rgba(0,0,0,.08)",borderRadius:12}}><small>{title}</small>{lines.length?lines.map((line,index)=><p key={index} style={{margin:"7px 0"}}>{line}</p>):<p>Bilgi bulunmuyor.</p>}</article>;
}

export default async function OrderDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{saved?:string;error?:string}>}){
  const {id}=await params;const query=await searchParams;
  const {supabase,organization,membership}=await requireTenant();
  const [{data:order,error},{data:items,error:itemsError},{data:events,error:eventsError}]=await Promise.all([
    supabase.from("arc_orders").select("id,order_number,source,status,payment_status,customer_name,customer_email,currency,subtotal,tax,shipping,total,metadata,created_at,updated_at").eq("organization_id",organization.id).eq("id",id).maybeSingle(),
    supabase.from("arc_order_items").select("id,product_name,sku,quantity,unit_price,total").eq("organization_id",organization.id).eq("order_id",id).order("product_name"),
    supabase.from("arc_order_events").select("id,event_type,event_data,created_by,created_at").eq("organization_id",organization.id).eq("order_id",id).order("created_at",{ascending:false}).limit(50)
  ]);
  if(error)throw new Error(error.message);if(itemsError)throw new Error(itemsError.message);if(eventsError)throw new Error(eventsError.message);if(!order)notFound();
  const canManage=["owner","admin","manager"].includes(membership.role);const meta=(order.metadata??{}) as OrderMeta;
  return <Shell active="orders" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small><Link href="/siparisler">SİPARİŞLER</Link> · {order.source.toUpperCase()}</small><h2>{order.order_number}</h2><p>{new Date(order.created_at).toLocaleString("tr-TR")} · {order.customer_name||order.customer_email||"Misafir müşteri"}</p></div></section>
    {query.saved&&<section className="card" style={{padding:16,marginBottom:20}}><strong>{query.saved==="fulfillment"?"Kargo ve operasyon bilgileri kaydedildi.":"Sipariş durumu güncellendi."}</strong></section>}
    {query.error&&<section className="card" style={{padding:16,marginBottom:20}}><strong>İşlem tamamlanamadı: {query.error}</strong></section>}

    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.5fr) minmax(280px,.7fr)",gap:24}}>
      <section className="card" style={{padding:24}}><div className="head"><div><small>SİPARİŞ KALEMLERİ</small><h3>{items?.length??0} kalem</h3></div><span>{order.source==="shopify"?"Shopify arşivi":"ARC Native"}</span></div>
        <div style={{marginTop:16}}>{items?.map(item=><div key={item.id} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:18,padding:"15px 0",borderTop:"1px solid rgba(0,0,0,.08)",alignItems:"center"}}><div><b>{item.product_name}</b><small style={{display:"block",marginTop:5}}>SKU: {item.sku}</small></div><span>{item.quantity} × {money(item.unit_price,order.currency)}</span><strong>{money(item.total,order.currency)}</strong></div>)}</div>
        <div style={{marginTop:20,marginLeft:"auto",maxWidth:330,display:"grid",gap:9}}><span style={{display:"flex",justifyContent:"space-between"}}>Ara toplam <b>{money(order.subtotal,order.currency)}</b></span><span style={{display:"flex",justifyContent:"space-between"}}>Kargo <b>{money(order.shipping,order.currency)}</b></span><span style={{display:"flex",justifyContent:"space-between"}}>Vergi <b>{money(order.tax,order.currency)}</b></span><strong style={{display:"flex",justifyContent:"space-between",fontSize:18,borderTop:"1px solid",paddingTop:12}}>Toplam <b>{money(order.total,order.currency)}</b></strong></div>
      </section>
      <aside className="card" style={{padding:24}}><div className="head"><div><small>DURUM</small><h3>Yönetim</h3></div></div>
        {canManage?<form action={updateOrderStatus} style={{display:"grid",gap:14,marginTop:16}}><input type="hidden" name="order_id" value={order.id}/><label>Sipariş durumu<select name="status" defaultValue={order.status} style={{display:"block",width:"100%",padding:12,marginTop:6}}>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Ödeme durumu<select name="payment_status" defaultValue={order.payment_status} style={{display:"block",width:"100%",padding:12,marginTop:6}}>{Object.entries(paymentLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button type="submit" style={{padding:12}}>Durumu kaydet</button></form>:<p>{statusLabels[order.status]} · {paymentLabels[order.payment_status]}</p>}
        <div style={{marginTop:24,borderTop:"1px solid rgba(0,0,0,.08)",paddingTop:18}}><small>MÜŞTERİ</small><p><b>{order.customer_name||"İsimsiz müşteri"}</b><br/>{order.customer_email||"E-posta yok"}</p>{meta.payment_method&&<p><b>Ödeme:</b> {meta.payment_method}</p>}{meta.notes&&<p><b>Müşteri notu:</b> {meta.notes}</p>}</div>
        <div style={{marginTop:24,borderTop:"1px solid rgba(0,0,0,.08)",paddingTop:18}}><small>KARGO VE OPERASYON</small>
          {canManage?<form action={updateFulfillmentDetails} style={{display:"grid",gap:12,marginTop:14}}><input type="hidden" name="order_id" value={order.id}/><label>Kargo firması<input name="shipping_carrier" defaultValue={meta.shipping_carrier??""} maxLength={100} style={{display:"block",width:"100%",padding:10,marginTop:5}}/></label><label>Takip numarası<input name="tracking_number" defaultValue={meta.tracking_number??""} maxLength={160} style={{display:"block",width:"100%",padding:10,marginTop:5}}/></label><label>Takip bağlantısı<input name="tracking_url" type="url" defaultValue={meta.tracking_url??""} placeholder="https://..." style={{display:"block",width:"100%",padding:10,marginTop:5}}/></label><label>İç operasyon notu<textarea name="internal_note" defaultValue={meta.internal_note??""} maxLength={1000} rows={4} style={{display:"block",width:"100%",padding:10,marginTop:5}}/></label><button type="submit" style={{padding:10}}>Kargo bilgilerini kaydet</button></form>:<p>{meta.shipping_carrier||"Kargo firması yok"} · {meta.tracking_number||"Takip numarası yok"}</p>}
          {meta.tracking_url&&<p><a href={meta.tracking_url} target="_blank" rel="noreferrer">Kargo takibini aç ↗</a></p>}
        </div>
      </aside>
    </div>
    <section className="card" style={{padding:24,marginTop:24}}><div className="head"><div><small>İŞLEM GEÇMİŞİ</small><h3>Zaman çizelgesi</h3></div><span>{events?.length??0} kayıt</span></div><div style={{marginTop:16}}>{events?.length?events.map(event=>{const data=(event.event_data??{}) as Record<string,string|null>;const title=event.event_type==="status_updated"?"Sipariş durumu güncellendi":"Kargo bilgileri güncellendi";const detail=event.event_type==="status_updated"?`${statusLabels[data.old_status??""]??data.old_status??"—"} → ${statusLabels[data.new_status??""]??data.new_status??"—"} · Ödeme: ${paymentLabels[data.new_payment_status??""]??data.new_payment_status??"—"}`:`${data.shipping_carrier||"Kargo firması yok"} · ${data.tracking_number||"Takip numarası yok"}`;return <div className="order" key={event.id}><i>✓</i><div><b>{title}</b><small>{detail}</small></div><span style={{textAlign:"right",fontSize:10}}>{new Date(event.created_at).toLocaleString("tr-TR")}<small style={{display:"block"}}>{event.created_by?"Yetkili kullanıcı":"Sistem"}</small></span></div>}):<p>Henüz kayıtlı sipariş işlemi yok.</p>}</div></section>
    <section style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:20,marginTop:24}}><AddressCard title="FATURA ADRESİ" address={meta.billing}/><AddressCard title="TESLİMAT ADRESİ" address={meta.shipping_address}/></section>
  </Shell>;
}
