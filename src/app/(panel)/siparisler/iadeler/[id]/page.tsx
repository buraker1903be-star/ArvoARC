import Link from "next/link";
import { notFound } from "next/navigation";
import { kimlikMi } from "@/lib/kimlik";
import { requireTenant } from "@/lib/tenant";
import { calculateRefund } from "@/lib/refund";
import { isBankTransfer } from "@/lib/payment-method";
import { formatPersonName } from "@/lib/format-name";
import { rozetTonu } from "@/lib/rozet-tonu";
import { orderBadge } from "@/lib/commerce-labels";
import { iadeTedarikcileri, iadeYonu, type GonderiEslesme, type SiparisKalemiEslesme } from "@/lib/iade-yonlendirme";
import { KNot } from "@/components/arvo-ui/k-ui";
import { ConfirmSubmit } from "@/components/panel/confirm-submit";
import { resolveReturn } from "../actions";
import { iadeRozeti } from "@/lib/iade-durumu";
import "@/components/arvo-ui/k-ui";
import "@/components/arvo-ui/crm.css";
import "@/components/arvo-ui/kayit-detay.css";
import "../iadeler.css";

/*
  İADE TALEBİ DETAYI (16.10.2026).

  Karar eskiden LİSTEDE veriliyordu: her talep kartının içinde bir form,
  elli kart alt alta. Üç sorun vardı. (1) Para iadesi geri alınamayan
  bir işlem ve kaydırırken yanlış kartın düğmesine basmak çok kolaydı.
  (2) Karar için gereken bilgi (hangi paketten çıktı, hangi tedarikçiye
  dönecek, daha önce ne kadar iade edilmiş) karta sığmıyordu. (3) Liste
  sipariş listesinin kalıbına geçti; orada da karar detayda veriliyor.

  Sayfa siparişin DETAYIYLA aynı iskelet: üstte durum, solda müşteri ve
  sipariş, sağda kalemler ve karar.
*/

const money = (kurus: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(kurus / 100);
const when = (deger: string) =>
  new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }).format(new Date(deger));

type Kalem = { name?: string; sku?: string; quantity?: number; total?: number };

/* Render dışında: bileşen içinde saf olmayan çağrı yapılmasın (sipariş
   listesi ve detayıyla aynı kalıp; lint react-hooks/purity uyguluyor). */
function simdi() {
  return Date.now();
}

