"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { KNot } from "@/components/arvo-ui/k-ui";
import { MobilSatir } from "@/components/arvo-ui/mobil-satir";
import { rozetTonu } from "@/lib/rozet-tonu";
import "@/components/arvo-ui/liste-ek.css";
import { adjustInventory, stokHareketiSonuc } from "./actions";

/*
  STOK LİSTESİ.

  Sayfadan ayrıldı çünkü satır içi "+ Giriş / − Çıkış" her tıklamada tam
  bir gezinme başlatıyordu: kaydırma yeri gidiyor, liste baştan
  çiziliyordu. Stok düzeltmesi SERİ yapılan bir iş — sayımdan sonra on
  varyantı tek tek girmek on kez başa dönmek demekti; panelin en çok
  tekrar edilen eylemi buydu.

  Sayfa (sunucu bileşeni) veriyi okuyup buraya düz satırlar geçiyor;
  yetki kararı da orada verilip taşınıyor. Bu bileşen yalnızca çizim ve
  etkileşim yapıyor, veritabanına dokunmuyor.
*/

export type StokSatiri = {
  id: string;
  urunId: string;
  urunAdi: string;
  varyantAdi: string;
  sku: string;
  stok: number;
  stoksuzSatis: boolean;
};

/** Adet rozetinin tonu; eşik mağaza ayarından geliyor. */
const ton = (stok: number, esik: number) =>
  stok < 0 ? "bad" : stok === 0 ? "warn" : stok <= esik ? "warn" : undefined;

