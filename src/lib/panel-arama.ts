import type { SupabaseClient } from "@supabase/supabase-js";
import { orderBadge, productStatusLabel } from "./commerce-labels";

/*
  PANEL GENELİ ARAMA — tek kaynak.

  Sipariş, müşteri, ürün ve koleksiyon aynı terimle aranıyor. Mantık
  buraya alındı çünkü iki yerden çağrılıyor: /ara sayfası ve ⌘K komut
  paleti. İkinci bir kopya yazmak, birinde düzeltilen bir sorgunun
  ötekinde eskimesi demekti — bu projede bugün tam olarak o kusuru iki
  kez temizledik (fiyat doğrulaması ve boşluk ölçeği).

  Terim PostgREST filtresine yazıldığı için filtre sözdiziminin
  parçaları (virgül, parantez, joker, kaçış) TEMİZLENİYOR: "or(...)"
  ifadesine kullanıcı metni giriyor ve bunlar sorgunun anlamını
  değiştirebilir.

  Müşteriler ayrı tabloda DEĞİL: siparişlerden türetiliyor ve anahtar
  müşteri listesindekiyle aynı (e-posta, yoksa ada dayalı) — iki ekranın
  aynı kişiyi aynı adreste göstermesi için.
*/

export type AramaTuru = "siparis" | "musteri" | "urun" | "koleksiyon";

export type AramaSonucu = {
  tur: AramaTuru;
  /** Liste içinde benzersiz; React anahtarı olarak da kullanılıyor. */
  anahtar: string;
  yol: string;
  baslik: string;
  detay: string;
  /** Rozet metni ve tonu; ekran onu kendi bileşeninde çiziyor. */
  rozet?: { metin: string; ton?: string };
  /** Sipariş tutarı gibi sağda duran ikincil metin. */
  yan?: string;
};

export type AramaCiktisi = {
  terim: string;
  siparisler: AramaSonucu[];
  musteriler: AramaSonucu[];
  urunler: AramaSonucu[];
  koleksiyonlar: AramaSonucu[];
  /** Sipariş sayısı sınırı aştıysa "tümünde ara" bağlantısı için. */
  dahaFazlaSiparis: boolean;
  toplam: number;
};

const para = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const kisaTarih = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" });

