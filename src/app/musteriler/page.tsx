import Link from "next/link";
import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";

const money=new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"});
type Customer={key:string;name:string;email:string;orders:number;spent:number;lastOrderAt:string;lastOrderId:string};

export default async function Customers({searchParams}:{searchParams:Promise<{q?:string}>}){
  const query=await searchParams;const {supabase,organization}=await requireTenant();
  const {data:orders,error}=await supabase.from("arc_orders").select("id,customer_name,customer_email,total,currency,created_at,status").eq("organization_id",organization.id).order("created_at",{ascending:false});
  if(error)throw new Error(error.message);

  const grouped=new Map<string,Customer>();
  for(const order of orders??[]){
    const email=(order.customer_email??"").trim().toLocaleLowerCase("tr-TR");
    const name=(order.customer_name??"").trim()||"İsimsiz müşteri";
    const key=email||`name:${name.toLocaleLowerCase("tr-TR")}`;
    const existing=grouped.get(key);
    if(existing){existing.orders++;existing.spent+=order.total;if(new Date(order.created_at)>new Date(existing.lastOrderAt)){existing.lastOrderAt=order.created_at;existing.lastOrderId=order.id;}}
    else grouped.set(key,{key,name,email,orders:1,spent:order.total,lastOrderAt:order.created_at,lastOrderId:order.id});
  }
  const search=(query.q??"").trim().toLocaleLowerCase("tr-TR");
  const customers=[...grouped.values()].filter(customer=>!search||customer.name.toLocaleLowerCase("tr-TR").includes(search)||customer.email.includes(search)).sort((a,b)=>b.spent-a.spent);
  const repeatCustomers=customers.filter(customer=>customer.orders>1).length;
  const totalRevenue=customers.reduce((sum,customer)=>sum+customer.spent,0);

  return <Shell active="customers" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="subhead"><div><small>MÜŞTERİLER · CANLI</small><h2>Müşteriler</h2><p>Siparişlerden otomatik oluşturulan müşteri görünümü. Ayrı ve mükerrer bir müşteri veritabanı oluşturmaz.</p></div></section>
    <section className="metrics"><article><span>TOPLAM MÜŞTERİ</span><strong>{grouped.size}</strong><small>Sipariş veren</small></article><article><span>TEKRARLAYAN</span><strong>{repeatCustomers}</strong><small>Birden fazla sipariş</small></article><article><span>TOPLAM SİPARİŞ</span><strong>{orders?.length??0}</strong><small>Tüm dönem</small></article><article><span>TOPLAM CİRO</span><strong>{money.format(totalRevenue/100)}</strong><small>Tüm dönem</small></article></section>
    <section className="card" style={{padding:20,marginBottom:20}}><form style={{display:"flex",gap:10}}><input name="q" defaultValue={query.q??""} placeholder="Ad veya e-posta ile ara" style={{flex:1,padding:12}}/><button type="submit" style={{padding:"12px 18px"}}>Ara</button>{query.q&&<Link href="/musteriler" style={{padding:12}}>Temizle</Link>}</form></section>
    <section className="card table"><div className="head"><div><small>MÜŞTERİ LİSTESİ</small><h3>{customers.length} müşteri</h3></div><span>Harcama tutarına göre</span></div>
      <div className="row th"><span>MÜŞTERİ</span><span>SİPARİŞ</span><span>TOPLAM HARCAMA</span><span>SON SİPARİŞ</span><span>DETAY</span></div>
      {customers.length?customers.map(customer=><div className="row" key={customer.key}><span><i className="swatch">{customer.name.split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase()}</i><span><b style={{display:"block"}}>{customer.name}</b><small>{customer.email||"E-posta yok"}</small></span></span><span>{customer.orders}</span><span>{money.format(customer.spent/100)}</span><span>{new Date(customer.lastOrderAt).toLocaleDateString("tr-TR")}</span><span><Link href={`/musteriler/${encodeURIComponent(customer.key)}`}>Profili aç →</Link></span></div>):<div style={{padding:24}}><strong>Arama kriterine uygun müşteri bulunamadı.</strong></div>}
    </section>
  </Shell>;
}
