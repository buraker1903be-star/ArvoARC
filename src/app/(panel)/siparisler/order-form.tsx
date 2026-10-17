"use client";

import { useState } from "react";
import { DurumSecici } from "@/components/arvo-ui/durum-secici";
import { liraYaz } from "@/lib/lira";
import { MANUEL_ODEME_TURLERI } from "@/lib/payment-method";
import { createOrder } from "./actions";
import "./siparis-manuel.css";

/*
  MANUEL SİPARİŞ FORMU (16.10.2026 yeniden yazıldı).

  Eskisi tarayıcının kendi alanlarıyla duruyordu: 243 seçenekli bir
  <select> ("Seçin"), çift oklu bir sayı kutusu, kendi satırında
  dolaşan bir "Sil" düğmesi ve altta yan yana iki düğme. En önemli
  eksik ŞUYDU: operasyoncu telefondaki müşteriye tutarı söyleyemiyordu —
  sipariş oluşana kadar hiçbir yerde fiyat yoktu.

  Artık: panelin seçicisi (aranabilir, fiyatlı), satır ve sipariş
  toplamı canlı, altta kaydet çubuğu. Toplam hesabı arc_create_order
  ile birebir aynı kuralı izliyor (fiyat × adet; vergi ve kargo yok),
  yoksa penceredeki tutar ile oluşan sipariş birbirini tutmazdı.

  Gönderim ENGELLENİYORSA sebebi çubukta yazılı: eskiden eksik satırla
  gönderilince sunucudan "Sipariş bilgileri eksik" dönüyordu ve hangi
  satır olduğu belli olmuyordu.
*/

export type VariantOption = {
  id: string;
  /** "Ürün adı · SKU" */
  label: string;
  /** Kuruş (AGENTS.md: para kuruş cinsinden tamsayı). */
  price: number;
  stock: number;
  /** Stoksuz satış açık: LR ürünlerinde stok hep 0, bu olağan. */
  backorder: boolean;
};

type Line = { key: number; variantId: string; adet: string };

const YENI_SATIR = (key: number): Line => ({ key, variantId: "", adet: "1" });