export function StokTablosu({
  satirlar,
  canManage,
  back,
  dusukStokEsigi,
  children,
}: {
  satirlar: StokSatiri[];
  canManage: boolean;
  back: string;
  dusukStokEsigi: number;
  children?: React.ReactNode;
}) {
  const [sonuc, setSonuc] = useState<{ tur: "hata" | "basari"; metin: string } | null>(null);
  const [islenen, setIslenen] = useState<ReadonlySet<string>>(() => new Set());
  /*
    İYİMSER STOK. Sipariş durumunda yeni etiketi uydurmamıştım çünkü
    eşleme sunucu kuralıydı; burada durum farklı: yeni adet ESKİ ± MİKTAR,
    yani aritmetik. Uydurma değil, hesap.

    Yine de son söz veritabanında (kısıt, eşzamanlı hareket): eylem
    gerçek adedi döndürüyor ve satır ona oturuyor. Hata olursa iyimser
    değer atılıyor.
  */
  const [iyimser, setIyimser] = useState<Record<string, number>>({});
  const [, basla] = useTransition();

  const hareket = (satir: StokSatiri, yon: "in" | "out", miktar: number) => {
    if (!Number.isInteger(miktar) || miktar <= 0) return;
    const oncesi = iyimser[satir.id] ?? satir.stok;
    setSonuc(null);
    setIslenen((önce) => new Set(önce).add(satir.id));
    setIyimser((önce) => ({ ...önce, [satir.id]: oncesi + (yon === "out" ? -miktar : miktar) }));

    basla(async () => {
      const cevap = await stokHareketiSonuc(satir.id, yon, miktar);
      setIslenen((önce) => {
        const sonra = new Set(önce);
        sonra.delete(satir.id);
        return sonra;
      });
      if (cevap.hata) {
        /* Hatada iyimser değer ATILIYOR: yanlış bir adedi ekranda
           bırakmak, stok ekranında en pahalı hata. */
        setIyimser((önce) => {
          const sonra = { ...önce };
          delete sonra[satir.id];
          return sonra;
        });
        setSonuc({ tur: "hata", metin: cevap.hata });
        return;
      }
      if (typeof cevap.yeniStok === "number") {
        setIyimser((önce) => ({ ...önce, [satir.id]: cevap.yeniStok! }));
      }
      if (cevap.basari) setSonuc({ tur: "basari", metin: cevap.basari });
    });
  };

  /*
    GÖRÜNÜM ArvoOS'un liste tablosu (16.10.2026). Satırdan giriş/çıkış
    formu tablonun içinde ve satır bağlantısının ÜSTÜNDE (liste-ek.css):
    kutuya yazmak ya da düğmeye basmak ürünü açmasın.
  */
  return (
    <>
      {/* Yerinde işlem sonucu: liste yönlendirmediği için kabuktaki balon okunmuyor. */}
      {sonuc ? <KNot ton={sonuc.tur === "hata" ? "tehlike" : "basari"}>{sonuc.metin}</KNot> : null}

      {satirlar.length ? (
        <div className="talep-tablo">
          <table className="crm-data-table stok-tablo" data-cols="stok">
            <thead>
              <tr>
                <th>Ürün</th>
                <th>SKU</th>
                <th className="crm-col-amount">Stok</th>
                <th>Politika</th>
                {canManage ? <th className="liste-eylem">Hareket</th> : null}
              </tr>
            </thead>
            <tbody>
              {satirlar.map((satir) => {
                const stok = iyimser[satir.id] ?? satir.stok;
                const stokTonu = rozetTonu(ton(stok, dusukStokEsigi) ?? "good");
                return (
                  <tr key={satir.id} data-islenen={islenen.has(satir.id) ? "" : undefined}>
                    <td data-label="Ürün">
                      <Link prefetch={false} className="crm-row-link crm-cell-main" href={`/urunler/${satir.urunId}`} title={satir.urunAdi}>{satir.urunAdi}</Link>
                      <small className="crm-cell-sub">{satir.varyantAdi}</small>
                    </td>
                    <td className="crm-table-mono" data-label="SKU">{satir.sku}</td>
                    <td className="crm-col-amount" data-label="Stok"><span className="status-pill" data-tone={stokTonu}>{stok.toLocaleString("tr-TR")}</span></td>
                    <td data-label="Politika"><span className="crm-cell-sub">{satir.stoksuzSatis ? "Stoksuz satış açık" : "Stok zorunlu"}</span></td>
                    {canManage ? (
                      <td className="liste-eylem">
                        {/*
                          FORM DURUYOR, gönderimi kesiliyor: düğmeleri
                          type="button" yapmak JavaScript kapalıyken stok
                          hareketini tamamen bozardı. Yön submitter'dan okunuyor.
                        */}
                        <form
                          action={adjustInventory}
                          className="stok-hareket"
                          onSubmit={(olay) => {
                            const yon = ((olay.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
                            if (yon !== "in" && yon !== "out") return;
                            const form = olay.currentTarget;
                            const miktar = Number(new FormData(form).get("quantity") ?? 0);
                            if (!Number.isInteger(miktar) || miktar <= 0) return;
                            olay.preventDefault();
                            hareket(satir, yon, miktar);
                          }}
                        >
                          <input type="hidden" name="variant_id" value={satir.id} />
                          <input type="hidden" name="back" value={back} />
                          <input name="quantity" type="number" min="1" step="1" defaultValue="1" required aria-label={`${satir.sku} hareket miktarı`} />
                          <button className="panel-secondary" type="submit" name="direction" value="in" title="Stok girişi" disabled={islenen.has(satir.id)}>+ Giriş</button>
                          <button className="panel-secondary" type="submit" name="direction" value="out" title="Stok çıkışı" disabled={islenen.has(satir.id)}>− Çıkış</button>
                        </form>
                      </td>
                    ) : null}
                    <MobilSatir
                      href={`/urunler/${satir.urunId}`}
                      baslik={satir.urunAdi}
                      durum={{ etiket: `${stok.toLocaleString("tr-TR")} adet`, ton: stokTonu }}
                      alt={[satir.varyantAdi, satir.sku]}
                      isaretler={[satir.stoksuzSatis ? { metin: "Stoksuz satış açık", ton: "bilgi" } : null]}
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </>
  );
}
