"use client";

import { useState } from "react";
import { createOrder } from "./actions";

type VariantOption = {
  id: string;
  label: string;
};

type Line = {
  key: number;
  variantId: string;
  quantity: number;
};

export function OrderForm({ variants }: { variants: VariantOption[] }) {
  const [lines, setLines] = useState<Line[]>([{ key: 1, variantId: "", quantity: 1 }]);

  function addLine() {
    setLines((current) => [...current, { key: Date.now(), variantId: "", quantity: 1 }]);
  }

  function removeLine(key: number) {
    setLines((current) => current.length === 1 ? current : current.filter((line) => line.key !== key));
  }

  return <form action={createOrder} style={{display:"grid",gap:16,marginTop:20}}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:14}}>
      <label>Müşteri adı<input name="customer_name" style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label>
      <label>E-posta<input name="customer_email" type="email" style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label>
    </div>

    <div style={{display:"grid",gap:10}}>
      {lines.map((line, index) => <div key={line.key} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 120px auto",gap:10,alignItems:"end"}}>
        <label>Ürün / varyant {index + 1}
          <select name="variant_id" required value={line.variantId} onChange={(event) => setLines((current) => current.map((item) => item.key === line.key ? {...item, variantId:event.target.value} : item))} style={{display:"block",width:"100%",padding:12,marginTop:6}}>
            <option value="" disabled>Seçin</option>
            {variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}
          </select>
        </label>
        <label>Adet<input name="quantity" type="number" min="1" step="1" required value={line.quantity} onChange={(event) => setLines((current) => current.map((item) => item.key === line.key ? {...item, quantity:Number(event.target.value)} : item))} style={{display:"block",width:"100%",padding:12,marginTop:6}} /></label>
        <button type="button" onClick={() => removeLine(line.key)} disabled={lines.length === 1} style={{padding:12}}>Sil</button>
      </div>)}
    </div>

    <div style={{display:"flex",gap:10}}>
      <button type="button" onClick={addLine} style={{padding:12}}>+ Kalem ekle</button>
      <button type="submit" style={{padding:12}}>Sipariş oluştur</button>
    </div>
  </form>;
}
