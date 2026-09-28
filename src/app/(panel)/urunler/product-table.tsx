"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ListeBos, ListeBosEylem } from "@/components/panel/liste-bos";
import { Notice } from "@/components/panel/notice";
import { bulkSetStatus, topluDurumSonuc } from "./actions";

export type ProductRow = {
  id: string;
  name: string;
  image: string | null;
  initials: string;
  meta: string;
  price: string;
  compare: string;
  discount: number;
  cost: string | null;
  profit: string | null;
  loss: boolean;
  stock: number;
  stockTone?: string;
  status: string;
  statusLabel: string;
  /** Zamanlanmış yayın varsa rozetin başlığında okunuyor. */
  statusHint?: string;
  statusTone?: string;
  bestSeller: boolean;
};

const BULK = [
  { key: "active", label: "Yayınla" },
  { key: "draft", label: "Taslağa al" },
  { key: "archived", label: "Arşivle" },
];

/*
  Katalog listesi. Tedarikçiden gelen ürünleri tek tek açıp
  yayınlamak yerine seçip topluca yayınlanabilir / arşivlenebilir.
  Satırın tamamı ürün düzenleyicisine gider.
*/
/* total kaldırıldı: yalnızca liste üstündeki ipucu bandında kullanılıyordu,
   o bant sayfa alt başlığına taşındı ve sayı zaten orada yazıyor. */
