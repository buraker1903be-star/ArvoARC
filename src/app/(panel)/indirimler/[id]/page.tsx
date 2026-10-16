import Link from "next/link";
import { notFound } from "next/navigation";
import { kimlikMi } from "@/lib/kimlik";
import { yetkiYok } from "@/lib/yetki-metni";
import { requireTenant } from "@/lib/tenant";
import { fetchAllRows } from "@/lib/fetch-all";
import { countsAsRevenue, revenueAmount } from "@/lib/order-flow";
import { trIsoToLocal } from "@/lib/tr-time";
import { rozetTonu } from "@/lib/rozet-tonu";
import { KNot } from "@/components/arvo-ui/k-ui";
import { ConfirmSubmit } from "@/components/panel/confirm-submit";
import { DurumSecici } from "@/components/arvo-ui/durum-secici";
import { deleteDiscount, toggleDiscount, updateDiscount } from "../actions";
import { indirimDegeri, indirimDurumu, indirimTuruAdi } from "@/lib/indirim-bicim";
import { BITIYOR_GUN } from "@/lib/indirim-istatistik";
import "@/components/arvo-ui/k-ui";
import "@/components/arvo-ui/crm.css";
import "@/components/arvo-ui/kayit-detay.css";
import "../../modules.css";
import "../indirimler.css";

/*
  KAMPANYA DETAYI (16.10.2026).

  Önce yalnızca oluşturma ve durum değiştirme vardı: adı yanlış yazılan
  ya da bitiş tarihi kayan bir kampanyayı düzeltmenin tek yolu silip
  yeniden yaratmaktı — ve o da kullanım sayacını sıfırlıyordu, yani
  "bu kupon kaç kez kullanıldı" sorusunun cevabı kayboluyordu.

  Sayfa siparişin detayıyla aynı iskelet: solda künye ve kullanım,
  sağda düzenleme formu.
*/

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const tarihSaat = (deger: string | null) =>
  deger ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(deger)) : "—";

/* Render dışında: bileşen içinde saf olmayan çağrı yapılmasın. */
function simdi() {
  return Date.now();
}

