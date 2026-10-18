import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { createServiceClient } from "@/lib/paytr/service-client";
import { Pencere } from "@/components/os/pencere";
import { IstatistikKarti } from "@/components/arvo-ui/istatistik-karti";
import { createGiftCard, deleteGiftCard, toggleGiftCard } from "./actions";
import { ConfirmSubmit } from "@/components/panel/confirm-submit";
import "@/components/arvo-ui/k-ui";
import "@/components/arvo-ui/crm.css";
import "@/components/arvo-ui/kayit-detay.css";
import "../../modules.css";
import "../indirimler.css";
import "./hediye-cekleri.css";

/*
  HEDİYE ÇEKLERİ.

  Çekler bugüne kadar YALNIZCA SQL'den tanımlanabiliyordu
  (`arc_gift_card_issue`); yani para yaratan bir işlem için
  veritabanı erişimi gerekiyordu ve kimin ne zaman çek bastığı
  hiçbir ekranda görünmüyordu.

  OKUMA SERVİS ANAHTARIYLA. `arc_gift_cards` RLS açık ve
  POLİTİKASIZ: tabloya çağıranın yetkisiyle gelen hiç kimse bir
  şey görmemeli (müşterinin okuması ayrı bir SECURITY DEFINER
  fonksiyondan geçiyor). Mağaza kapsamı bu yüzden SORGUDA ve
  requireTenant'tan geliyor.
*/

export const dynamic = "force-dynamic";

/* Render dışında: bileşen içinde saf olmayan çağrı yapılmasın
   (lint react-hooks/purity) — indirimler sayfasındaki aynı kalıp. */
function simdi() {
  return Date.now();
}

const para = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
/* Dilim tek satırda: denetim biçimlendiriciyi satır satır arıyor. */
const tarih = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" });

type Cek = {
  id: string;
  code: string;
  initial_amount: number;
  balance: number;
  status: string;
  recipient_email: string | null;
  recipient_name: string | null;
  minimum_subtotal: number | null;
  expires_at: string | null;
  created_at: string;
  note: string | null;
};

