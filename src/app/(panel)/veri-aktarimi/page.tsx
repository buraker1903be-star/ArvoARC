import { requireTenant } from "@/lib/tenant";
import { KKart, KListe, KOge } from "@/components/arvo-ui/k-ui";
import { rozetTonu } from "@/lib/rozet-tonu";
import { importActiveProducts, importHistoricalOrders, migrateShopifyImages } from "./actions";
import { importKindLabel, importStatusLabel } from "@/lib/commerce-labels";
import "../modules.css";
import "@/components/arvo-ui/kayit-detay.css";
import "./veri-aktarimi.css";

/*
  LR taraması bu sayfanın sunucu işleminden çalışıyor ve onlarca sayfa
  geziyor; varsayılan süre sınırı taramayı ortasında kesiyordu.
*/
export const maxDuration = 60;
import { MaliyetAktarimi } from "./maliyet-aktarimi";

const dateTime = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });


const statusTone = (status: string) => (status === "completed" ? undefined : status === "failed" ? "bad" : status === "processing" ? "warn" : "muted");

export default async function ImportPage() {
  const { supabase, organization, membership } = await requireTenant();
  const { data: batches, error } = await supabase
    .from("arc_import_batches")
    .select("id,kind,file_name,status,total_rows,imported_rows,skipped_rows,error_rows,created_at")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  const canManage = ["owner", "admin", "manager"].includes(membership.role);

  /* ArvoOS kalıbı (16.10.2026): başlık, panel kartları, geçmiş iOS listesinde. */
  return <main className="talep veri-aktarimi">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">Tedarik</small>
        <h1>Veri aktarımı</h1>
        <p className="talep-bas-alt">Alış fiyatı, Shopify arşivinden ürün, sipariş ve görsel aktarımı.</p>
      </div>
    </header>

    <div className="ac-stack">

      {/*
        Alış fiyatı aktarımı en üstte: kâr hesabının dayandığı veri bu
        ve LR gibi tedarikçilerde başka yolu yok — portal fiyat listesi
        indirmiyor, otomatik kazıma ise şifre saklamayı gerektirir ve
        sayfa değişince sessizce yanlış fiyat çeker.
      */}
      {canManage ? <MaliyetAktarimi /> : null}

      <div className="import-grid">
        <section className="panel-card import-card">
          <div className="ac-head"><div><h3>Aktif ürünler</h3><p>Tek seferlik katalog aktarımı</p></div></div>
          <p>Yalnızca Shopify CSV’de <b>Status = active</b> olan ürünler alınır; taslak ve arşivlenmişler atlanır. Varyantlar, fiyatlar ve seçenekler korunur. Stok 0 başlar, stoksuz satış açık gelir.</p>
          {canManage ? (
            <form action={importActiveProducts} className="import-form">
              <label>Shopify Products CSV<input name="file" type="file" accept=".csv,text/csv" required /></label>
              <button className="panel-primary" type="submit">Aktif ürünleri aktar</button>
            </form>
          ) : null}
        </section>

        <section className="panel-card import-card">
          <div className="ac-head"><div><h3>Geçmiş siparişler</h3><p>Stok miktarlarını etkilemez</p></div></div>
          <p>Shopify Orders CSV’deki eski siparişleri, müşteri bilgilerini ve kalemleri aktarır. Tarihsel kayıt olduğu için mevcut stoktan yeniden düşüm yapılmaz.</p>
          {canManage ? (
            <form action={importHistoricalOrders} className="import-form">
              <label>Shopify Orders CSV<input name="file" type="file" accept=".csv,text/csv" required /></label>
              <button className="panel-primary" type="submit">Eski siparişleri aktar</button>
            </form>
          ) : null}
        </section>

        <section className="panel-card import-card">
          <div className="ac-head"><div><h3>Görselleri taşı</h3><p>Shopify CDN bağını kaldırır</p></div></div>
          <p>Shopify ürün görsellerini ArvoARC depolamasına kopyalar. Zaman aşımını önlemek için her çalıştırmada 5 ürün taşınır; kalan sayısı işlem sonunda gösterilir.</p>
          {canManage ? (
            <form action={migrateShopifyImages} className="import-form">
              <button className="panel-primary" type="submit">Sonraki görsel grubunu taşı</button>
            </form>
          ) : null}
        </section>
      </div>

      <KKart baslik="Aktarım geçmişi" aciklama="Son 20 işlem">
        {batches?.length ? (
          <KListe>
            {batches.map((batch) => (
              <KOge
                key={batch.id}
                baslik={batch.file_name ?? "Shopify CSV"}
                alt={`${importKindLabel(batch.kind)} · ${dateTime.format(new Date(batch.created_at))} · ${((batch.skipped_rows ?? 0) + (batch.error_rows ?? 0)).toLocaleString("tr-TR")} atlanan`}
                durum={{ etiket: importStatusLabel(batch.status), ton: rozetTonu(statusTone(batch.status) ?? "good") }}
                deger={(batch.imported_rows ?? 0).toLocaleString("tr-TR")}
                degerAlt={`/ ${(batch.total_rows ?? 0).toLocaleString("tr-TR")} satır`}
              />
            ))}
          </KListe>
        ) : <div className="crm-empty-state talep-bos-kutu"><h2>Henüz kayıtlı aktarım yok</h2><p>İlk aktif ürün kataloğu aktarımı burada görünecek.</p></div>}
      </KKart>
    </div>
  </main>;
}
