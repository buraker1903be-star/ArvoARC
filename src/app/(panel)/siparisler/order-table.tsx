"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { bulkStatus, durumIlerletSonuc, quickStatus, siparisleriSil, topluDurumSonuc } from "./actions";
import { ConfirmSubmit } from "@/components/panel/confirm-submit";
import { ListeBos, ListeBosEylem } from "@/components/panel/liste-bos";
import { Notice } from "@/components/panel/notice";

export type OrderRow = {
  id: string;
  number: string;
  customer: string;
  email: string;
  source: string;
  total: string;
  date: string;
  badge: { label: string; tone?: string };
  next: { key: string; label: string } | null;
  /** Havale siparişi: ödeme panelden onaylanır. */
  transfer?: boolean;
  /*
    KÂR. Maliyeti eksik, iptal edilmiş ya da iadeli siparişte null:
    yarım bir sayı, sayı olmamasından daha yanıltıcı olurdu
    (lib/siparis-kari.ts).
  */
  kar: { tutar: string; oran: number; eksi: boolean } | null;
  /*
    KARGO. Gönderilerden türetiliyor, ayrı sütunda tutulmuyor; sipariş
    detayındaki özetle aynı fonksiyondan geliyor.
  */
  kargo: { durum: "yok" | "kismi" | "tamam" | "teslim"; sorunlu: boolean };
};

/*
  KARGO SÜTUNUNUN METNİ. "yok" ayrı bir renk almıyor: kargoya
  verilmemiş olmak yeni siparişin olağan hâli, uyarı değil.
*/
const KARGO_ETIKETI: Record<OrderRow["kargo"]["durum"], string> = {
  yok: "Verilmedi",
  kismi: "Kısmen",
  tamam: "Kargoda",
  teslim: "Teslim edildi",
};

const BULK_STEPS = [
  { key: "confirmed", label: "Onayla" },
  { key: "processing", label: "Hazırlanıyor" },
  { key: "fulfilled", label: "Kargoya ver" },
];