export function ProductTable({ rows, canManage, back, katalogBos, children }: { rows: ProductRow[]; canManage: boolean; back: string; katalogBos: boolean; children?: React.ReactNode }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const chosen = rows.filter((row) => selected.has(row.id));
  const allChecked = rows.length > 0 && chosen.length === rows.length;
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [sonuc, setSonuc] = useState<{ tur: "hata" | "basari"; metin: string } | null>(null);
  const [calisiyor, basla] = useTransition();

  const uygula = (idler: string[], durum: string) => {
    setSonuc(null);
    basla(async () => {
      const cevap = await topluDurumSonuc(idler, durum);
      /* Hata da başarı da SÖYLENİYOR: yönlendirme kalktığı için çerezli
         şerit okunmuyor, sessiz kalmak "işlem oldu mu" sorusu bırakırdı. */
      if (cevap.hata) setSonuc({ tur: "hata", metin: cevap.hata });
      else if (cevap.basari) setSonuc({ tur: "basari", metin: cevap.basari });
      /*
        SEÇİM TEMİZLENİYOR — ama yalnızca işlem başarılıysa. Durumu
        değişen ürünler mevcut filtreden çıkabiliyor, yani seçimi
        tutmak var olmayan satırlara işaret etmek olurdu. Hata
        durumunda seçim korunuyor: kullanıcı yeniden denemek isterse
        kırk kayıttan seçtiklerini tekrar bulmak zorunda kalmasın.
      */
      if (!cevap.hata) setSelected(new Set());
    });
  };

  return (
    <section className="ac table list-table product-list" data-manage={canManage ? "" : undefined}>
      {/*
        Liste üstünde ne başlık ne ipucu bandı var. Başlık zaten
        kaldırılmıştı; ipucu bandının da 56px tuttuğunu
        scripts/olc-yogunluk.mjs ölçtü — bir kez okunan bir cümle
        için, her açılışta. Cümle sayfa alt başlığına taşındı.
      */}

      {/* Yerinde işlem sonucu: liste yönlendirmediği için çerezli şerit okunmuyor. */}
      {sonuc ? (
        <div className="list-sonuc">
          <Notice tone={sonuc.tur === "hata" ? "error" : "success"} title={sonuc.tur === "hata" ? "İşlem tamamlanamadı" : "İşlem tamamlandı"}>
            {sonuc.metin}
          </Notice>
        </div>
      ) : null}

      {canManage && chosen.length > 0 ? (
        /*
          FORM DURUYOR, yalnızca gönderimi kesiliyor.

          Eskiden toplu işlem tam bir gezinme başlatıyordu: kaydırma
          yeri ve seçim gidiyor, liste baştan çiziliyordu. Artık eylem
          sonucu döndürüyor (topluDurumSonuc) ve içindeki
          revalidatePath veriyi yeniliyor; kullanıcı yerinde kalıyor.

          Hangi düğmeye basıldığını submitter söylüyor: durum
          düğmelerin value'sunda ve type="button" yapmak JavaScript
          kapalıyken toplu işlemi tamamen bozardı.
        */
        <form
          action={bulkSetStatus}
          className="list-bulk-bar"
          onSubmit={(olay) => {
            const basilan = (olay.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            const durum = basilan?.value;
            if (!durum) return; /* durum okunamadıysa forma dokunma: normal gönderim çalışsın */
            olay.preventDefault();
            uygula(chosen.map((row) => row.id), durum);
          }}
        >
          <input type="hidden" name="back" value={back} />
          {chosen.map((row) => <input key={row.id} type="hidden" name="product_id" value={row.id} />)}
          <b>{chosen.length} ürün seçildi</b>
          <span className="list-bulk-actions">
            {BULK.map((step) => {
              const eligible = chosen.filter((row) => row.status !== step.key).length;
              return (
                <button key={step.key} className="ac-btn" type="submit" name="status" value={step.key} disabled={!eligible || calisiyor}>
                  {step.label}
                  <span className="ac-count">{eligible}</span>
                </button>
              );
            })}
            <button className="ac-btn" type="button" onClick={() => setSelected(new Set())}>Seçimi temizle</button>
          </span>
        </form>
      ) : null}

      {rows.length ? (
        <>
          <div className="list-row th">
            {canManage ? (
              <label className="list-check"><input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((row) => row.id)))} aria-label="Bu sayfadaki tüm ürünleri seç" /></label>
            ) : null}
            <span className="pl-thumb" />
            <span className="pl-name">ÜRÜN</span>
            <span className="pl-price">FİYAT</span>
            <span className="pl-margin">ALIŞ / KÂR</span>
            <span className="pl-stock">STOK</span>
            <span className="pl-status">DURUM</span>
          </div>
          {rows.map((row) => (
            <div className={selected.has(row.id) ? "list-row is-selected" : "list-row"} key={row.id}>
              {canManage ? (
                <label className="list-check"><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} aria-label={`${row.name} ürününü seç`} /></label>
              ) : null}
              {/* Küçük görsel: benzer adlı ürünleri ayırt etmek için. */}
              <span className="pl-thumb">
                {row.image ? <Image src={row.image} alt="" width={88} height={88} sizes="44px" /> : <b>{row.initials}</b>}
              </span>
              {/*
                title ŞART: satır metinleri üç nokta ile kırpılıyor
                (panel.css, .list-row b/small) ve uzun ürün adı kaydı
                açmadan okunamıyordu. Kırpılan her metnin tam hâli
                imlecin altında duruyor.
              */}
              <span className="pl-name">
                <Link prefetch={false} className="list-row-link" href={`/urunler/${row.id}`}><b title={row.name}>{row.name}</b></Link>
                <small title={row.meta}>{row.meta}</small>
              </span>
              <span className="pl-price">
                <b>{row.price}</b>
                {row.compare ? <small><s>{row.compare}</s>{row.discount ? ` · −%${row.discount}` : ""}</small> : null}
              </span>
              {/* Alış ve kâr yalnızca tedarikçi ürünlerinde: kendi
                  ürünlerimizde maliyet kayıtlı değil, uydurma kâr
                  göstermek yanıltıcı olur. */}
              <span className="pl-margin">
                {row.cost ? <><small>Alış {row.cost}</small><b className="profit" data-loss={row.loss ? "" : undefined}>{row.profit}</b></> : <small>—</small>}
              </span>
              <span className="pl-stock"><em className="stock-pill" data-tone={row.stockTone}>{row.stock.toLocaleString("tr-TR")} adet</em></span>
              <span className="pl-status">
                {/* Zamanlama rozete İŞARET olarak iniyor: yeni bir sütun
                    açmak listeden satır çalardı, saat imi 0px maliyetli. */}
                <em className="ac-tag" data-tone={row.statusHint?"warn":row.statusTone} title={row.statusHint}>{row.statusLabel}{row.statusHint?" ⏱":""}</em>
                {row.bestSeller ? <small>Çok satan</small> : null}
              </span>
            </div>
          ))}
        </>
      ) : (
        /*
          İKİ DURUM AYRI. Katalog gerçekten boşken "filtreleri
          değiştirin" demek, ortada olmayan bir filtreyi aratmaktı —
          yeni mağazanın gördüğü ilk ekran buydu.
        */
        katalogBos ? (
          <ListeBos
            baslik="Kataloğunuz henüz boş."
            aciklama="Ürünleri Shopify CSV'sinden toplu aktarabilir, tedarikçi kataloğundan çekebilir ya da tek tek ekleyebilirsiniz."
          >
            {canManage ? (
              <>
                <ListeBosEylem href="/veri-aktarimi" birincil>Ürün aktar</ListeBosEylem>
                <ListeBosEylem href="/tedarikci">Tedarikçiden çek</ListeBosEylem>
              </>
            ) : null}
          </ListeBos>
        ) : (
          <ListeBos
            baslik="Bu ölçütlere uygun ürün yok."
            aciklama="Ürün adı, SKU, marka, tür ve etiketlerde arama yapılır. Aramayı veya filtreleri değiştirin."
          >
            <ListeBosEylem href={back}>Filtreleri temizle</ListeBosEylem>
          </ListeBos>
        )
      )}
      {children}
    </section>
  );
}