export default async function HediyeCekleri({
  searchParams,
}: {
  /* `eposta` ve `ad`: müşteri detayından gelindiğinde form
     önceden dolsun — operasyoncu e-postayı elle yazarken yanlış
     yazarsa çek müşteriye HİÇ görünmez. */
  searchParams: Promise<{ pencere?: string; eposta?: string; ad?: string }>;
}) {
  const { organization, membership } = await requireTenant();
  const yonetebilir = ["owner", "admin", "manager"].includes(membership.role);
  const { pencere, eposta, ad } = await searchParams;

  const servis = createServiceClient();
  const { data, error } = await servis
    .from("arc_gift_cards")
    .select(
      "id, code, initial_amount, balance, status, recipient_email, recipient_name, minimum_subtotal, expires_at, created_at, note",
    )
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error("Hediye çekleri okunamadı: " + error.message);
  const cekler = (data ?? []) as Cek[];

  const an = simdi();
  const suresiDolmus = (cek: Cek) =>
    cek.expires_at !== null && Date.parse(cek.expires_at) < an;

  /*
    Sayılar LİSTEDEN hesaplanıyor ve liste 200 satırla sınırlı.
    İndirimler ekranında aynı kalıp sessizce eksik sayıya yol
    açmıştı; burada kapsam yazıyor ve sınır aşılırsa söyleniyor.
  */
  const yuklenen = cekler.reduce((t, c) => t + c.initial_amount, 0);
  const kalan = cekler.reduce((t, c) => t + c.balance, 0);
  const acik = cekler.filter(
    (c) => c.status === "active" && c.balance > 0 && !suresiDolmus(c),
  ).length;

  return (
    <main className="panel-main">
      <header className="panel-head">
        <div>
          <h1>Hediye çekleri</h1>
          <p>
            Çek bir indirim değil, bakiyedir: müşteri yine kartla ya da
            havaleyle öder, yalnızca daha azını.
          </p>
        </div>
        {yonetebilir ? (
          <Link
            prefetch={false}
            scroll={false}
            className="panel-primary"
            href="/indirimler/hediye-cekleri?pencere=yeni"
          >
            Yeni hediye çeki
          </Link>
        ) : null}
      </header>

      {cekler.length === 0 ? (
        <div className="crm-empty-state talep-bos-kutu">
          <h2>Henüz hediye çeki yok</h2>
          <p>
            Çek tanımladığınızda müşteri hesabında görünür ve ödeme
            adımında seçebilir. Kod, çekin sahibi olan e-postaya
            bağlanır.
          </p>
        </div>
      ) : (
        <div className="cek-duzen">
          <section className="panel-card">
            <table className="crm-data-table cek-tablo">
              <thead>
                <tr>
                  <th>Kod</th>
                  <th>Kalan</th>
                  <th>Sahibi</th>
                  <th>Koşul</th>
                  <th>Durum</th>
                  {yonetebilir ? <th aria-label="İşlem" /> : null}
                </tr>
              </thead>
              <tbody>
                {cekler.map((cek) => {
                  const dolmus = suresiDolmus(cek);
                  const bitti = cek.balance <= 0;
                  const kapali = cek.status !== "active";
                  /*
                    Harcanmış çek SİLİNEMEZ: kütük kaydı cascade ile
                    gider ve "bu para nereye gitti" sorusu yanıtsız
                    kalır. Bakiye yüklenenden küçükse harcama olmuş
                    demektir — bakiye yalnızca siparişte düşüyor.
                    Sunucu ayrıca kütüğe bakıyor; buradaki ölçüt
                    düğmeyi göstermek için.
                  */
                  const kullanilmis = cek.balance < cek.initial_amount;
                  return (
                    <tr key={cek.id} data-pasif={kapali || dolmus || bitti ? "" : undefined}>
                      <td>
                        <b className="cek-kod">{cek.code}</b>
                        {cek.note ? <small>{cek.note}</small> : null}
                      </td>
                      <td>
                        <b>{para.format(cek.balance / 100)}</b>
                        {/* Yüklenen tutar yalnızca harcama olduysa
                            yazıyor; aynı iki sayıyı yan yana koymak
                            kafa karıştırıyordu. */}
                        {cek.balance < cek.initial_amount ? (
                          <small>{para.format(cek.initial_amount / 100)} yüklendi</small>
                        ) : null}
                      </td>
                      <td>
                        {cek.recipient_name ? <span>{cek.recipient_name}</span> : null}
                        <small>{cek.recipient_email ?? "— (kimseye bağlı değil)"}</small>
                      </td>
                      <td>
                        {cek.minimum_subtotal && cek.minimum_subtotal > 0 ? (
                          <small>{para.format(cek.minimum_subtotal / 100)} ve üzeri</small>
                        ) : (
                          <small>Koşulsuz</small>
                        )}
                        {cek.expires_at ? (
                          <small>Son: {tarih.format(new Date(cek.expires_at))}</small>
                        ) : null}
                      </td>
                      <td>
                        <span className="cek-rozet" data-durum={kapali ? "kapali" : dolmus ? "dolmus" : bitti ? "bitti" : "acik"}>
                          {kapali ? "Kapalı" : dolmus ? "Süresi doldu" : bitti ? "Tükendi" : "Açık"}
                        </span>
                      </td>
                      {yonetebilir ? (
                        <td>
                          {/*
                            SİLME YOK: silmek kütükteki hareketleri de
                            götürürdü ve "bu para nereye gitti" sorusu
                            yanıtsız kalırdı. Kapatılan çek ödemede
                            geçmiyor ama geçmişi duruyor.
                          */}
                          <div className="cek-eylemler">
                            <form action={toggleGiftCard}>
                              <input type="hidden" name="id" value={cek.id} />
                              <input
                                type="hidden"
                                name="next_status"
                                value={kapali ? "active" : "disabled"}
                              />
                              <button className="panel-secondary" type="submit">
                                {kapali ? "Aç" : "Kapat"}
                              </button>
                            </form>

                            {/*
                              SİLME YALNIZCA HİÇ KULLANILMAMIŞ ÇEKTE.
                              Yanlış tanımlanan çekte (kod hatası, fazla
                              sıfır) "kapat" yanlış cevap: ortada
                              kapatılacak bir şey değil, OLMAMASI gereken
                              bir kayıt var.
                            */}
                            {kullanilmis ? null : (
                              <form action={deleteGiftCard}>
                                <input type="hidden" name="id" value={cek.id} />
                                <ConfirmSubmit
                                  className="panel-secondary cek-sil"
                                  message={`“${cek.code}” kalıcı olarak silinsin mi?\n\n${para.format(cek.initial_amount / 100)} tutarındaki bu çek hiç kullanılmamış.\n\nBu işlem geri alınamaz.`}
                                >
                                  Sil
                                </ConfirmSubmit>
                              </form>
                            )}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <IstatistikKarti
            kapsam={cekler.length >= 200 ? "son 200 çek" : "bütün çekler"}
            kutular={[
              { ad: "Açık çek", deger: acik.toLocaleString("tr-TR"), alt: "bakiyesi olan ve geçerli" },
              { ad: "Kalan bakiye", deger: para.format(kalan / 100), alt: "müşterilerin elinde" },
              { ad: "Yüklenen", deger: para.format(yuklenen / 100), alt: "bugüne kadar tanımlanan" },
              {
                ad: "Harcanan",
                deger: para.format((yuklenen - kalan) / 100),
                alt: "siparişlerde kullanılan",
              },
            ]}
            gruplar={[
              {
                baslik: "Duruma göre",
                satirlar: [
                  { ad: "Açık", adet: acik },
                  {
                    ad: "Tükendi",
                    adet: cekler.filter((c) => c.balance <= 0).length,
                  },
                  {
                    ad: "Süresi doldu",
                    adet: cekler.filter(suresiDolmus).length,
                  },
                  {
                    ad: "Kapalı",
                    adet: cekler.filter((c) => c.status !== "active").length,
                  },
                ],
              },
            ]}
          />
        </div>
      )}

      {pencere && yonetebilir ? (
        <Pencere
          key="yeni"
          ust="Hediye çekleri"
          baslik="Yeni hediye çeki"
          kapatAdresi="/indirimler/hediye-cekleri"
        >
          <p className="indirim-pencere-alt">
            Kod, e-postası girilen müşterinin hesabında görünür. Alıcı
            boş bırakılırsa çek hiçbir hesapta listelenmez.
          </p>
          <form action={createGiftCard}>
            <input type="hidden" name="back" value="/indirimler/hediye-cekleri" />
            <div className="form-gruplari">
              <section>
                <h4>Ne veriyor</h4>
                <div className="discount-form-grid">
                  <label>
                    Kod
                    <input
                      name="code"
                      required
                      minLength={4}
                      maxLength={40}
                      placeholder="ARVO-HEDIYE-500"
                    />
                  </label>
                  <label>
                    Tutar (TL)
                    <input name="amount" required inputMode="decimal" placeholder="500,00" />
                  </label>
                </div>
              </section>

              <section>
                <h4>Hangi koşulla</h4>
                <div className="discount-form-grid">
                  <label>
                    Asgari sepet tutarı (TL)
                    <input name="minimum_subtotal" inputMode="decimal" placeholder="0,00" />
                    {/* Kural kupondakiyle aynı: ölçüt sepetin ARA
                        TOPLAMI, kupon düşülmüş tutar değil. */}
                    <small>Boş ya da 0 ise her sepette geçerli.</small>
                  </label>
                  <label>
                    Son kullanım
                    <input name="expires_at" type="datetime-local" />
                    <small>Boş bırakılırsa süresiz.</small>
                  </label>
                </div>
              </section>

              <section>
                <h4>Kime</h4>
                <div className="discount-form-grid">
                  <label>
                    Alıcı e-postası
                    <input
                      name="recipient_email"
                      type="email"
                      maxLength={160}
                      placeholder="musteri@ornek.com"
                      defaultValue={eposta ?? ""}
                    />
                    <small>Çek bu hesapta görünür.</small>
                  </label>
                  <label>
                    Alıcı adı
                    <input name="recipient_name" maxLength={160} defaultValue={ad ?? ""} />
                  </label>
                  <label className="wide">
                    Not (yalnızca panelde görünür)
                    <input name="note" maxLength={400} placeholder="Örn. kampanya hediyesi" />
                  </label>
                </div>
              </section>
            </div>

            <div className="kaydet-serit">
              <span>
                Çek tanımlandığı anda para yaratılır; bakiye kütüğe
                yazılır ve harcandıkça oradan izlenir.
              </span>
              <button className="panel-primary" type="submit">
                Hediye çekini tanımla
              </button>
            </div>
          </form>
        </Pencere>
      ) : null}
    </main>
  );
}
