"use client";

import { useState } from "react";
import {
  fiyatDurumu,
  listeYazildi,
  oranYazildi,
  satisYazildi,
  tabanVar,
  type FiyatDurumu,
} from "@/lib/indirim-orani";

/*
  BAĞLI FİYAT ALANLARI: satış ₺ · karşılaştırma ₺ · indirim %

  Öncesinde yalnızca iki alan vardı ve indirim yapmak şuydu: mevcut
  fiyatı bir yere not et, hesap makinesinde %20'sini düş, bulduğunu
  satış alanına yaz, notu karşılaştırma alanına yaz. Üç yüz üründe
  operasyonun kendisi hataya dönüşüyordu — yanlış kopyalanan bir rakam
  vitrine yanlış indirim olarak çıkıyor.

  Oran SAKLANMIYOR, iki fiyattan türetiliyor: ayrı bir sütun olsaydı
  fiyat elle değiştiğinde oran yalan söylerdi. Bu yüzden alanın `name`i
  de yok, sunucuya gitmiyor — sunucu eskisi gibi yalnızca iki fiyatı
  alıyor ve `compare > price` değilse indirimi zaten siliyor.

  Alanların birbirini nasıl güncellediği `@/lib/indirim-orani` içinde
  ve sınanıyor; burada yalnızca durum tutuluyor.
*/
type Baslangic = { fiyat: string; karsilastirma: string };

function useFiyatlar({ fiyat, karsilastirma }: Baslangic) {
  const [durum, setDurum] = useState<FiyatDurumu>(() => fiyatDurumu(fiyat, karsilastirma));
  return {
    ...durum,
    tabanVar: tabanVar(durum),
    satisDegisti: (deger: string) => setDurum((d) => satisYazildi(d, deger)),
    listeDegisti: (deger: string) => setDurum((d) => listeYazildi(d, deger)),
    oranDegisti: (deger: string) => setDurum((d) => oranYazildi(d, deger)),
  };
}

/** Varyant satırındaki üçlü (ızgara alanlarına oturur). */
export function VaryantFiyatlari(baslangic: Baslangic) {
  const f = useFiyatlar(baslangic);
  return (
    <>
      <label className="vl-price">
        <span className="vl-label">Fiyat ₺</span>
        <input
          name="price" type="number" min="0" step="0.01" required
          value={f.satis} onChange={(e) => f.satisDegisti(e.target.value)}
          aria-label="Satış fiyatı"
        />
      </label>
      <label className="vl-compare">
        <span className="vl-label">Karşılaştırma ₺</span>
        <input
          name="compare_at_price" type="number" min="0" step="0.01"
          value={f.liste} onChange={(e) => f.listeDegisti(e.target.value)}
          placeholder="İndirim yok" aria-label="Karşılaştırma fiyatı"
        />
      </label>
      <label className="vl-indirim">
        <span className="vl-label">İndirim %</span>
        <input
          type="number" min="0" max="99.99" step="0.01"
          value={f.oran} onChange={(e) => f.oranDegisti(e.target.value)}
          disabled={!f.tabanVar}
          placeholder={f.tabanVar ? "—" : "Önce fiyat"} aria-label="İndirim oranı yüzde"
          title="Oran yazın: şu anki fiyat karşılaştırma fiyatına taşınır, satış fiyatı indirimli tutara düşer. Alanı boşaltmak indirimi kaldırır."
        />
      </label>
    </>
  );
}

/** Varyant ekleme formlarındaki üçlü (kendi etiketleriyle). */
export function YeniVaryantFiyatlari(baslangic: Baslangic) {
  const f = useFiyatlar(baslangic);
  return (
    <>
      <label>
        Satış fiyatı ₺
        <input
          name="price" type="number" min="0" step="0.01" required className="ac-input"
          value={f.satis} onChange={(e) => f.satisDegisti(e.target.value)}
        />
      </label>
      <label>
        Karşılaştırma fiyatı ₺
        <input
          name="compare_at_price" type="number" min="0" step="0.01" className="ac-input"
          value={f.liste} onChange={(e) => f.listeDegisti(e.target.value)}
          placeholder="İndirim yoksa boş"
        />
      </label>
      <label>
        İndirim %
        <input
          type="number" min="0" max="99.99" step="0.01" className="ac-input"
          value={f.oran} onChange={(e) => f.oranDegisti(e.target.value)}
          disabled={!f.tabanVar}
          placeholder={f.tabanVar ? "—" : "Önce fiyat girin"}
          title="Oran yazın: şu anki fiyat karşılaştırma fiyatına taşınır, satış fiyatı indirimli tutara düşer. Alanı boşaltmak indirimi kaldırır."
        />
      </label>
    </>
  );
}
