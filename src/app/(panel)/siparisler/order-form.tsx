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

  return <form action={createOrder} className="order-manual-form">
    <div className="order-manual-grid">
      <label>Müşteri adı<input name="customer_name" className="ac-input" autoComplete="off" /></label>
      <label>E-posta<input name="customer_email" type="email" className="ac-input" autoComplete="off" /></label>
    </div>

    <div className="order-manual-lines">
      {lines.map((line, index) => <div key={line.key} className="order-manual-line">
        <label>Ürün / varyant {index + 1}
          <select name="variant_id" required value={line.variantId} className="ac-input" onChange={(event) => setLines((current) => current.map((item) => item.key === line.key ? {...item, variantId:event.target.value} : item))}>
            <option value="" disabled>Seçin</option>
            {variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}
          </select>
        </label>
        <label>Adet<input name="quantity" type="number" min="1" step="1" required value={line.quantity} className="ac-input" onChange={(event) => setLines((current) => current.map((item) => item.key === line.key ? {...item, quantity:Number(event.target.value)} : item))} /></label>
        <button type="button" className="ac-btn" onClick={() => removeLine(line.key)} disabled={lines.length === 1} aria-label={`${index + 1}. kalemi sil`}>Sil</button>
      </div>)}
    </div>

    <div className="order-manual-actions">
      <button type="button" className="ac-btn" onClick={addLine}>+ Kalem ekle</button>
      <button type="submit" className="ac-btn ac-btn-primary">Sipariş oluştur</button>
    </div>
  </form>;
}
