export type DiscountRule={
  id:string;
  code:string|null;
  discount_type:"percentage"|"fixed_amount"|"free_shipping";
  value:number;
  minimum_subtotal:number;
  usage_limit:number|null;
  usage_count:number;
  starts_at:string|null;
  ends_at:string|null;
  status:"draft"|"active"|"paused"|"expired";
  combinable:boolean;
};

export type DiscountResult={
  subtotal:number;
  shipping:number;
  orderDiscount:number;
  shippingDiscount:number;
  total:number;
  applied:Array<{id:string;code:string|null;amount:number;type:DiscountRule["discount_type"]}>;
  rejectedCode:boolean;
};

export function calculateDiscounts(input:{
  subtotal:number;
  shipping:number;
  code?:string;
  rules:DiscountRule[];
  now?:Date;
}):DiscountResult{
  const now=input.now??new Date();
  const requestedCode=(input.code??"").trim().toUpperCase();
  const eligible=input.rules.filter(rule=>{
    if(rule.status!=="active"||input.subtotal<rule.minimum_subtotal)return false;
    if(rule.starts_at&&new Date(rule.starts_at)>now)return false;
    if(rule.ends_at&&new Date(rule.ends_at)<=now)return false;
    if(rule.usage_limit!==null&&rule.usage_count>=rule.usage_limit)return false;
    return rule.code===null||rule.code===requestedCode;
  });
  const selectedCoupon=requestedCode?eligible.find(rule=>rule.code===requestedCode):undefined;
  const candidates=eligible.filter(rule=>rule.code===null||rule.id===selectedCoupon?.id);
  const selected=selectedCoupon&&!selectedCoupon.combinable
    ? candidates.filter(rule=>rule.id===selectedCoupon.id||rule.combinable)
    : candidates;

  let remaining=Math.max(0,input.subtotal);
  let orderDiscount=0;
  let shippingDiscount=0;
  const applied:DiscountResult["applied"]=[];

  for(const rule of selected){
    if(rule.discount_type==="free_shipping"){
      const amount=Math.max(0,input.shipping);
      if(amount>0){shippingDiscount=Math.max(shippingDiscount,amount);applied.push({id:rule.id,code:rule.code,amount,type:rule.discount_type});}
      continue;
    }
    const amount=rule.discount_type==="percentage"
      ? Math.round(remaining*rule.value/100)
      : Math.min(remaining,rule.value);
    if(amount<=0)continue;
    remaining-=amount;
    orderDiscount+=amount;
    applied.push({id:rule.id,code:rule.code,amount,type:rule.discount_type});
  }

  return {
    subtotal:Math.max(0,input.subtotal),
    shipping:Math.max(0,input.shipping),
    orderDiscount,
    shippingDiscount,
    total:Math.max(0,input.subtotal-orderDiscount+input.shipping-shippingDiscount),
    applied,
    rejectedCode:Boolean(requestedCode&&!selectedCoupon)
  };
}