export function OrderForm({ variants }: { variants: VariantOption[] }) {
  const [lines, setLines] = useState<Line[]>([YENI_SATIR(1)]);

  const varyant = new Map(variants.map((v) => [v.id, v]));
  /* Boş seçenek listenin başında: seçicinin "değer yok" hâli de bir
     seçenek olmalı, yoksa ilk ürün seçilmiş gibi görünürdü. */
  const secenekler = [
    { deger: "", etiket: "Ürün seçin" },
    ...variants.map((v) => ({ deger: v.id, etiket: `${v.label} · ${liraYaz(v.price)}` })),
  ];

  const yaz = (key: number, degisim: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...degisim } : line)));

  const adetSayisi = (deger: string) => {
    const sayi = Number(deger);
    return Number.isInteger(sayi) && sayi > 0 ? sayi : 0;
  };
  const satirTutari = (line: Line) => (varyant.get(line.variantId)?.price ?? 0) * adetSayisi(line.adet);
  const toplam = lines.reduce((t, line) => t + satirTutari(line), 0);

  /* Stok yetmiyorsa fonksiyon zaten reddediyor ("Insufficient stock");
     pencere bunu GÖNDERMEDEN söylüyor. Stoksuz satış açık varyantlarda
     stok ölçüt değil. */
  const stokYetmez = (line: Line) => {
    const v = varyant.get(line.variantId);
    return Boolean(v && !v.backorder && adetSayisi(line.adet) > v.stock);
  };

  const eksikSatir = lines.findIndex((line) => !line.variantId || adetSayisi(line.adet) === 0);
  const stokluSatir = lines.findIndex(stokYetmez);
  const engel =
    eksikSatir >= 0
      ? `${eksikSatir + 1}. kalemde ürün ve adet eksik.`
      : stokluSatir >= 0
        ? `${stokluSatir + 1}. kalemde stok yetmiyor.`
        : null;

  return <form action={createOrder} className="siparis-manuel form-gruplari">
    <section>
      <h4>Müşteri</h4>
      <div className="siparis-manuel-musteri">
        <label>Müşteri adı
          <input name="customer_name" autoComplete="off" placeholder="Telefondaki kişinin adı" />
        </label>
        <label>E-posta
          <input name="customer_email" type="email" autoComplete="off" placeholder="Varsa" />
          <small>İkisi de boş bırakılabilir; elden satışta ad yazmak yeterli.</small>
        </label>
        {/*
          ÖDEME TÜRÜ (17.10.2026). Panelden açılan sipariş metadata'ya
          hiçbir şey yazmıyordu ve ekran hepsini "Kredi kartı"
          gösteriyordu — telefonla/elden alınan siparişte çoğu zaman
          yanlış. Varsayılan NAKİT: elden alınan para bu, ayrıca
          kendiliğinden hiçbir şey tetiklemiyor; havale seçilirse
          ödeme bekleyen havale akışı (onay, 72 saat uyarısı) açılır.
        */}
        <label>Ödeme türü
          <DurumSecici
            name="payment_method"
            etiket="Ödeme türü"
            bicim="alan"
            gonder={false}
            deger={MANUEL_ODEME_TURLERI[0].deger}
            secenekler={MANUEL_ODEME_TURLERI.map((t) => ({ deger: t.deger, etiket: t.etiket }))}
          />
          <small>Sipariş detayında ve iade kararında bu yazıyor.</small>
        </label>
      </div>
    </section>

    <section>
      <h4>Kalemler</h4>
      {/* Başlıklar bir kez: her satırda "Ürün / varyant 1", "Adet"
          yazması üç kalemde altı etiket demekti. Satırların kendi
          etiketleri DURUYOR, yalnızca geniş ekranda gizli (ekran
          okuyucu ve telefon onları görüyor). */}
      <div className="siparis-manuel-basliklar" aria-hidden="true">
        <span>Ürün / varyant</span><span>Adet</span><span>Tutar</span><span />
      </div>
      <div className="siparis-manuel-kalemler">
        {lines.map((line, sira) => {
          const v = varyant.get(line.variantId);
          return <div key={line.key} className="siparis-manuel-satir" data-uyari={stokYetmez(line) ? "" : undefined}>
            <label>
              <span className="satir-etiket">{sira + 1}. ürün / varyant</span>
              <DurumSecici
                name="variant_id"
                etiket={`${sira + 1}. kalemin ürünü`}
                bicim="alan"
                aranabilir
                gonder={false}
                deger={line.variantId}
                secenekler={secenekler}
                onSec={(deger) => yaz(line.key, { variantId: deger })}
              />
            </label>
            <label>
              <span className="satir-etiket">Adet</span>
              <input
                name="quantity"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                required
                aria-label={`${sira + 1}. kalemin adedi`}
                value={line.adet}
                onChange={(olay) => yaz(line.key, { adet: olay.target.value })}
              />
            </label>
            <div className="siparis-manuel-tutar">
              <b>{liraYaz(satirTutari(line))}</b>
              {v && !v.backorder ? <small>stok {v.stock.toLocaleString("tr-TR")}</small> : null}
            </div>
            <button
              type="button"
              className="panel-secondary dugme-kucuk"
              onClick={() => setLines((current) => (current.length === 1 ? current : current.filter((item) => item.key !== line.key)))}
              disabled={lines.length === 1}
              aria-label={`${sira + 1}. kalemi sil`}
            >Sil</button>
          </div>;
        })}
      </div>
      <button type="button" className="panel-secondary dugme-kucuk siparis-manuel-ekle" onClick={() => setLines((current) => [...current, YENI_SATIR(Date.now())])}>
        + Kalem ekle
      </button>
    </section>

    {/* Kaydet çubuğu: çekmecenin ortak şeridi (panel-drawer.css). */}
    <div className="panel-form-actions">
      <span>
        {engel ?? <>{lines.length} kalem · Toplam <b>{liraYaz(toplam)}</b></>}
      </span>
      <button type="submit" className="panel-primary" disabled={Boolean(engel)}>Sipariş oluştur</button>
    </div>
  </form>;
}
