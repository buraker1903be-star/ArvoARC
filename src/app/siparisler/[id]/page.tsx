import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { requireTenant } from "@/lib/tenant";
import { updateFulfillmentDetails, updateOrderStatus , refundOrder } from "./actions";
import { orderStatusLabel, orderStatusOptions, paymentStatusLabel, paymentStatusOptions, sourceLabel } from "@/lib/commerce-labels";

const money=(value:number,currency:string)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:currency||"TRY"}).format(value/100);

type Address={name?:string;address1?:string;address2?:string;city?:string;province?:string;zip?:string;country?:string;phone?:string};
type OrderMeta={discount?:number;coupon_code?:string;refunded_at?:string;refunded_amount?:number;refund_reference?:string;billing?:Address;shipping_address?:Address;payment_method?:string;payment_reference?:string;notes?:string;tags?:string;historical_import?:boolean;shipping_carrier?:string;tracking_number?:string;tracking_url?:string;internal_note?:string};

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
  const canManage=["owner","admin","manager"].includes(membership.role);
  const meta=(order?.metadata??{}) as OrderMeta;
  if(error)throw new Error(error.message);if(itemsError)throw new Error(itemsError.message);if(eventsError)throw new Error(eventsError.message);if(!order)notFound();

  /*
    KDV dilimleri. Bir faturada farklı oranlar bir arada
    bulunabiliyor: giyim %10, kozmetik %20. Fatura mevzuatı her
    oranı ayrı matrah ve vergi satırı olarak göstermeyi
    gerektiriyor.

    Kalem SKU'sundan ürüne ulaşıp oranı okuyoruz.
  */
  const skus=[...new Set((items??[]).map(item=>item.sku).filter(Boolean))];
  const {data:rateRows}=skus.length
    ?await supabase.from("arc_product_variants").select("sku,arc_products(tax_rate)").eq("organization_id",organization.id).in("sku",skus)
    :{data:[]};

  const rateBySku=new Map<string,number>();
  for(const row of (rateRows??[]) as unknown as Array<{sku:string;arc_products:{tax_rate:number|null}|{tax_rate:number|null}[]|null}>){
    const product=Array.isArray(row.arc_products)?row.arc_products[0]:row.arc_products;
    rateBySku.set(row.sku, product?.tax_rate ?? 20);
  }

  /* İndirim payı orantılı düşülür: müşteri indirimli tutarı
     ödedi, matrah da o tutar üzerinden olmalı. */
  const discount=Number(meta.discount??0);
  const gross=(order.subtotal??0)+(order.shipping??0);
  const factor=discount>0&&gross>0?1-discount/gross:1;

  const brackets=new Map<number,{matrah:number;kdv:number}>();
  const addBracket=(rate:number,grossAmount:number)=>{
    const net=Math.round(grossAmount*factor);
    const kdv=Math.round(net-net/(1+rate/100));
    const current=brackets.get(rate)??{matrah:0,kdv:0};
    brackets.set(rate,{matrah:current.matrah+(net-kdv),kdv:current.kdv+kdv});
  };

  for(const item of items??[]) addBracket(rateBySku.get(item.sku)??20,item.total);
  /* Kargo genel orana tabidir. */
  if((order.shipping??0)>0) addBracket(20,order.shipping);

  const bracketList=[...brackets.entries()].sort((a,b)=>a[0]-b[0]);

  /*
    Fatura satırları.

    Her satır kendi indirim payını ve KDV'sini taşıyor. İndirim
    toplam üzerinden orantılı dağıtılıyor: hangi kaleme ait
    olduğu kayıtlı değil.

    Kargo da bir satır: ayrı gösterilmesi fatura düzeninin
    gereği.
  */
  const discountRate=gross>0?discount/gross:0;

  type Line={
    name:string;
    sku:string;
    quantity:number;
    unit:number;
    discountAmount:number;
    netUnit:number;
    rate:number;
    vat:number;
    total:number;
  };

  /*
    Birim fiyatlar KDV HARİÇ gösteriliyor; e-fatura standardı
    böyle. Toplam sütunu KDV dâhil kalıyor — müşterinin ödediği
    tutar o.

    Kayıtlı fiyatlar KDV dâhil olduğu için hariç tutar
    hesaplanıyor: 310,90 dâhil → 259,08 hariç.
  */
  const exVat=(gross:number,rate:number)=>Math.round(gross/(1+rate/100));

  const buildLine=(name:string,sku:string,quantity:number,unit:number,grossTotal:number,rate:number):Line=>{
    const discountAmount=Math.round(grossTotal*discountRate);
    const paid=grossTotal-discountAmount;
    const vat=Math.round(paid-paid/(1+rate/100));
    const netTotal=paid-vat;
    return {
      name,
      sku,
      quantity,
      /* KDV hariç birim fiyat. */
      unit:exVat(unit,rate),
      /* İndirim de hariç tutar üzerinden gösteriliyor. */
      discountAmount:exVat(discountAmount,rate),
      netUnit:quantity>0?Math.round(netTotal/quantity):netTotal,
      rate,
      vat,
      total:paid,
    };
  };

  const lines:Line[]=(items??[]).map(item=>
    buildLine(item.product_name,item.sku,item.quantity,item.unit_price,item.total,rateBySku.get(item.sku)??20)
  );

  if((order.shipping??0)>0){
    lines.push(buildLine("Kargo bedeli","—",1,order.shipping,order.shipping,20));
  }
  return <Shell active="orders" tenantName={organization.name} tenantPlan={organization.plan_code}>
    <section className="ac-bar">
      <div>
        <p style={{marginBottom:"var(--s1)"}}>
          <Link href="/siparisler">← Siparişler</Link>
        </p>
        <h1>{order.order_number}</h1>
        <p>
          {new Date(order.created_at).toLocaleString("tr-TR")} ·{" "}
          {order.customer_name||order.customer_email||"Misafir müşteri"} ·{" "}
          {sourceLabel(order.source)}
        </p>
      </div>
      <div className="ac-bar-actions">
        <em className="ac-tag" data-tone={["cancelled","refunded"].includes(order.status)?"bad":order.payment_status==="paid"?undefined:"warn"}>
          {orderStatusLabel(order.status)} · {paymentStatusLabel(order.payment_status)}
        </em>
      </div>
    </section>

    <div className="ac-stack">

    {/* Fatura ve teslimat bilgileri en başta: siparişi
        hazırlarken ilk bakılan yer burası. */}
    <section className="ac-split-even"><AddressCard title="FATURA ADRESİ" address={meta.billing}/><AddressCard title="TESLİMAT ADRESİ" address={meta.shipping_address}/></section>

    {query.saved&&<section className="ac ac-pad-sm"><strong>{query.saved==="fulfillment"?"Kargo ve operasyon bilgileri kaydedildi.":query.saved==="refund"?"İade tamamlandı.":"Sipariş durumu güncellendi."}</strong></section>}
    {query.error&&<section className="ac ac-pad-sm"><strong>
      {query.error==="not-paid"?"Bu sipariş ödenmediği için iade edilemez."
      :query.error==="already-refunded"?"Bu sipariş zaten iade edilmiş."
      :query.error==="invalid-amount"?"İade tutarı sipariş tutarını aşamaz."
      :query.error==="refund-failed"?"PayTR iade talebini reddetti. Ayrıntı için sunucu günlüklerine bakın."
      :query.error==="refund-recorded-failed"?"İade yapıldı ancak sipariş kaydı güncellenemedi. PayTR panelinden doğrulayın; tekrar iade denemeyin."
      :`İşlem tamamlanamadı: ${query.error}`}
    </strong></section>}

    {/* Sipariş kalemleri tam genişlikte: on sütunlu fatura
        dökümü yan panelle birlikte sığmıyordu. */}
      <section className="ac ac-pad">
        <div className="ac-head"><div><h3>Sipariş kalemleri</h3><p>{items?.length??0} kalem</p></div></div>
        {/*
          Fatura düzeni. Her satırda birim fiyat, indirim, KDV
          oranı ve tutarı ayrı ayrı; fatura keserken doğrudan
          kullanılabilir.
        */}
        <div className="ac-lines">
          <div className="ac-line ac-line-head">
            <span>ÜRÜN / SKU</span>
            <span>ADET</span>
            <span>BİRİM (HARİÇ)</span>
            <span>İND. %</span>
            <span>İNDİRİM</span>
            <span>İND. BİRİM (HARİÇ)</span>
            <span>KDV %</span>
            <span>KDV</span>
            <span>TOPLAM (DÂHİL)</span>
          </div>

          {lines.map((line,index)=>(
            <div className="ac-line" key={`${line.sku}-${index}`}>
              <span>
                <b>{line.name}</b>
                <span className="ac-dim">{line.sku}</span>
              </span>
              <span>{line.quantity}</span>
              <span>{money(line.unit,order.currency)}</span>
              <span>{discountRate>0?`%${(discountRate*100).toFixed(1)}`:"—"}</span>
              <span>{line.discountAmount>0?`−${money(line.discountAmount,order.currency)}`:"—"}</span>
              <span>{money(line.netUnit,order.currency)}</span>
              <span>%{line.rate}</span>
              <span>{money(line.vat,order.currency)}</span>
              <span><b>{money(line.total,order.currency)}</b></span>
            </div>
          ))}
        </div>

        <div className="ac-totals">
          {bracketList.map(([rate,v])=>(
            <span key={rate}>%{rate} matrah <b>{money(v.matrah,order.currency)}</b></span>
          ))}
          {bracketList.map(([rate,v])=>(
            <span key={`k${rate}`}>KDV %{rate} <b>{money(v.kdv,order.currency)}</b></span>
          ))}
          <strong>Toplam tutar <b>{money(order.total,order.currency)}</b></strong>
          <span>Ödeme türü <b>{meta.payment_method??"Kredi kartı"}</b></span>
          {meta.coupon_code?<span>İndirim kodu <b>{meta.coupon_code}</b></span>:null}
        </div>
      </section>

    {/*
      Yönetim ve kargo yan yana iki kart. Öncesinde tek sütunda
      alt alta dizilmişti ve takip numarası girmek için en aşağı
      inmek gerekiyordu.
    */}
    <section className="ac-split-even">
      <div className="ac ac-pad">
        <div className="ac-head"><div><h3>Sipariş durumu</h3><p>Akıştaki konumu ve ödeme durumu.</p></div></div>
        {canManage?<form action={updateOrderStatus} style={{display:"grid",gap:"var(--s3)"}}><input type="hidden" name="order_id" value={order.id}/><label>Sipariş durumu<select name="status" defaultValue={order.status} className="ac-input">{orderStatusOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Ödeme durumu<select name="payment_status" defaultValue={order.payment_status} className="ac-input">{paymentStatusOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button className="ac-btn ac-btn-primary" type="submit">Durumu kaydet</button></form>:<p>{orderStatusLabel(order.status)} · {paymentStatusLabel(order.payment_status)}</p>}

        <hr className="ac-divider"/>
        <div>
          <p style={{margin:0,fontSize:"var(--t-micro)",fontWeight:700,letterSpacing:".12em",color:"var(--c-ink-3)"}}>MÜŞTERİ</p>
          <p style={{margin:"var(--s2) 0 0"}}><b>{order.customer_name||"İsimsiz müşteri"}</b><br/>{order.customer_email||"E-posta yok"}</p>
          {meta.notes&&<p><b>Müşteri notu:</b> {meta.notes}</p>}
        </div>
      </div>

      <div className="ac ac-pad">
        <div className="ac-head"><div><h3>Kargo ve operasyon</h3><p>Takip numarası girildiğinde müşteriye e-posta gider.</p></div></div>
        {canManage?<form action={updateFulfillmentDetails} style={{display:"grid",gap:"var(--s3)"}}><input type="hidden" name="order_id" value={order.id}/><label>Kargo firması<input name="shipping_carrier" defaultValue={meta.shipping_carrier??""} maxLength={100} className="ac-input"/></label><label>Takip numarası<input name="tracking_number" defaultValue={meta.tracking_number??""} maxLength={160} className="ac-input"/></label><label>Takip bağlantısı<input name="tracking_url" type="url" defaultValue={meta.tracking_url??""} placeholder="https://..." className="ac-input"/></label><label>İç operasyon notu<textarea name="internal_note" defaultValue={meta.internal_note??""} maxLength={1000} rows={3} className="ac-input"/></label><button className="ac-btn ac-btn-primary" type="submit">Kargo bilgilerini kaydet</button></form>:<p>{meta.shipping_carrier||"Kargo firması yok"} · {meta.tracking_number||"Takip numarası yok"}</p>}
        {meta.tracking_url&&<p style={{marginTop:"var(--s3)"}}><a href={meta.tracking_url} target="_blank" rel="noreferrer">Kargo takibini aç ↗</a></p>}
      </div>
    </section>

    {/*
      İade. Ayrı bir kartta ve yalnızca ödenmiş siparişte
      görünüyor: parasal işlem, yanlışlıkla tıklanmamalı.
    */}
    {order.payment_status === "paid" && !meta.refunded_at && ["owner","admin"].includes(membership.role) ? (
      <section className="ac ac-pad">
        <div className="ac-head">
          <div>
            <h3>İade</h3>
            <p>Tutar PayTR üzerinden müşterinin kartına iade edilir.</p>
          </div>
        </div>

        <form action={refundOrder} style={{display:"grid",gap:"var(--s3)",maxWidth:360}}>
          <input type="hidden" name="order_id" value={order.id}/>
          <label>
            İade tutarı (₺)
            <input
              name="amount"
              type="number"
              min="0"
              step="0.01"
              max={(order.total/100).toFixed(2)}
              placeholder={`Tamamı: ${(order.total/100).toFixed(2)}`}
              className="ac-input"
            />
          </label>
          <p style={{margin:0,fontSize:"var(--t-sm)",color:"var(--c-ink-3)",lineHeight:1.6}}>
            Boş bırakırsanız siparişin tamamı iade edilir. Bu işlem geri
            alınamaz.
          </p>
          <button className="ac-btn" type="submit" style={{borderColor:"var(--c-bad)",color:"var(--c-bad)"}}>
            İadeyi başlat
          </button>
        </form>
      </section>
    ) : null}

    {meta.refunded_at ? (
      <section className="ac ac-pad-sm">
        <strong>
          İade edildi ·{" "}
          {money(Number(meta.refunded_amount ?? 0), order.currency)} ·{" "}
          {new Date(String(meta.refunded_at)).toLocaleString("tr-TR")}
        </strong>
      </section>
    ) : null}

    <section className="ac ac-pad"><div className="ac-head"><div><h3>İşlem geçmişi</h3><p>Bu siparişte yapılan değişiklikler.</p></div><span>{events?.length??0} kayıt</span></div><div style={{marginTop:16}}>{events?.length?events.map(event=>{const data=(event.event_data??{}) as Record<string,string|null>;const title=event.event_type==="status_updated"?"Sipariş durumu güncellendi":"Kargo bilgileri güncellendi";const detail=event.event_type==="status_updated"?`${orderStatusLabel(data.old_status)} → ${orderStatusLabel(data.new_status)} · Ödeme: ${paymentStatusLabel(data.new_payment_status)}`:`${data.shipping_carrier||"Kargo firması yok"} · ${data.tracking_number||"Takip numarası yok"}`;return <div className="order" key={event.id}><i>✓</i><div><b>{title}</b><small>{detail}</small></div><span style={{textAlign:"right",fontSize:10}}>{new Date(event.created_at).toLocaleString("tr-TR")}<small style={{display:"block"}}>{event.created_by?"Yetkili kullanıcı":"Sistem"}</small></span></div>}):<p>Henüz kayıtlı sipariş işlemi yok.</p>}</div></section>

    </div>
  </Shell>;
}
