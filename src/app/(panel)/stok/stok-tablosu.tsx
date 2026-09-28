"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Notice } from "@/components/panel/notice";
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

  return (
    <section className="ac table list-table stock-list" data-manage={canManage ? "" : undefined}>
      {/* Yerinde işlem sonucu: liste yönlendirmediği için çerezli şerit okunmuyor. */}
      {sonuc ? (
        <div className="list-sonuc">
          <Notice tone={sonuc.tur === "hata" ? "error" : "success"} title={sonuc.tur === "hata" ? "İşlem tamamlanamadı" : "İşlem tamamlandı"}>
            {sonuc.metin}
          </Notice>
        </div>
      ) : null}

      {satirlar.length ? (
        <>
          <div className="list-row th">
            <span className="sl-name">ÜRÜN</span>
            <span className="sl-sku">SKU</span>
            <span className="sl-qty">STOK</span>
            <span className="sl-policy">POLİTİKA</span>
            {canManage ? <span className="sl-adjust">HAREKET</span> : null}
          </div>
          {satirlar.map((satir) => {
            const stok = iyimser[satir.id] ?? satir.stok;
            return (
              <div className="list-row" data-islenen={islenen.has(satir.id) ? "" : undefined} key={satir.id}>
                {/* title: satır metni üç nokta ile kırpılıyor, uzun ürün adı
                    kaydı açmadan okunamıyordu. */}
                <span className="sl-name">
                  <Link prefetch={false} className="list-row-link" href={`/urunler/${satir.urunId}`}>
                    <b title={satir.urunAdi}>{satir.urunAdi}</b>
                  </Link>
                  <small>{satir.varyantAdi}</small>
                </span>
                <span className="sl-sku">{satir.sku}</span>
                <span className="sl-qty">
                  <em className="stock-pill" data-tone={ton(stok, dusukStokEsigi)}>{stok.toLocaleString("tr-TR")}</em>
                </span>
                <span className="sl-policy">{satir.stoksuzSatis ? "Stoksuz satış açık" : "Stok zorunlu"}</span>
                {canManage ? (
                  /*
                    FORM DURUYOR, gönderimi kesiliyor: düğmeleri
                    type="button" yapmak JavaScript kapalıyken stok
                    hareketini tamamen bozardı. Yön submitter'dan
                    okunuyor; okunamazsa forma dokunulmuyor ve normal
                    gönderim çalışıyor.
                  */
                  <form
                    action={adjustInventory}
                    className="sl-adjust"
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
                    <input name="quantity" type="number" min="1" step="1" defaultValue="1" required className="ac-input" aria-label={`${satir.sku} hareket miktarı`} />
                    <button className="ac-btn" type="submit" name="direction" value="in" title="Stok girişi" disabled={islenen.has(satir.id)}>+ Giriş</button>
                    <button className="ac-btn" type="submit" name="direction" value="out" title="Stok çıkışı" disabled={islenen.has(satir.id)}>− Çıkış</button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </>
      ) : (
        children
      )}
    </section>
  );
}
