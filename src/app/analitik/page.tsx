import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { orderStatusOptions } from "@/lib/commerce-labels";

const money=new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",maximumFractionDigits:0});
const monthLabel=new Intl.DateTimeFormat("tr-TR",{month:"short",year:"2-digit"});

export default async function Analytics(){
  const {supabase,organization}=await requireTenant();
  const [{data:orders,error:ordersError},{data:items,error:itemsError}]=await Promise.all([
    supabase.from("arc_orders").select("id,status,payment_status,total,currency,created_at").eq("organization_id",organization.id).order("created_at"),
    supabase.from("arc_order_items").select("order_id,product_name,sku,quantity,total").eq("organization_id",organization.id)
  ]);
  if(ordersError)throw new Error(ordersError.message);if(itemsError)throw new Error(itemsError.message);
  const allOrders=orders??[];const completed=allOrders.filter(order=>!["cancelled","refunded"].includes(order.status));
  const revenue=completed.reduce((sum,order)=>sum+order.total,0);const average=completed.length?Math.round(revenue/completed.length):0;
  const refunded=allOrders.filter(order=>order.status==="refunded"||order.payment_status==="refunded").reduce((sum,order)=>sum+order.total,0);
  const orderIds=new Set(completed.map(order=>order.id));

  const now=new Date();
  const currentStart=new Date(now);currentStart.setDate(currentStart.getDate()-30);
  const previousStart=new Date(now);previousStart.setDate(previousStart.getDate()-60);
  const currentOrders=completed.filter(order=>new Date(order.created_at)>=currentStart);
  const previousOrders=completed.filter(order=>{const date=new Date(order.created_at);return date>=previousStart&&date<currentStart;});
  const currentRevenue=currentOrders.reduce((sum,order)=>sum+order.total,0);
  const previousRevenue=previousOrders.reduce((sum,order)=>sum+order.total,0);
  const currentAverage=currentOrders.length?Math.round(currentRevenue/currentOrders.length):0;
  const previousAverage=previousOrders.length?Math.round(previousRevenue/previousOrders.length):0;
  const change=(current:number,previous:number)=>previous?Math.round((current-previous)/previous*100):(current?100:0);
  const comparisons=[
    {label:"Satış",value:money.format(currentRevenue/100),change:change(currentRevenue,previousRevenue)},
    {label:"Sipariş",value:String(currentOrders.length),change:change(currentOrders.length,previousOrders.length)},
    {label:"Ortalama sepet",value:money.format(currentAverage/100),change:change(currentAverage,previousAverage)},
  ];
const months=Array.from({length:6},(_,index)=>{const date=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-(5-index),1));return {key:`${date.getUTCFullYear()}-${date.getUTCMonth()}`,date,revenue:0,orders:0};});
  for(const order of completed){const d=new Date(order.created_at);const key=`${d.getUTCFullYear()}-${d.getUTCMonth()}`;const month=months.find(item=>item.key===key);if(month){month.revenue+=order.total;month.orders++;}}
  const maxMonth=Math.max(...months.map(month=>month.revenue),1);

  const products=new Map<string,{name:string;sku:string;quantity:number;revenue:number}>();
  for(const item of items??[]){if(!orderIds.has(item.order_id))continue;const key=item.sku||item.product_name;const current=products.get(key);if(current){current.quantity+=item.quantity;current.revenue+=item.total;}else products.set(key,{name:item.product_name,sku:item.sku,quantity:item.quantity,revenue:item.total});}
  const topProducts=[...products.values()].sort((a,b)=>b.revenue-a.revenue).slice(0,10);
  const maxProduct=Math.max(...topProducts.map(item=>item.revenue),1);
  const statusCounts=new Map<string,number>();for(const order of allOrders)statusCounts.set(order.status,(statusCounts.get(order.status)??0)+1);

  return <Shell active="analytics" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small>RAPORLAMA · CANLI</small><h2>Satış Analitiği</h2><p>Gerçek siparişlerden hesaplanan satış, ürün ve sipariş performansı.</p></div></section>
    <section className="metrics"><article><span>NET CİRO</span><strong>{money.format(revenue/100)}</strong><small>İptal ve iadeler hariç</small></article><article><span>SİPARİŞ</span><strong>{completed.length}</strong><small>Geçerli sipariş</small></article><article><span>ORTALAMA SEPET</span><strong>{money.format(average/100)}</strong><small>Sipariş başına</small></article><article><span>İADE</span><strong>{money.format(refunded/100)}</strong><small>İade edilen siparişler</small></article></section>
    <section className="period-comparison" aria-label="Son 30 gün karşılaştırması"><div className="period-comparison-title"><div><small>DÖNEM KARŞILAŞTIRMASI</small><h3>Son 30 gün</h3></div><span>Önceki 30 güne göre</span></div><div className="period-comparison-grid">{comparisons.map(item=><article key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small className={item.change>0?"up":item.change<0?"down":"neutral"}>{item.change>0?"↑":item.change<0?"↓":"→"} %{Math.abs(item.change)}</small></article>)}</div></section>
    <section className="grid">
      <article className="card"><div className="head"><div><small>SON 6 AY</small><h3>Aylık satış</h3></div><span>{money.format(revenue/100)}</span></div><div className="bars" style={{height:230}}>{months.map(month=><i key={month.key} title={`${monthLabel.format(month.date)} · ${money.format(month.revenue/100)} · ${month.orders} sipariş`} style={{height:`${Math.max(5,Math.round(month.revenue/maxMonth*100))}%`}}/>)}</div><div className="labels">{months.map(month=><span key={month.key}>{monthLabel.format(month.date)}</span>)}</div></article>
      <article className="card"><div className="head"><div><small>DAĞILIM</small><h3>Sipariş durumları</h3></div><span>{allOrders.length} toplam</span></div><div style={{display:"grid",gap:12,marginTop:20}}>{orderStatusOptions.map(([status,label])=>{const count=statusCounts.get(status)??0;return <div key={status}><span style={{display:"flex",justifyContent:"space-between",fontSize:12}}><b>{label}</b><strong>{count}</strong></span><div style={{height:8,background:"#eef0eb",marginTop:7}}><i style={{display:"block",height:"100%",width:`${allOrders.length?count/allOrders.length*100:0}%`,background:"var(--green)"}}/></div></div>})}</div></article>
    </section>
    <section className="card" style={{marginTop:20}}><div className="head"><div><small>ÜRÜN PERFORMANSI</small><h3>En çok satan ürünler</h3></div><span>Ciroya göre ilk 10</span></div>
      <div style={{display:"grid",gap:14,marginTop:18}}>{topProducts.length?topProducts.map((product,index)=><div key={product.sku||product.name} style={{display:"grid",gridTemplateColumns:"32px minmax(180px,1.5fr) minmax(180px,2fr) 80px 120px",gap:12,alignItems:"center"}}><b>{index+1}</b><span><b style={{display:"block"}}>{product.name}</b><small>{product.sku}</small></span><div style={{height:9,background:"#eef0eb"}}><i style={{display:"block",height:"100%",width:`${product.revenue/maxProduct*100}%`,background:"var(--navy)"}}/></div><span>{product.quantity} adet</span><strong>{money.format(product.revenue/100)}</strong></div>):<p>Analiz için henüz sipariş kalemi bulunmuyor.</p>}</div>
    </section>
  </Shell>;
}
