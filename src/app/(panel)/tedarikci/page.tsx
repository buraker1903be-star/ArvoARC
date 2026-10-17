import { requireTenant } from "@/lib/tenant";
import { KKart } from "@/components/arvo-ui/k-ui";
import { updateSupplier, resetCursor } from "./actions";
import "../catalog.css";
import "../modules.css";
import "@/components/arvo-ui/kayit-detay.css";
import "./tedarikci.css";
import { yetkiYok } from "@/lib/yetki-metni";
import { IstatistikKarti } from "@/components/arvo-ui/istatistik-karti";
import { yuzdeEkli } from "@/lib/turkce-ek";
import { yuzdeOrani } from "@/lib/oran";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const dateTime = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });


/**
 * Tedarikçi ayarları.
 *
 * Fiyat kuralı, aktarım durumu ve imleç yönetimi. Öncesinde bu
 * ayarları değiştirmek için SQL yazmak gerekiyordu.
 */
export default async function SuppliersPage() {
  const { supabase, organization, membership } = await requireTenant();
  const canManage = ["owner", "admin"].includes(membership.role);

  /*
    TEDARİK KATALOĞUNUN SAĞLIĞI (17.10.2026). Sayfa yalnızca fiyat
    kuralını ve eşitleme saatini gösteriyordu; "bu katalogdan kaç ürün
    GERÇEKTEN satılabilir durumda" sorusunun karşılığı yoktu. Sayımlar
    head:true — satır taşımıyor.

    Ölçüt `supplier` sütunu: tedarikçiden gelen ürün ve varyantta dolu,
    kendi ürünlerimizde boş.
  */
  const tedarikUrunu = () => supabase.from("arc_products").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).not("supplier", "is", null);
  const tedarikVaryanti = () => supabase.from("arc_product_variants").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).not("supplier", "is", null);
  const [{ data: suppliers, error }, urunSayimi, yayindaSayimi, varyantSayimi, satilamazSayimi, maliyetsizSayimi] = await Promise.all([
    supabase.from("arc_suppliers").select("*").eq("organization_id", organization.id).order("name"),
    tedarikUrunu(),
    tedarikUrunu().eq("status", "active"),
    tedarikVaryanti(),
    /* Satılamaz: stoğu bitmiş VE stoksuz satışı kapalı. */
    tedarikVaryanti().lte("stock", 0).eq("allow_backorder", false),
    tedarikVaryanti().is("cost_price", null),
  ]);
  if (error) throw new Error(error.message);
  /* Sayım düşerse sıfır gösterilmiyor: "satılamaz ürün yok" demek,
     olmayan bir iyi haber vermek olurdu. */
  const sayim = (sonuc: { count: number | null; error: { message: string } | null }) => (sonuc.error ? null : sonuc.count ?? 0);
  const tedarikUrun = sayim(urunSayimi);
  const tedarikYayinda = sayim(yayindaSayimi);
  const tedarikVaryant = sayim(varyantSayimi);
  const tedarikSatilamaz = sayim(satilamazSayimi);
  const tedarikMaliyetsiz = sayim(maliyetsizSayimi);
  const sayiYaz = (deger: number | null) => (deger === null ? "—" : deger.toLocaleString("tr-TR"));
  /* Yuvarlama uçları uydurmasın (lib/oran): 3.257/3.264 "%100" değil. */
  const oranYaz = (deger: number | null, taban: number | null) => (deger === null || !taban ? null : yuzdeOrani(deger, taban));

  /* ArvoOS kalıbı (16.10.2026): başlık, her tedarikçi bir panel kartı. */
  return (
    <main className="talep tedarikci-sayfasi">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">Tedarik</small>
          <h1>Tedarikçiler</h1>
          <p className="talep-bas-alt">Fiyat kuralları ve katalog eşitleme durumu.</p>
        </div>
      </header>

      {/* Solda tedarikçi kartları, sağda tedarik kataloğunun sağlığı:
          katalog ve sipariş ekranlarıyla aynı ızgara. */}
      <div className="talep-izgara personel-iki ekip-izgara">
      <div className="talep-bilgi tedarikci-liste">
        {(suppliers ?? []).length === 0 ? (
          <div className="panel-card crm-empty-state talep-bos-kutu"><h2>Tanımlı tedarikçi yok</h2><p>Tedarikçi entegrasyonu kurulduğunda burada görünür.</p></div>
        ) : null}

        {(suppliers ?? []).map((supplier) => {
          const total = supplier.sync_total ?? 0;
          const cursor = supplier.sync_cursor ?? 0;
          const percent = total > 0 ? Math.min(100, Math.round((cursor / total) * 100)) : 0;
          const margin = supplier.margin_percent ?? 40;
          const shipping = supplier.shipping_markup ?? 0;
          const service = supplier.service_fee ?? 0;
          const round = supplier.round_to_kurus ?? 90;
          /*
            İMLEÇ ARTIK YALNIZCA TAM AKTARIMIN (16.10.2026). Stok turu her
            on dakikada kataloğun tamamını tek seferde işliyor ve imlece
            dokunmuyor; ekran eskiden "0 / 3.161 · %0 aktarıldı" yazıp işi
            durmuş gösteriyordu. Çubuk yalnızca elle başlatılmış bir tam
            aktarım yarıdayken görünür.
          */
          const tamSuruyor = cursor > 0 && total > 0;
          const sonEsitleme = supplier.last_synced_at ? Date.parse(supplier.last_synced_at) : null;
          const gecikmeDk = sonEsitleme ? Math.round((saat() - sonEsitleme) / 60_000) : null;
          const durum = tamSuruyor
            ? { etiket: `Tam aktarım %${percent}`, ton: "info" }
            : gecikmeDk === null ? { etiket: "Henüz eşitlenmedi", ton: "neutral" }
            : gecikmeDk > 30 ? { etiket: `${gecikmeDk} dk'dır eşitlenmedi`, ton: "danger" }
            : { etiket: "Güncel", ton: "success" };

          return (
            <KKart key={supplier.id} baslik={supplier.name} aciklama={`${supplier.code} · ${supplier.publish_directly ? "yeni ürünler doğrudan yayınlanır" : "yeni ürünler taslak olarak gelir"}`} sag={<span className="status-pill" data-tone={durum.ton}>{durum.etiket}</span>}>
              <dl className="tedarikci-ozet">
                <div><dt>Son eşitleme</dt><dd>{supplier.last_synced_at ? dateTime.format(new Date(supplier.last_synced_at)) : "Henüz yapılmadı"}</dd></div>
                <div><dt>Son not</dt><dd>{supplier.last_sync_note || "—"}</dd></div>
                <div><dt>Katalog</dt><dd>{total ? `${total.toLocaleString("tr-TR")} ürün` : "—"} · stok ve fiyat her 10 dakikada</dd></div>
              </dl>
              {tamSuruyor ? (
                <div className="supplier-sync">
                  <div className="supplier-sync-top"><span>Tam aktarım</span><b>{cursor.toLocaleString("tr-TR")} / {total.toLocaleString("tr-TR")} ürün</b></div>
                  <div className="supplier-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ "--w": `${percent}%` } as React.CSSProperties} /></div>
                </div>
              ) : null}

              {canManage ? (
                <>
                  <form action={updateSupplier} className="supplier-form">
                    <input type="hidden" name="code" value={supplier.code} />
                    <label>Kâr oranı (%)<input name="margin_percent" type="number" min="0" max="500" step="1" defaultValue={margin} required className="ac-input" /></label>
                    <label>Kargo payı (₺)<input name="shipping_markup" type="text" inputMode="decimal" autoComplete="off" defaultValue={(shipping / 100).toFixed(2)} required className="ac-input" /></label>
                    <label>Ek hizmet bedeli (₺)<input name="service_fee" type="text" inputMode="decimal" autoComplete="off" defaultValue={(service / 100).toFixed(2)} className="ac-input" /></label>
                    <label>Stok tamponu (adet)<input name="stock_buffer" type="number" min="0" max="100" step="1" defaultValue={supplier.stock_buffer ?? 5} className="ac-input" /></label>
                    <label>Yuvarlama (kuruş)<input name="round_to_kurus" type="number" min="0" max="99" step="1" defaultValue={round} required className="ac-input" /></label>
                    <label className="check-inline is-wide"><input name="publish_directly" type="checkbox" defaultChecked={supplier.publish_directly ?? false} /> Yeni ürünler doğrudan yayınlansın (kapalıysa taslak gelir)</label>
                    {/* Ortak kaydet şeridi (panel-ui.css): katalog ve
                        ayarlar formlarıyla aynı düzen. */}
                    <div className="kaydet-serit"><span>Kural bir sonraki eşitlemede bütün katalog fiyatlarına uygulanır.</span><button className="panel-primary" type="submit">Kaydet</button></div>
                  </form>

                  {/* Önizleme içe aktarmadaki hesabın aynısı; ek hizmet
                      bedeli de dâhil (öncesinde önizlemede yoktu). */}
                  <p className="supplier-preview">
                    Örnek: {money.format(200)} alış{service ? ` + ${money.format(service / 100)} hizmet` : ""} · %{margin} kâr · {money.format(shipping / 100)} kargo payı →
                    <strong>{money.format(previewPrice(20000, margin, shipping, round, service) / 100)}</strong> satış
                  </p>
                  <p className="list-hint">Tedarikçi stoğu tampon değerin altına düştüğünde ürün satışa kapanır ve vitrinde “Tükendi” görünür; siparişi iletene kadar tükenme riskine karşı güvenlik payıdır.</p>

                  {/*
                    Fiyat kuralı değişince imleci sıfırlamak GEREKMİYOR: stok
                    turu her on dakikada bütün kataloğun fiyatını yeni kurala
                    göre yazıyor. Sıfırlama yalnızca yarım kalan bir tam
                    aktarımı baştan başlatmak için.
                  */}
                  <p className="list-hint">Fiyat kuralını değiştirdiğinizde bir sonraki eşitleme (en geç 10 dakika) bütün kataloğun satış fiyatını yeni kurala göre günceller.</p>
                  {tamSuruyor ? (
                    <div className="supplier-reset">
                      <form action={resetCursor}>
                        <input type="hidden" name="code" value={supplier.code} />
                        <button type="submit" className="panel-secondary">Tam aktarımı baştan başlat</button>
                      </form>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="list-hint">{yetkiYok("tedarikçi ayarları", "sahiplik")}</p>
              )}
            </KKart>
          );
        })}
      </div>

      <IstatistikKarti
        kapsam="tedarikçiden gelen ürünlerin tamamı"
        kutular={[
          { ad: "Tedarik ürünü", deger: sayiYaz(tedarikUrun), alt: `${sayiYaz(tedarikVaryant)} varyant` },
          {
            ad: "Yayında",
            deger: sayiYaz(tedarikYayinda),
            oran: oranYaz(tedarikYayinda, tedarikUrun),
            alt: tedarikUrun ? `${sayiYaz(tedarikUrun)} ürünün ${yuzdeEkli(oranYaz(tedarikYayinda, tedarikUrun) ?? 0)} vitrinde` : "—",
          },
          {
            /* Tedarikçi stoğu tampon değerin altına düşünce ürün satışa
               kapanıyor; bu sayı o kapananların toplamı. */
            ad: "Satılamaz varyant",
            deger: sayiYaz(tedarikSatilamaz),
            oran: oranYaz(tedarikSatilamaz, tedarikVaryant),
            alt: "stoğu bitmiş · stoksuz satışı kapalı",
            ton: tedarikSatilamaz ? "uyari" : undefined,
          },
          {
            ad: "Maliyeti eksik",
            deger: sayiYaz(tedarikMaliyetsiz),
            oran: oranYaz(tedarikMaliyetsiz, tedarikVaryant),
            alt: "alış fiyatı yok · kâr ve fiyat kuralı işlemez",
            ton: tedarikMaliyetsiz ? "uyari" : undefined,
          },
        ]}
        gruplar={[
          {
            /* Bu sayı tedarikçinin SON EŞİTLEMEDE bildirdiği ürün
               sayısı; üstteki "Tedarik ürünü" ise bizim katalogdaki
               (akıştan düşmüş eski ürünler de içeride). İkisi farklı
               şeyi ölçtüğü için başlık da farklı. */
            baslik: "Son eşitlemede gelen",
            satirlar: (suppliers ?? []).map((supplier) => ({
              ad: supplier.name,
              adet: supplier.sync_total ?? 0,
              etiket: (supplier.sync_total ?? 0).toLocaleString("tr-TR"),
            })),
          },
        ]}
      />
      </div>
    </main>
  );
}

/* Render dışında: bileşen içinde saf olmayan çağrı yapılmasın. */
function saat() {
  return Date.now();
}

/**
 * Satış fiyatı önizlemesi.
 *
 * İçe aktarma kodundaki hesabın aynısı; yönetici kuralı
 * değiştirmeden önce sonucu görebilsin.
 */
function previewPrice(cost: number, margin: number, shipping: number, round: number, service = 0) {
  const raw = ((cost + service) * (100 + margin)) / 100 + shipping;
  if (!round || round <= 0) return Math.round(raw);
  return Math.ceil((raw - round) / 100) * 100 + round;
}