export default async function IadeDetayi({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  /* Bozuk/kırpılmış kimlik "kayıt yok"tur: Postgres uuid olmayan değeri
     22P02 ile reddediyor ve sayfa okuma hatasını fırlattığı için çökme
     ekranı çıkıyordu (lib/kimlik). */
  if (!kimlikMi(id)) notFound();
  const { supabase, organization, membership } = await requireTenant();
  const canResolve = ["owner", "admin"].includes(membership.role);

  const { data: talep, error } = await supabase
    .from("arc_return_requests")
    .select("id,order_id,items,reason,note,status,status_note,refund_amount,refund_reference,created_at,resolved_at")
    .eq("organization_id", organization.id)
    .eq("id", id)
    .maybeSingle();
  /* Okunamayan talep "yok" DEĞİL: hatayı 404'e çevirmek, var olan bir
     talebin silindiğini düşündürür. */
  if (error) throw new Error("İade talebi okunamadı: " + error.message);
  if (!talep) notFound();

  const { data: siparis, error: siparisHatasi } = await supabase
    .from("arc_orders")
    .select("id,order_number,status,payment_status,total,shipping,currency,customer_name,customer_email,metadata,created_at")
    .eq("organization_id", organization.id)
    .eq("id", talep.order_id)
    .maybeSingle();
  if (siparisHatasi) throw new Error("Talebin siparişi okunamadı: " + siparisHatasi.message);

  const [{ data: siparisKalemleri }, { data: gonderiSatirlari }] = await Promise.all([
    supabase.from("arc_order_items").select("id,order_id,sku,product_name,quantity")
      .eq("organization_id", organization.id).eq("order_id", talep.order_id),
    supabase.from("arc_shipments").select("id,order_id,sequence,status,carrier_name,tracking_number,arc_shipment_items(order_item_id)")
      .eq("organization_id", organization.id).eq("order_id", talep.order_id),
  ]);

  /* Tedarikçi sipariş kaleminde saklı değil, varyanttan geliyor. */
  const skular = [...new Set(((siparisKalemleri ?? []) as Array<{ sku: string | null }>).map((k) => k.sku).filter((x): x is string => Boolean(x)))];
  const { data: varyantlar } = skular.length
    ? await supabase.from("arc_product_variants").select("sku,supplier").eq("organization_id", organization.id).in("sku", skular)
    : { data: [] };
  const tedarikciBySku = new Map(((varyantlar ?? []) as Array<{ sku: string; supplier: string | null }>).map((v) => [v.sku, v.supplier]));

  const kalemEslesmeleri: SiparisKalemiEslesme[] = ((siparisKalemleri ?? []) as Array<{ id: string; sku: string | null }>)
    .map((kalem) => ({ id: kalem.id, sku: kalem.sku, tedarikci: kalem.sku ? tedarikciBySku.get(kalem.sku) ?? null : null }));
  const gonderiEslesmeleri: GonderiEslesme[] = ((gonderiSatirlari ?? []) as Array<{ id: string; sequence: number; status: string; carrier_name: string | null; tracking_number: string | null; arc_shipment_items: { order_item_id: string }[] | null }>)
    .map((satir) => ({
      id: satir.id, sequence: satir.sequence, status: satir.status,
      carrier_name: satir.carrier_name, tracking_number: satir.tracking_number,
      kalemIdleri: (satir.arc_shipment_items ?? []).map((k) => k.order_item_id),
    }));

  /* `items` jsonb ve müşterinin tarayıcısından gelen listeyi taşıyor;
     dizi değilse boş sayılıyor, yoksa `.reduce` sayfayı çökertir. */
  const kalemler = (Array.isArray(talep.items) ? talep.items : []) as Kalem[];
  const kalemToplami = kalemler.reduce((toplam, kalem) => toplam + Number(kalem.total ?? 0), 0);
  /* Tutar sunucudakiyle AYNI fonksiyondan: ekranda yazan ile gönderilen ayrışmasın. */
  const hesap = calculateRefund({
    itemsTotal: kalemToplami,
    orderTotal: siparis?.total ?? 0,
    shipping: siparis?.shipping,
    orderStatus: siparis?.status,
  });
  /* Kalem sırası korunuyor: satırlar ve yönler aynı dizinle eşleşiyor. */
  const yonler = kalemler.map((kalem) => iadeYonu(kalem.sku, kalemEslesmeleri, gonderiEslesmeleri));
  const tedarikciler = iadeTedarikcileri(yonler);

  const meta = (siparis?.metadata ?? {}) as Record<string, unknown>;
  /* Aynı siparişe birden çok talep olabilir; iade edilen tutar birikir. */
  const onceIade = Math.max(0, Number(meta.refunded_amount ?? 0) || 0);
  const kalan = Math.max(0, (siparis?.total ?? 0) - onceIade);
  const havale = isBankTransfer(meta);

  const rozet = iadeRozeti(talep.status);
  const adres = `/siparisler/iadeler/${talep.id}`;
  const musteri = formatPersonName(siparis?.customer_name) || siparis?.customer_email || "Misafir müşteri";
  const bekliyor = talep.status === "beklemede";
  const urunBekleniyor = talep.status === "onaylandi";
  const bekleyenSaat = bekliyor || urunBekleniyor
    ? Math.max(0, Math.floor((simdi() - Date.parse(talep.created_at)) / 3_600_000))
    : null;

  return (
    <main className="crm-page-stack talep opd opd-v3 iade-detay">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">İADE TALEBİ · {when(talep.created_at)}</small>
          <h1>{siparis?.order_number ?? "Sipariş bulunamadı"}</h1>
        </div>
        <div className="talep-bas-eylem">
          <span className="status-pill" data-tone={rozetTonu(rozet.tone)}>{rozet.label}</span>
          <details className="os-menu talep-menu">
            <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
            <div className="os-menu-list" role="menu">
              <Link prefetch={false} className="os-menu-item" href={`/siparisler/${talep.order_id}`}>Siparişi aç</Link>
              {siparis?.customer_email ? <a className="os-menu-item" href={`mailto:${siparis.customer_email}`}>Müşteriye e-posta</a> : null}
              <Link prefetch={false} className="os-menu-item" href="/siparisler/iadeler">İade listesine dön</Link>
            </div>
          </details>
        </div>
      </header>

      {/* Durum, ekranın tepesinde bir cümleyle: karar vermek için önce
          "bu talep nerede" sorusu cevaplanmalı. */}
      {bekliyor ? (
        <KNot ton={bekleyenSaat !== null && bekleyenSaat >= 48 ? "tehlike" : "uyari"}>
          <b>Karar bekliyor{bekleyenSaat !== null ? ` · ${bekleyenSaat < 24 ? `${bekleyenSaat} saat` : `${Math.floor(bekleyenSaat / 24)} gün`}` : ""}.</b>{" "}
          Onay para iadesi yapmaz; müşteriye ürünü gönderebileceğini bildirir.
        </KNot>
      ) : null}
      {urunBekleniyor ? (
        <KNot ton="uyari">
          <b>Onaylandı · ürün bekleniyor{bekleyenSaat !== null ? ` · ${bekleyenSaat < 24 ? `${bekleyenSaat} saat` : `${Math.floor(bekleyenSaat / 24)} gün`}` : ""}.</b>{" "}
          Ürün elinize ulaşıp kontrol ettikten sonra iadeyi tamamlayın; para o adımda gönderilir.
        </KNot>
      ) : null}
      {talep.status === "tamamlandi" ? (
        <KNot ton="basari">
          <b>{money(Number(talep.refund_amount ?? 0))} iade edildi{talep.resolved_at ? ` · ${when(talep.resolved_at)}` : ""}.</b>
          {talep.refund_reference ? ` Referans: ${talep.refund_reference}.` : ""}
        </KNot>
      ) : null}
      {talep.status === "reddedildi" ? (
        <KNot ton="tehlike">
          <b>Talep reddedildi{talep.resolved_at ? ` · ${when(talep.resolved_at)}` : ""}.</b>{" "}
          Müşteriye karar e-postası gönderildi.
        </KNot>
      ) : null}
      {urunBekleniyor && havale ? (
        <KNot ton="tehlike">
          <b>Havale siparişi: para buradan iade edilemez.</b>{" "}
          Tutarı bankadan gönderip siparişi elle kapatın; bu ekrandaki iade PayTR üzerinden çalışıyor.
        </KNot>
      ) : null}

      <div className="talep-izgara opd-izgara">
        <section className="panel-card talep-musteri" aria-label="Müşteri ve sipariş">
          <div className="talep-musteri-kimlik">
            <span className="talep-avatar" aria-hidden="true">{musteri.slice(0, 2).toUpperCase()}</span>
            <div>
              <b>{musteri}</b>
              {siparis?.customer_email ? <small>{siparis.customer_email}</small> : null}
            </div>
          </div>
          <dl className="talep-liste">
            <div><dt>Sipariş</dt><dd><Link prefetch={false} href={`/siparisler/${talep.order_id}`}>{siparis?.order_number ?? "—"}</Link></dd></div>
            <div><dt>Sipariş durumu</dt><dd>{siparis ? <span className="status-pill" data-tone={rozetTonu(orderBadge(siparis.status, siparis.payment_status).tone)}>{orderBadge(siparis.status, siparis.payment_status).label}</span> : "—"}</dd></div>
            <div><dt>Sipariş tarihi</dt><dd>{siparis ? when(siparis.created_at) : "—"}</dd></div>
            <div><dt>Sipariş toplamı</dt><dd>{money(siparis?.total ?? 0)}</dd></div>
            {onceIade > 0 ? (
              /* Daha önce iade yapılmış siparişte kalan tutar kararın
                 sınırı; ekranda olmadığında sunucu "tutar kalanı aşıyor"
                 diyor ve sebebi görünmüyordu. */
              <div><dt>Önceden iade</dt><dd>{money(onceIade)} · kalan {money(kalan)}</dd></div>
            ) : null}
            <div><dt>Ödeme</dt><dd>{havale ? "Havale / EFT" : String(meta.payment_method ?? "Kredi kartı")}</dd></div>
          </dl>

          <div className="talep-gecmis">
            <h3>Müşterinin gerekçesi</h3>
            <p className="iade-sebep"><b>{talep.reason || "Sebep belirtilmedi"}</b></p>
            {talep.note ? <p className="iade-not">{talep.note}</p> : null}
          </div>

          {talep.status_note ? (
            <div className="talep-gecmis">
              <h3>Karar notu</h3>
              <p className="iade-not">{talep.status_note}</p>
            </div>
          ) : null}
        </section>

        <section className="panel-card talep-bilgi opd-gorevler" aria-label="İade edilen ürünler ve karar">
          <header className="opd-gorev-bas">
            <h2>İade edilen ürünler</h2>
            <span>{kalemler.length} kalem</span>
          </header>

          {/*
            TEDARİKÇİ ÜSTTE. İki tedarikçiden ürün içeren iade tek paket
            olarak geri gönderilemez; bunu kalem kalem okumak yerine
            tepede görmek gerekiyor.
          */}
          {tedarikciler.length ? (
            <p className="iade-tedarikci">
              <b>Geri dönecek yer:</b> {tedarikciler.join(" · ")}
              {tedarikciler.length > 1 ? <em> — iki ayrı tedarikçi, ayrı gönderilmeli</em> : null}
            </p>
          ) : null}

          <div className="iade-satirlar">
            <div className="iade-satir is-bas"><span>ÜRÜN</span><span>ADET</span><span>TUTAR</span></div>
            {kalemler.map((kalem, sira) => {
              const yon = yonler[sira];
              return (
                <div className="iade-satir" key={`${kalem.sku}-${sira}`}>
                  <span>
                    <b>{kalem.name ?? kalem.sku ?? "Ürün"}</b>
                    <small>{kalem.sku}</small>
                    {/* Ürünün ÇIKTIĞI PAKET: iadeyi karşılarken hangi
                        tedarikçiye ve hangi takip numarasına bakılacağını
                        söylüyor. Gönderilmemiş ürün için paket UYDURULMUYOR. */}
                    {yon?.paket ? (
                      <small className="iade-paket">
                        {yon.paket.sequence}. paket
                        {yon.paket.firma ? ` · ${yon.paket.firma}` : ""}
                        {yon.paket.takipNo ? ` · ${yon.paket.takipNo}` : ""}
                      </small>
                    ) : (
                      <small className="iade-paket is-bos">kargoya verilmemiş</small>
                    )}
                  </span>
                  <span>{kalem.quantity ?? 1}</span>
                  <span>{money(Number(kalem.total ?? 0))}</span>
                </div>
              );
            })}
          </div>

          <dl className="iade-toplam">
            <div><dt>Kalem toplamı</dt><dd>{money(kalemToplami)}</dd></div>
            {/* Kargo çıkmadıysa kargo bedeli de iadeye giriyor; ayrı satır
                olmadan tutar olduğundan yüksek görünüyor. */}
            {hesap.shippingRefund > 0 ? <div><dt>Kargo bedeli</dt><dd>{money(hesap.shippingRefund)}</dd></div> : null}
            <div className="is-vurgu"><dt>Hesaplanan iade</dt><dd>{money(hesap.amount)}</dd></div>
          </dl>
          {hesap.shippingRefund > 0 ? <p className="list-hint">Kargo çıkmadığı için kargo bedeli de iade tutarına eklendi.</p> : null}

          {!canResolve ? (
            <p className="list-hint">İade kararını kurum sahibi ve yöneticiler verir.</p>
          ) : null}

          {/*
            Siparişi silinmiş talepte karar FORMU GÖSTERİLMİYOR: tutar
            kargo bedeli ve ödeme durumu o kayıttan geliyor ve işlem
            zaten "talep bulunamadı" ile dönüyordu — düğmeyi gösterip
            hata vermek, sebebini söylemeyen bir ekran olurdu.
          */}
          {canResolve && !siparis ? (
            <KNot ton="tehlike">
              <b>Talebin siparişi bulunamadı.</b>{" "}
              Sipariş silinmiş görünüyor; karar verilemez. Kaydı kurucu konsolundan araştırabilirsiniz.
            </KNot>
          ) : null}

          {canResolve && siparis && bekliyor ? (
            <>
              <hr className="ac-divider" />
              <form action={resolveReturn} className="order-form-grid is-narrow iade-karar">
                <input type="hidden" name="request_id" value={talep.id} />
                <input type="hidden" name="back" value={adres} />
                <label>
                  Müşteriye not
                  <textarea name="note" rows={2} maxLength={500} placeholder="Kargo talimatı, iade adresi gibi bilgiler. E-postada görünür." className="ac-input" />
                </label>
                <p className="list-hint">
                  Onay para iadesi yapmaz; müşteriye ürünü gönderebileceğini bildirir. Para, ürün elinize ulaştıktan sonra iade edilir.
                </p>
                <div className="iade-karar-eylem">
                  <button className="panel-primary" type="submit" name="decision" value="onayla">Onayla</button>
                  {/* Ret geri alınamaz ve müşteriye karar e-postası gönderir. */}
                  <ConfirmSubmit
                    className="panel-danger"
                    name="decision"
                    value="reddet"
                    message={`${siparis?.order_number ?? "Talep"} için iade talebi reddedilsin mi?\n\nMüşteriye ret e-postası gönderilir ve talep kapanır. Bu işlem geri alınamaz.`}
                  >
                    Reddet
                  </ConfirmSubmit>
                </div>
              </form>
            </>
          ) : null}

          {canResolve && siparis && urunBekleniyor ? (
            <>
              <hr className="ac-divider" />
              <form action={resolveReturn} className="order-form-grid is-narrow iade-karar">
                <input type="hidden" name="request_id" value={talep.id} />
                <input type="hidden" name="decision" value="iade-et" />
                <input type="hidden" name="back" value={adres} />
                <label>
                  İade tutarı (₺)
                  <input
                    name="amount"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={`Boş bırakın: ${(hesap.amount / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`}
                    className="ac-input"
                  />
                </label>
                <label>
                  Müşteriye not
                  <textarea name="note" rows={2} maxLength={500} placeholder="Değer kaybı kesintisi varsa açıklayın." className="ac-input" />
                </label>
                {/*
                  STOĞA EKLEME KARARI OPERASYONCUNUN: geri gelen ürün
                  hasarlı ya da açılmışsa stoğa girmemeli ve bunu sistem
                  bilemez. Varsayılan işaretli, çünkü iadelerin çoğu
                  satılabilir dönüyor ve sipariş iptali de stoğu soru
                  sormadan geri veriyor.
                */}
                <label className="check-inline">
                  <input type="checkbox" name="stoga_ekle" defaultChecked />
                  <span>Ürünler satılabilir durumda, stoğa geri ekle</span>
                </label>
                <p className="list-hint is-danger">
                  Bu adım PayTR üzerinden gerçek para iadesi başlatır ve geri alınamaz. Ürünü teslim aldığınızdan emin olun.
                </p>
                <div className="iade-karar-eylem">
                  <ConfirmSubmit
                    className="panel-primary"
                    message={`${siparis?.order_number ?? "Sipariş"} için para iadesi başlatılsın mı?\n\nBoş bıraktıysanız ${money(hesap.amount)} iade edilir. İşlem PayTR üzerinden gerçek para hareketi yapar ve GERİ ALINAMAZ.`}
                  >
                    Ürünü aldım, iadeyi tamamla
                  </ConfirmSubmit>
                </div>
              </form>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
