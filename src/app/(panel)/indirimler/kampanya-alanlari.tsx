import { DurumSecici } from "@/components/arvo-ui/durum-secici";
import { trIsoToLocal } from "@/lib/tr-time";

/*
  KAMPANYA ALANLARI TEK YERDE (16.10.2026).

  Aynı on bir alan iki yerde yazılıydı: listedeki "Yeni kampanya"
  penceresi ve kampanya detayındaki düzenleme formu. İki kopya, birine
  eklenen alanın ötekinde unutulması demek — nitekim "Hemen aktif et"
  yalnızca oluşturmada, "kişi başı kullanım" ise ikisinde farklı
  sırada duruyordu.

  ÜÇ GRUP. On bir kutu tek yığın hâlinde bir duvar oluşturuyordu;
  sorular aslında üç tane: ne veriyor, hangi koşulla, ne zaman.
*/

export type KampanyaDegerleri = {
  name: string;
  code: string | null;
  discount_type: string;
  value: number;
  minimum_subtotal: number;
  usage_limit: number | null;
  per_customer_limit: number | null;
  starts_at: string | null;
  ends_at: string | null;
  combinable: boolean;
};

const TURLER = [
  { deger: "percentage", etiket: "Sepette yüzde indirim" },
  { deger: "fixed_amount", etiket: "Sepette sabit tutar indirimi" },
  { deger: "free_shipping", etiket: "Ücretsiz kargo" },
];

/** Kuruşu Türkçe yazıma çevirir; forma girilen değer de aynı biçimde okunuyor. */
const liraYazisi = (kurus: number) => (kurus / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 });

export function KampanyaAlanlari({ deger, yeniMi }: { deger?: KampanyaDegerleri; yeniMi: boolean }) {
  const tur = deger?.discount_type ?? "percentage";
  return (
    <div className="form-gruplari">
      <section>
        <h4>Ne veriyor</h4>
        <div className="discount-form-grid">
          <label className="wide">Kampanya adı
            <input name="name" required maxLength={160} defaultValue={deger?.name} placeholder="Örn. 2.000 TL Üzeri Ücretsiz Kargo" />
          </label>
          {/* Tarayıcının <select>'i yerine panelin seçicisi: aynı liste,
              aynı klavye, kutu biçiminde (durum-secici). */}
          <label>İndirim türü
            <DurumSecici name="discount_type" etiket="İndirim türü" bicim="alan" gonder={false} deger={tur} secenekler={TURLER} />
          </label>
          <label>İndirim değeri
            <input
              name="value"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              defaultValue={deger ? (tur === "fixed_amount" ? liraYazisi(deger.value) : String(deger.value)) : "10"}
            />
            <small>Yüzde için 10, sabit indirim için TL tutarı. Ücretsiz kargoda 0.</small>
          </label>
        </div>
      </section>

      <section>
        <h4>Hangi koşulla</h4>
        <div className="discount-form-grid">
          <label>Minimum sepet tutarı (₺)
            <input name="minimum_subtotal" type="text" inputMode="decimal" autoComplete="off" defaultValue={deger ? liraYazisi(deger.minimum_subtotal) : "0,00"} />
          </label>
          <label>Kupon kodu
            <input name="code" maxLength={40} defaultValue={deger?.code ?? ""} placeholder="Boş: otomatik uygulanır" />
          </label>
          <label>Toplam kullanım limiti
            <input name="usage_limit" type="number" min="1" step="1" defaultValue={deger?.usage_limit ?? ""} placeholder="Limitsiz" />
          </label>
          <label>Kişi başı kullanım
            <input name="per_customer_limit" type="number" min="1" step="1" defaultValue={deger?.per_customer_limit ?? ""} placeholder="Limitsiz" />
          </label>
        </div>
      </section>

      <section>
        <h4>Ne zaman</h4>
        <div className="discount-form-grid">
          <label>Başlangıç (Türkiye saati)
            <input name="starts_at" type="datetime-local" defaultValue={trIsoToLocal(deger?.starts_at)} />
          </label>
          <label>Bitiş (Türkiye saati)
            <input name="ends_at" type="datetime-local" defaultValue={trIsoToLocal(deger?.ends_at)} />
          </label>
          {/*
            Onay kutuları KENDİ SATIRINDA: ızgaranın içinde tarih
            kutularının yanına sıkışıyor ve uzun etiket iki satıra
            kırılıyordu.
          */}
          <div className="kampanya-onaylar">
            {yeniMi ? (
              <label className="check-inline"><input name="active" type="checkbox" defaultChecked /><span>Hemen aktif et</span></label>
            ) : null}
            <label className="check-inline"><input name="combinable" type="checkbox" defaultChecked={deger?.combinable ?? false} /><span>Diğer indirimlerle birleştirilebilir</span></label>
          </div>
        </div>
      </section>
    </div>
  );
}