/** PostgREST filtresine güvenle yazılabilir hâle getirir. */
export const terimiTemizle = (ham: string | undefined | null) =>
  String(ham ?? "").replace(/[,()*\\"%_]/g, " ").trim().slice(0, 80);

export async function panelAra(
  supabase: SupabaseClient,
  organizationId: string,
  hamTerim: string,
  /* Palet dar bir liste gösteriyor, sayfa geniş: sınır çağırandan geliyor. */
  sinir: { siparis: number; musteri: number; urun: number; koleksiyon: number } = {
    siparis: 8,
    musteri: 6,
    urun: 10,
    koleksiyon: 5,
  },
): Promise<AramaCiktisi> {
  const terim = terimiTemizle(hamTerim);
  const bos: AramaCiktisi = { terim, siparisler: [], musteriler: [], urunler: [], koleksiyonlar: [], dahaFazlaSiparis: false, toplam: 0 };
  if (!terim) return bos;

  const like = `%${terim}%`;
  const [siparisSonuc, urunSonuc, skuSonuc, koleksiyonSonuc] = await Promise.all([
    supabase.from("arc_orders").select("id,order_number,customer_name,customer_email,total,status,payment_status,created_at").eq("organization_id", organizationId).or(`order_number.ilike.${like},customer_name.ilike.${like},customer_email.ilike.${like}`).order("created_at", { ascending: false }).limit(60),
    supabase.from("arc_products").select("id,name,status,metadata").eq("organization_id", organizationId).ilike("name", like).order("updated_at", { ascending: false }).limit(Math.max(8, sinir.urun)),
    supabase.from("arc_product_variants").select("product_id,sku").eq("organization_id", organizationId).ilike("sku", like).limit(20),
    supabase.from("arc_collections").select("id,title,slug,status").eq("organization_id", organizationId).ilike("title", like).order("title").limit(sinir.koleksiyon),
  ]);
  /* Hata YUTULMUYOR: boş sonuç döndürmek "kayıt yok" gibi okunurdu. */
  for (const sonuc of [siparisSonuc, urunSonuc, skuSonuc, koleksiyonSonuc]) {
    if (sonuc.error) throw new Error(sonuc.error.message);
  }

  /* SKU ile eşleşen ama adı eşleşmeyen ürünler de gösteriliyor. */
  const adEslesenler = urunSonuc.data ?? [];
  const skuyaGoreUrun = new Map((skuSonuc.data ?? []).map((satir) => [satir.product_id as string, satir.sku as string]));
  const eksikIdler = [...skuyaGoreUrun.keys()].filter((id) => !adEslesenler.some((urun) => urun.id === id)).slice(0, sinir.urun);
  const { data: skuUrunleri } = eksikIdler.length
    ? await supabase.from("arc_products").select("id,name,status,metadata").eq("organization_id", organizationId).in("id", eksikIdler)
    : { data: [] };
  const urunler = [...adEslesenler, ...(skuUrunleri ?? [])].slice(0, sinir.urun);

  const siparisler = siparisSonuc.data ?? [];
  const siparisSonuclari: AramaSonucu[] = siparisler.slice(0, sinir.siparis).map((siparis) => {
    const rozet = orderBadge(siparis.status, siparis.payment_status);
    return {
      tur: "siparis",
      anahtar: siparis.id,
      yol: `/siparisler/${siparis.id}`,
      baslik: `${siparis.order_number} · ${siparis.customer_name || siparis.customer_email || "Misafir müşteri"}`,
      detay: kisaTarih.format(new Date(siparis.created_at)),
      rozet: { metin: rozet.label, ton: rozet.tone },
      yan: para.format(siparis.total / 100),
    };
  });

  const aranan = terim.toLocaleLowerCase("tr-TR");
  const musteriler = new Map<string, { anahtar: string; ad: string; eposta: string; siparis: number }>();
  for (const siparis of siparisler) {
    const eposta = (siparis.customer_email ?? "").trim().toLocaleLowerCase("tr-TR");
    const ad = (siparis.customer_name ?? "").trim() || "İsimsiz müşteri";
    if (!ad.toLocaleLowerCase("tr-TR").includes(aranan) && !eposta.includes(aranan)) continue;
    const anahtar = eposta || `name:${ad.toLocaleLowerCase("tr-TR")}`;
    const kayit = musteriler.get(anahtar);
    if (kayit) kayit.siparis += 1;
    else musteriler.set(anahtar, { anahtar, ad, eposta, siparis: 1 });
  }
  const musteriSonuclari: AramaSonucu[] = [...musteriler.values()].slice(0, sinir.musteri).map((musteri) => ({
    tur: "musteri",
    anahtar: musteri.anahtar,
    yol: `/musteriler/${encodeURIComponent(musteri.anahtar)}`,
    baslik: musteri.ad,
    detay: musteri.eposta || "E-posta yok",
    yan: `${musteri.siparis}+ sipariş`,
  }));

  const urunSonuclari: AramaSonucu[] = urunler.map((urun) => {
    const meta = (urun.metadata ?? {}) as { vendor?: string };
    const sku = skuyaGoreUrun.get(urun.id);
    return {
      tur: "urun",
      anahtar: urun.id,
      yol: `/urunler/${urun.id}`,
      baslik: urun.name,
      detay: [sku ? `SKU ${sku}` : null, meta.vendor].filter(Boolean).join(" · ") || "Ürün",
      rozet: {
        metin: productStatusLabel(urun.status),
        ton: urun.status === "active" ? undefined : urun.status === "draft" ? "warn" : "muted",
      },
    };
  });

  const koleksiyonSonuclari: AramaSonucu[] = (koleksiyonSonuc.data ?? []).map((koleksiyon) => ({
    tur: "koleksiyon",
    anahtar: koleksiyon.id,
    yol: `/koleksiyonlar/${koleksiyon.id}`,
    baslik: koleksiyon.title,
    detay: `/${koleksiyon.slug}`,
    rozet: {
      metin: koleksiyon.status === "active" ? "Aktif" : koleksiyon.status === "draft" ? "Taslak" : "Arşiv",
      ton: koleksiyon.status === "active" ? undefined : "muted",
    },
  }));

  return {
    terim,
    siparisler: siparisSonuclari,
    musteriler: musteriSonuclari,
    urunler: urunSonuclari,
    koleksiyonlar: koleksiyonSonuclari,
    dahaFazlaSiparis: siparisler.length > sinir.siparis,
    toplam: siparisSonuclari.length + musteriSonuclari.length + urunSonuclari.length + koleksiyonSonuclari.length,
  };
}