/*
  Sipariş listesi ve toplu işlem.

  Günde onlarca sipariş geldiğinde her birini tek tek "Onayla →"
  ile ilerletmek sayfayı onlarca kez yeniliyordu. Seçilen
  siparişler tek istekte bir sonraki adıma geçer; adıma uygun
  olmayanlar (ör. zaten hazırlanan) sunucuda atlanır ve sayısı
  bildirilir.

  Satırın tamamı detay bağlantısı (ilk hücredeki <a> kaplamayla):
  orta tık ve "yeni sekmede aç" çalışır.
*/
export function OrderTable({ rows, canManage, canDelete, back, siparisYok, children }: { rows: OrderRow[]; canManage: boolean; canDelete: boolean; back: string; siparisYok: boolean; children?: React.ReactNode }) {
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
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(rows.map((row) => row.id)));

  /*
    DURUM İLERLETME YERİNDE OLUYOR.

    Eskiden her satırda bir <form action={quickStatus}> vardı ve eylem
    geri YÖNLENDİRİYORDU: kaydırma yeri gidiyor, seçim sıfırlanıyor,
    liste baştan çiziliyordu. Kırk kayıtlı bir listede üç siparişi
    ilerletmek üç kez başa dönmek demekti.

    Artık eylem sonucu döndürüyor (durumIlerletSonuc) ve içindeki
    revalidatePath veriyi yeniliyor; kullanıcı yerinde kalıyor.

    İyimser durum olarak satırın YENİ ETİKETİ UYDURULMUYOR. Bir sonraki
    adımın rozet metni ve tonu sunucu kuralından geliyor (nextOrderStep
    + durum etiketleri); istemcide tahmin etmek o eşlemenin ikinci bir
    kopyası olurdu ve yanlış etiket göstermek, geç güncellemekten kötü.
    Onun yerine satır "işleniyor" hâline geçiyor: düğme kilitleniyor,
    gerçek rozet veri gelince yerine oturuyor.
  */
  const [islenen, setIslenen] = useState<ReadonlySet<string>>(() => new Set());
  const [sonuc, setSonuc] = useState<{ tur: "hata" | "basari"; metin: string } | null>(null);
  const [, basla] = useTransition();

  const [topluCalisiyor, topluBasla] = useTransition();

  /*
    Toplu işlem de yerinde. Seçim YALNIZCA BAŞARIDA temizleniyor:
    durumu değişen siparişler mevcut filtreden çıkabiliyor, yani seçimi
    tutmak var olmayan satırlara işaret etmek olurdu. Hatada seçim
    korunuyor ki kullanıcı kırk kayıttan seçtiklerini tekrar bulmasın.
  */
  const topluUygula = (idler: string[], durum: string) => {
    setSonuc(null);
    topluBasla(async () => {
      const cevap = await topluDurumSonuc(idler, durum);
      if (cevap.hata) setSonuc({ tur: "hata", metin: cevap.hata });
      else if (cevap.basari) setSonuc({ tur: "basari", metin: cevap.basari });
      if (!cevap.hata) setSelected(new Set());
    });
  };

  const ilerlet = (id: string, durum: string) => {
    setIslenen((önce) => new Set(önce).add(id));
    setSonuc(null);
    basla(async () => {
      const cevap = await durumIlerletSonuc(id, durum);
      setIslenen((önce) => {
        const sonra = new Set(önce);
        sonra.delete(id);
        return sonra;
      });
      /* Hata da başarı da SÖYLENİYOR: yönlendirme kalktığı için çerezli
         şerit okunmuyor, sessiz kalmak "bir şey oldu mu" sorusu bırakırdı. */
      if (cevap.hata) setSonuc({ tur: "hata", metin: cevap.hata });
      else if (cevap.basari) setSonuc({ tur: "basari", metin: cevap.basari });
    });
  };

  /*
    list-table  paylaşılan liste davranışı (yapışkan başlık, satır
                kaplaması, toplu işlem çubuğu, sayfalama)
    order-table bu modülün ızgarası (orders.css)

    Ayrım bilerek: ızgarayı paylaşılan sınıfa bağlamak, .list-table'ı
    kullanan bir sonraki modüle sipariş sütunlarını sızdırırdı.
  */
  return (
    <section className="ac table list-table order-table" data-manage={canManage ? "" : undefined}>
      {/*
        Liste üstünde ne başlık ne ipucu bandı var.

        Başlık 27.09.2026'da kaldırılmıştı (sayfa başlığı zaten
        "Siparişler" diyordu; blok 82px yiyordu). İpucu bandı tek
        satıra inip kalmıştı ve scripts/olc-yogunluk.mjs onun da 56px
        tuttuğunu ölçtü — bir kez okunan bir cümle için her listede,
        her açılışta. Cümle sayfa alt başlığına taşındı: bilgi duruyor,
        yer açıldı.
      */}

      {/*
        Yerinde işlem sonucu. Sayfa üstündeki çerezli şerit yalnızca
        yönlendirmeli eylemlerde okunuyor; liste artık yönlendirmediği
        için sonucu burada söylüyor. Listenin BAŞINDA, çünkü kullanıcı
        düğmeye bastıktan sonra gözü satırda kalıyor ve sayfanın en
        üstüne çıkmış bir mesajı görmüyor.
      */}
      {sonuc ? (
        <div className="list-sonuc">
          <Notice tone={sonuc.tur === "hata" ? "error" : "success"} title={sonuc.tur === "hata" ? "İşlem tamamlanamadı" : "İşlem tamamlandı"}>
            {sonuc.metin}
          </Notice>
        </div>
      ) : null}

      {canManage && chosen.length > 0 ? (
        /*
          FORM DURUYOR, gönderimi kesiliyor: type="button" yapmak
          JavaScript kapalıyken toplu işlemi tamamen bozardı. Hangi
          düğmeye basıldığı submitter'dan okunuyor (durum value'da);
          okunamazsa forma dokunulmuyor ve normal gönderim çalışıyor.
        */
        <form
          action={bulkStatus}
          className="list-bulk-bar"
          onSubmit={(olay) => {
            const durum = ((olay.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
            if (!durum) return;
            olay.preventDefault();
            topluUygula(chosen.map((row) => row.id), durum);
          }}
        >
          <input type="hidden" name="back" value={back} />
          {chosen.map((row) => <input key={row.id} type="hidden" name="order_id" value={row.id} />)}
          <b>{chosen.length} sipariş seçildi</b>
          <span className="list-bulk-actions">
            {BULK_STEPS.map((step) => {
              const eligible = chosen.filter((row) => row.next?.key === step.key).length;
              return (
                <button key={step.key} className="ac-btn" type="submit" name="status" value={step.key} disabled={!eligible || topluCalisiyor} title={eligible ? `${eligible} siparişe uygulanır` : "Seçilenlerde bu adıma uygun sipariş yok"}>
                  {step.label}
                  <span className="ac-count">{eligible}</span>
                </button>
              );
            })}
            <button className="ac-btn" type="button" onClick={() => setSelected(new Set())}>Seçimi temizle</button>
          </span>
        </form>
      ) : null}

      {/*
        SİLME AYRI FORMDA. Durum düğmeleriyle aynı formda olsaydı yanlış
        düğmeye basmak kayıtları yok ederdi; ayrıca silme yetkisi daha
        dar (owner/admin), durum değiştirme manager'a da açık.

        Onay penceresi kaç siparişin silineceğini ve geri alınamayacağını
        yazıyor — sipariş numaralarıyla, çünkü "3 sipariş" yazan bir
        uyarı hangi üçü olduğunu söylemiyor.
      */}
      {canDelete && chosen.length > 0 ? (
        <form action={siparisleriSil} className="list-bulk-bar order-bulk-danger">
          <input type="hidden" name="back" value={back} />
          {chosen.map((row) => <input key={row.id} type="hidden" name="order_id" value={row.id} />)}
          <b>Seçilenleri kalıcı olarak sil</b>
          <span className="list-bulk-actions">
            <ConfirmSubmit
              className="ac-btn ac-btn-danger"
              message={`${chosen.length} sipariş KALICI olarak silinecek:\n\n${chosen.slice(0, 10).map((row) => row.number).join("\n")}${chosen.length > 10 ? `\n… ve ${chosen.length - 10} sipariş daha` : ""}\n\nKalemleri, gönderileri ve işlem geçmişi de silinir. Açık siparişlerin stoğu iade edilir. Bu işlem geri alınamaz.`}
            >
              {chosen.length} siparişi sil
            </ConfirmSubmit>
          </span>
        </form>
      ) : null}

      {rows.length ? (
        <>
          <div className="list-row th">
            {canManage ? (
              <label className="list-check"><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Bu sayfadaki tüm siparişleri seç" /></label>
            ) : null}
            <span className="order-cell-main">SİPARİŞ</span>
            <span className="order-cell-customer">MÜŞTERİ</span>
            <span className="order-amount">TUTAR</span>
            <span className="order-profit">KÂR</span>
            <span className="order-status">OPERASYON</span>
            <span className="order-shipping">KARGO</span>
            {canManage ? <span className="order-action" /> : null}
          </div>
          {rows.map((row) => (
            /* data-islenen: satır beklerken soluklaşıyor — düğmedeki
               "Gönderiliyor…" tek başına satırın ucunda kalıyor ve göz
               listenin ortasındayken fark edilmiyor. */
            <div
              className={selected.has(row.id) ? "list-row is-selected" : "list-row"}
              data-islenen={islenen.has(row.id) ? "" : undefined}
              key={row.id}
            >
              {canManage ? (
                <label className="list-check"><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} aria-label={`${row.number} siparişini seç`} /></label>
              ) : null}
              {/*
                title ŞART: satır metinleri üç nokta ile kırpılıyor
                (panel.css, .list-row b/small) ve uzun müşteri adı
                kaydı açmadan okunamıyordu.
              */}
              <span className="order-cell-main">
                <Link prefetch={false} className="list-row-link" href={`/siparisler/${row.id}`}><b title={row.number}>{row.number}</b></Link>
                <small>{row.date}</small>
              </span>
              <span className="order-cell-customer">
                <b title={row.customer}>{row.customer}</b>
                {/*
                  Kaynak ve havale etiketi müşterinin altına indi:
                  kendi sütununda 110px yer kaplıyordu ve satırda
                  sorulan soru "kim, ne kadar, ne durumda" — kaynak
                  ancak ayrım gerektiğinde bakılan bir ayrıntı.
                */}
                <small>
                  {row.source}
                  {row.transfer ? <em className="order-transfer-tag">Havale</em> : null}
                </small>
              </span>
              <span className="order-amount">{row.total}</span>
              <span className="order-profit">
                {row.kar ? (
                  <>
                    <b data-eksi={row.kar.eksi ? "" : undefined}>{row.kar.tutar}</b>
                    <small>%{row.kar.oran.toLocaleString("tr-TR")}</small>
                  </>
                ) : (
                  /* Sebep başlıkta: maliyet eksik mi, sipariş kapalı mı. */
                  <b className="is-empty" title="Maliyeti eksik ya da sipariş kapandı (iptal / iade)">—</b>
                )}
              </span>
              <span className="order-status"><em className="ac-tag" data-tone={row.badge.tone}>{row.badge.label}</em></span>
              <span className="order-shipping">
                {/*
                  Teslim edilmiş sipariş en güçlü işareti alıyor: iş
                  bitti demek. "Kargoda" sakin kalıyor — henüz
                  izlenmesi gereken bir şey.
                */}
                <em className="ac-tag" data-tone={row.kargo.sorunlu ? "bad" : row.kargo.durum === "teslim" ? "good" : row.kargo.durum === "kismi" ? "warn" : undefined}>
                  {row.kargo.sorunlu ? "Sorunlu" : KARGO_ETIKETI[row.kargo.durum]}
                </em>
              </span>
              {canManage ? (
                <span className="order-action">
                  {row.next ? (
                    /*
                      FORM DURUYOR, yalnızca gönderimi kesiliyor.

                      Düğmeyi type="button" yapmak JavaScript kapalıyken
                      onu işlevsiz bırakırdı; önceden form POST'uydu ve
                      çalışıyordu. Şimdi JS varsa preventDefault ile
                      yerinde işleniyor, yoksa form normal gönderilip
                      quickStatus'un yönlendirmeli yolundan geçiyor.
                    */
                    <form
                      action={quickStatus}
                      onSubmit={(olay) => {
                        olay.preventDefault();
                        ilerlet(row.id, row.next!.key);
                      }}
                    >
                      <input type="hidden" name="order_id" value={row.id} />
                      <input type="hidden" name="status" value={row.next.key} />
                      <input type="hidden" name="back" value={back} />
                      <button type="submit" className="row-action" disabled={islenen.has(row.id)}>
                        {islenen.has(row.id) ? "Gönderiliyor…" : `${row.next.label} →`}
                      </button>
                    </form>
                  ) : null}
                </span>
              ) : null}
            </div>
          ))}
        </>
      ) : (
        /*
          Hiç sipariş almamış mağazaya "filtreyi değiştirin" demek,
          ortada olmayan bir filtreyi aratmaktı.
        */
        siparisYok ? (
          <ListeBos
            baslik="Henüz sipariş yok."
            aciklama="Vitrinden ilk sipariş geldiğinde burada görünür. Shopify'daki eski siparişlerinizi şimdi aktarabilirsiniz."
          >
            <ListeBosEylem href="/veri-aktarimi" birincil>Eski siparişleri aktar</ListeBosEylem>
          </ListeBos>
        ) : (
          <ListeBos
            baslik="Bu ölçütlere uygun sipariş yok."
            aciklama="Filtreyi veya dönemi değiştirin. Sipariş numarası, müşteri adı ve e-postada arama yapılır."
          >
            <ListeBosEylem href={back}>Filtreleri temizle</ListeBosEylem>
          </ListeBos>
        )
      )}
      {children}
    </section>
  );
}