export default async function KampanyaDetayi({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  /* Bozuk/kırpılmış kimlik "kayıt yok"tur: Postgres uuid olmayan değeri
     22P02 ile reddediyor ve sayfa okuma hatasını fırlattığı için çökme
     ekranı çıkıyordu (lib/kimlik). */
  if (!kimlikMi(id)) notFound();
  const { supabase, organization, membership } = await requireTenant();
  const canManage = ["owner", "admin", "manager"].includes(membership.role);

  const { data: kural, error } = await supabase
    .from("arc_discounts")
    .select("id,name,code,discount_type,value,minimum_subtotal,usage_limit,usage_count,per_customer_limit,starts_at,ends_at,status,combinable,created_at,updated_at")
    .eq("organization_id", organization.id)
    .eq("id", id)
    .maybeSingle();
  /* Okunamayan kayıt "yok" DEĞİL: hatayı 404'e çevirmek, var olan bir
     kampanyanın silindiğini düşündürür. */
  if (error) throw new Error("Kampanya okunamadı: " + error.message);
  if (!kural) notFound();

  /*
    KUPON KAÇ SİPARİŞTE KULLANILDI? usage_count tetikleyiciden geliyor
    ama hangi siparişlerde kullanıldığını söylemiyor. Sayı siparişin
    metadata'sından okunuyor (arc_count_coupon_use da oradan sayıyor);
    kodu olmayan otomatik kuralın karşılığı yok.
  */
  /*
    KUPONUN GETİRDİĞİ. Sayaç kaç kez kullanıldığını söylüyor ama
    "ne kadar sattırdı, ne kadara mal oldu" sorusunu kimse
    cevaplamıyordu — kampanyayı sürdürme kararı bu iki sayıya bakıyor.
    İndirim tutarı siparişin metadata'sında (`discount`, kuruş):
    sipariş fonksiyonu kuponu uygularken oraya yazıyor.
  */
  type KuponSiparisi = { total: number; status: string; payment_status: string; created_at: string; metadata: unknown };
  const { rows: kuponSiparisleri } = kural.code
    ? await fetchAllRows<KuponSiparisi>((bas, son) =>
        supabase.from("arc_orders").select("total,status,payment_status,created_at,metadata")
          .eq("organization_id", organization.id)
          .ilike("metadata->>coupon_code", kural.code!)
          .order("created_at", { ascending: false })
          .range(bas, son) as unknown as PromiseLike<{ data: KuponSiparisi[] | null; error: { message: string } | null }>,
      )
    : { rows: [] as KuponSiparisi[] };

  const odenenler = kuponSiparisleri.filter((siparis) => countsAsRevenue(siparis.status, siparis.payment_status));
  const kuponCirosu = odenenler.reduce((toplam, siparis) => toplam + revenueAmount({ ...siparis, refunded_amount: (siparis.metadata as { refunded_amount?: unknown } | null)?.refunded_amount }), 0);
  const verilenIndirim = odenenler.reduce((toplam, siparis) => {
    const tutar = Number((siparis.metadata as { discount?: unknown } | null)?.discount ?? 0);
    return toplam + (Number.isFinite(tutar) && tutar > 0 ? tutar : 0);
  }, 0);
  const sonKullanim = kuponSiparisleri[0]?.created_at ?? null;

  const { count: siparisSayisi, error: siparisHatasi } = kural.code
    ? await supabase.from("arc_orders").select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        /*
          BÜYÜK/küçük harf duyarsız: sayacı artıran tetikleyici
          upper(metadata->>'coupon_code') ile upper(d.code)'u
          karşılaştırıyor, yani sipariş "arvo10" ile kaydedilmiş olsa
          da sayaç artıyor. Burada eq kullanmak, sayaç 12 derken
          listede 0 sipariş göstermek olurdu.
        */
        .ilike("metadata->>coupon_code", kural.code)
    : { count: null, error: null };
  /* Sayım düşerse sıfır GÖSTERİLMİYOR: "hiç kullanılmadı" demek,
     kampanyayı kapatma kararını yanlış bilgiyle verdirir. */
  if (siparisHatasi) throw new Error("Kuponun siparişleri sayılamadı: " + siparisHatasi.message);

  const an = simdi();
  const bitis = kural.ends_at ? Date.parse(kural.ends_at) : null;
  const gecerliBitis = bitis !== null && !Number.isNaN(bitis) ? bitis : null;
  const suresiGecti = gecerliBitis !== null && gecerliBitis < an;
  const bitiyor = gecerliBitis !== null && !suresiGecti && gecerliBitis - an <= BITIYOR_GUN * 86_400_000;
  const limit = Number(kural.usage_limit ?? 0) || 0;
  const kullanim = Math.max(0, Number(kural.usage_count ?? 0) || 0);
  const limitDoldu = limit > 0 && kullanim >= limit;
  const rozet = indirimDurumu(kural.status);
  const adres = `/indirimler/${kural.id}`;

  return (
    <main className="crm-page-stack talep opd opd-v3 tek-ekran indirim-detay">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">KAMPANYA · {kural.code ? `KOD ${kural.code}` : "OTOMATİK"}</small>
          <h1>{kural.name}</h1>
        </div>
        <div className="talep-bas-eylem">
          <span className="status-pill" data-tone={rozetTonu(rozet.tone)}>{rozet.label}</span>
          {canManage ? (
            <form action={toggleDiscount}>
              <input type="hidden" name="id" value={kural.id} />
              <input type="hidden" name="next_status" value={kural.status === "active" ? "paused" : "active"} />
              <input type="hidden" name="back" value={adres} />
              <button className="panel-secondary" type="submit">{kural.status === "active" ? "Duraklat" : "Etkinleştir"}</button>
            </form>
          ) : null}
          <details className="os-menu talep-menu">
            <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
            <div className="os-menu-list" role="menu">
              {kural.code ? (
                <Link prefetch={false} className="os-menu-item" href={`/siparisler?filter=all&q=${encodeURIComponent(kural.code)}`}>Kuponun siparişleri</Link>
              ) : null}
              <Link prefetch={false} className="os-menu-item" href="/indirimler">Kampanyalara dön</Link>
              {canManage ? (
                <form action={deleteDiscount}>
                  <input type="hidden" name="id" value={kural.id} />
                  {/* Silme listeye döner: kayıt artık yok, detay sayfası 404 olurdu. */}
                  <input type="hidden" name="back" value="/indirimler" />
                  <ConfirmSubmit
                    className="os-menu-item"
                    message={`“${kural.name}” kalıcı olarak silinsin mi?\n\n${kullanim > 0 ? `Bu kampanya ${kullanim} kez kullanılmış; kullanım geçmişi de kaydıyla birlikte gider.\n\n` : ""}Bu işlem geri alınamaz.`}
                  >
                    Kampanyayı sil
                  </ConfirmSubmit>
                </form>
              ) : null}
            </div>
          </details>
        </div>
      </header>

      {suresiGecti && kural.status === "active" ? (
        <KNot ton="tehlike">
          <b>Süresi geçmiş ama hâlâ “Aktif” görünüyor.</b>{" "}
          Bitiş tarihi {tarihSaat(kural.ends_at)}. Vitrin kuralı uygulamıyor (tarihe bakıyor); durumu
          duraklatıp listeyi gerçeğe yaklaştırabilirsiniz.
        </KNot>
      ) : null}
      {bitiyor ? (
        <KNot ton="uyari"><b>Bitmek üzere · {tarihSaat(kural.ends_at)}.</b> Süreyi uzatmak için bitiş tarihini değiştirin.</KNot>
      ) : null}
      {limitDoldu ? (
        <KNot ton="uyari">
          <b>Kullanım limiti doldu ({kullanim}/{limit}).</b>{" "}
          Kodu giren müşteri “limit doldu” cevabı alır. Limiti artırabilir ya da boş bırakıp sınırsız yapabilirsiniz.
        </KNot>
      ) : null}

      <div className="talep-izgara opd-izgara">
        <section className="panel-card talep-musteri" aria-label="Künye ve kullanım">
          <dl className="talep-liste">
            <div><dt>Tür</dt><dd>{indirimTuruAdi(kural.discount_type)}</dd></div>
            <div><dt>Değer</dt><dd><b>{indirimDegeri(kural.discount_type, kural.value)}</b></dd></div>
            <div><dt>Koşul</dt><dd>{kural.minimum_subtotal > 0 ? `${money.format(kural.minimum_subtotal / 100)} üzeri sepet` : "alt limitsiz"}</dd></div>
            <div><dt>Uygulanma</dt><dd>{kural.code ? "Müşteri kodu girer" : "Koşul sağlanınca kendiliğinden"}</dd></div>
            <div><dt>Birleşebilir mi</dt><dd>{kural.combinable ? "Diğer indirimlerle birleşir" : "Tek başına uygulanır"}</dd></div>
            <div><dt>Başlangıç</dt><dd>{tarihSaat(kural.starts_at)}</dd></div>
            <div><dt>Bitiş</dt><dd>{tarihSaat(kural.ends_at)}</dd></div>
            <div><dt>Oluşturuldu</dt><dd>{tarihSaat(kural.created_at)}</dd></div>
          </dl>

        </section>

        <section className="panel-card talep-bilgi opd-gorevler" aria-label="Kampanyayı düzenle">
          <header className="opd-gorev-bas">
            <h2>Kampanyayı düzenle</h2>
            <span>{tarihSaat(kural.updated_at)} güncellendi</span>
          </header>

          {canManage ? (
            <form action={updateDiscount}>
              <input type="hidden" name="id" value={kural.id} />
              <input type="hidden" name="back" value={adres} />
              <div className="discount-form-grid">
                <label className="wide">Kampanya adı<input name="name" required maxLength={160} defaultValue={kural.name} /></label>
                {/* Tarayıcının <select>'i yerine panelin seçicisi: aynı
                    liste, aynı klavye, kutu biçiminde (durum-secici). */}
                <label>İndirim türü
                  <DurumSecici
                    name="discount_type"
                    etiket="İndirim türü"
                    bicim="alan"
                    gonder={false}
                    deger={kural.discount_type}
                    secenekler={[
                      { deger: "percentage", etiket: "Sepette yüzde indirim" },
                      { deger: "fixed_amount", etiket: "Sepette sabit tutar indirimi" },
                      { deger: "free_shipping", etiket: "Ücretsiz kargo" },
                    ]}
                  />
                </label>
                <label>İndirim değeri
                  <input name="value" type="text" inputMode="decimal" autoComplete="off" defaultValue={kural.discount_type === "fixed_amount" ? (kural.value / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 }) : String(kural.value)} />
                  <small>Yüzde için 10, sabit indirim için TL tutarı. Ücretsiz kargoda 0.</small>
                </label>
                <label>Minimum sepet tutarı (₺)
                  <input name="minimum_subtotal" type="text" inputMode="decimal" autoComplete="off" defaultValue={(kural.minimum_subtotal / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} />
                </label>
                <label>Kupon kodu<input name="code" maxLength={40} defaultValue={kural.code ?? ""} placeholder="Boş: otomatik uygulanır" /></label>
                <label>Toplam kullanım limiti<input name="usage_limit" type="number" min="1" step="1" defaultValue={kural.usage_limit ?? ""} placeholder="Limitsiz" /></label>
                <label>Kişi başı kullanım<input name="per_customer_limit" type="number" min="1" step="1" defaultValue={kural.per_customer_limit ?? ""} placeholder="Limitsiz" /></label>
                <label>Başlangıç (Türkiye saati)<input name="starts_at" type="datetime-local" defaultValue={trIsoToLocal(kural.starts_at)} /></label>
                <label>Bitiş (Türkiye saati)<input name="ends_at" type="datetime-local" defaultValue={trIsoToLocal(kural.ends_at)} /></label>
                <label className="check-inline"><input name="combinable" type="checkbox" defaultChecked={kural.combinable} /> Diğer indirimlerle birleştirilebilir</label>
              </div>
              {/* Durum bu formda DEĞİL: başlıktaki düğmeden değişiyor ve
                  kaydetmeyi beklemeden geçerli olması gerekiyor. */}
              {/*
                KAYDET ÇUBUĞU panelin dilinde. Eskisi globals.css'ten
                geliyordu: sabit renkler (altın çerçeve, yeşil düğme),
                11,5px yazı ve 14px köşe — panelin hiçbir yerinde
                karşılığı olmayan bir kutu. Artık kartın altına yapışık
                ince bir şerit ve düğme panelin birincil düğmesi.
              */}
              <div className="indirim-kaydet">
                <span>Kullanım sayacı bu formdan değişmez; sipariş ödendikçe kendisi artar.</span>
                <button className="panel-primary" type="submit">Değişiklikleri kaydet</button>
              </div>
            </form>
          ) : (
            <p className="list-hint">{yetkiYok("kampanya düzenleme")}</p>
          )}
        </section>

        {/*
          ÜÇÜNCÜ SÜTUN: KUPON NE YAPTI. Sayaç kaç kez kullanıldığını
          söylüyordu ama "ne kadar sattırdı, ne kadara mal oldu"
          sorusunun cevabı hiçbir yerde yoktu — kampanyayı sürdürme ya
          da durdurma kararı tam olarak bu iki sayıya bakıyor.
        */}
        <section className="panel-card talep-musteri indirim-olcum" aria-label="Kuponun getirdiği">
          <div className="talep-gecmis">
            <h3>Kullanım</h3>
            <p className="indirim-kullanim">
              <b>{kullanim.toLocaleString("tr-TR")}</b>
              {limit > 0 ? <span> / {limit.toLocaleString("tr-TR")} kullanım</span> : <span> kullanım · limitsiz</span>}
            </p>
            {limit > 0 ? (
              <div className="indirim-cubuk" role="img" aria-label={`Limitin %${Math.min(100, Math.round((kullanim / limit) * 100))} kadarı kullanıldı`}>
                <span style={{ width: `${Math.min(100, Math.round((kullanim / limit) * 100))}%` }} data-dolu={kullanim >= limit ? "" : undefined} />
              </div>
            ) : null}
            <p className="list-hint">Kişi başı sınır: {kural.per_customer_limit ? `${kural.per_customer_limit} kullanım` : "yok"}</p>
          </div>

          {kural.code ? (
            <div className="talep-gecmis">
              <h3>Kuponun getirdiği</h3>
              <dl className="talep-liste">
                <div><dt>Sipariş</dt><dd>{Number(siparisSayisi ?? 0).toLocaleString("tr-TR")} · {odenenler.length.toLocaleString("tr-TR")} ödenen</dd></div>
                <div><dt>Ciro</dt><dd><b>{money.format(kuponCirosu / 100)}</b></dd></div>
                {/* İndirim siparişin metadata'sından: kuponun mağazaya maliyeti. */}
                <div><dt>Verilen indirim</dt><dd>{money.format(verilenIndirim / 100)}</dd></div>
                <div><dt>Ortalama sepet</dt><dd>{money.format(odenenler.length ? kuponCirosu / odenenler.length / 100 : 0)}</dd></div>
                <div><dt>Son kullanım</dt><dd>{sonKullanim ? tarihSaat(sonKullanim) : "—"}</dd></div>
              </dl>
              <p className="list-hint">
                <Link prefetch={false} href={`/siparisler?filter=all&q=${encodeURIComponent(kural.code)}`}>Siparişleri gör</Link>
                {" · "}Ciro ve indirim yalnızca ÖDENEN siparişlerden; iptal ve iade sayılmaz.
              </p>
            </div>
          ) : (
            <div className="talep-gecmis">
              <h3>Kuponun getirdiği</h3>
              <p className="list-hint">
                Bu kural otomatik uygulanıyor; siparişte kupon kodu yazmadığı için hangi siparişlerde
                çalıştığı ayrıştırılamıyor. Ölçmek isterseniz kampanyaya bir kod verin.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
