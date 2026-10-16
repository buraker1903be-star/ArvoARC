/*
  KAYDEDİLMİŞ GÖRÜNÜMLER — süzgeç birleşiminin adı.

  Panelde günlük iş hep aynı birkaç süzgeçle yapılıyor: "bugün onay
  bekleyenler", "sorunlu kargolar", "taslak kalmış Tarzyeri ürünleri".
  Her sabah bunları yeniden kurmak üç ayrı tıklama; kimse de
  yer imine koymuyor çünkü adres satırı panelde görünmüyor.

  Görünüm, süzgeç birleşiminin KAYDEDİLMİŞ ADI. Tek tıkla dönülüyor ve
  salonun tüm ekibi aynı görünümü kullanıyor.

  BU DOSYA NEDEN VAR. Süzgeç seçenekleri (durumlar, dönemler,
  kaynaklar) eskiden sayfaların içinde duruyordu. Görünüm, kaydedilen
  sorgunun GEÇERLİ olduğunu doğrulamak zorunda; doğrulama listesi
  ikinci bir kopya olsaydı sayfaya yeni bir durum eklendiğinde görünüm
  onu tanımamaya devam ederdi. Seçenekler buraya alındı, sayfalar
  buradan okuyor.

  GÜVENLİK. Kaydedilen sorgu kullanıcıdan geliyor ama OLDUĞU GİBİ
  SAKLANMIYOR: yazarken parçalarına ayrılıp yalnızca tanınan anahtar ve
  değerlerden yeniden kuruluyor (gorunumSorgusu). Yani veritabanındaki
  metin her zaman bu dosyanın ürettiği bir metin; paylaşılan bir
  görünüme tuhaf bir parametre iliştirip ekip arkadaşına tıklatmak
  mümkün değil. Sayfa ayrıca adresten geleni eskisi gibi kendi
  denetliyor — bu ikinci kat, birincinin yerine geçmiyor.

  Saf dosya; testi tests/kayitli-gorunum.test.ts.
*/

export type GorunumListesi = "siparisler" | "urunler" | "iadeler" | "indirimler" | "musteriler";

/** [anahtar, kısa etiket] ya da [anahtar, kısa etiket, uzun etiket]. */
type Secenek = readonly [string, string] | readonly [string, string, string];

export const SIPARIS_DURUMLARI = [
  ["all", "Tümü"],
  ["pending", "Bekliyor"],
  ["confirmed", "Onaylandı"],
  ["processing", "Hazırlanıyor"],
  ["fulfilled", "Tamamlandı"],
  ["cancelled", "İptal"],
  ["refunded", "İade"],
] as const satisfies readonly Secenek[];

export const SIPARIS_DONEMLERI = [
  ["all", "Tümü", "Tüm zamanlar"],
  ["today", "Bugün", "Bugün"],
  ["7", "7 gün", "Son 7 gün"],
  ["30", "30 gün", "Son 30 gün"],
] as const satisfies readonly Secenek[];

/*
  İade durumları. Sipariş durumlarından ayrı bir liste: iade kendi
  akışında yürüyor (bekleyen → ürün bekleniyor → iade edildi) ve
  siparişin durumuyla aynı şey değil.
*/
export const IADE_DURUMLARI = [
  ["all", "Tümü"],
  ["beklemede", "Bekleyenler", "Karar bekleyenler"],
  ["onaylandi", "Ürün bekleniyor", "Onaylandı · ürün bekleniyor"],
  ["tamamlandi", "İade edilenler"],
  ["reddedildi", "Reddedilenler"],
] as const satisfies readonly Secenek[];

export const URUN_DURUMLARI = [
  ["all", "Tümü"],
  ["active", "Aktif"],
  ["draft", "Taslak"],
  ["archived", "Arşiv"],
] as const satisfies readonly Secenek[];

export const URUN_KAYNAKLARI = [
  ["all", "Tüm kaynaklar"],
  ["own", "Kendi ürünlerimiz"],
  ["tarzyeri", "Tarzyeri"],
] as const satisfies readonly Secenek[];

/*
  İndirim durumları. "expired" kısıtta var ama durumu oraya çeken bir
  iş yok (süresi geçmiş kural "active" kalıyor); süzgece koymak, hiç
  dolmayan bir sekme çizmek olurdu. Süresi geçmişler şeritte AYRI bir
  sütun olarak, tarihe bakılarak sayılıyor.
*/
export const INDIRIM_DURUMLARI = [
  ["all", "Tümü"],
  ["active", "Aktif"],
  ["paused", "Duraklatıldı"],
  ["draft", "Taslak"],
] as const satisfies readonly Secenek[];

export const INDIRIM_TURLERI = [
  ["all", "Tüm türler"],
  ["kupon", "Kupon kodlu", "Kupon kodlu kampanyalar"],
  ["otomatik", "Otomatik", "Koşul sağlanınca uygulanan"],
] as const satisfies readonly Secenek[];

/*
  Müşteri segmentleri ve sıralama. Müşteri kaydı siparişlerden
  türüyor; segment bir DURUM değil, hesaplanmış bir ölçüt
  (musteriler/customer-data.ts).
*/
export const MUSTERI_SEGMENTLERI = [
  ["all", "Tümü"],
  ["repeat", "Tekrarlayan", "Tekrar eden müşteriler"],
  ["new", "Yeni", "Son 30 günde ilk siparişi"],
  ["risk", "Uzun süredir yok", "Son siparişi 120 günden eski"],
  ["single", "Tek sipariş", "Tek siparişi olanlar"],
] as const satisfies readonly Secenek[];

export const MUSTERI_SIRALAMALARI = [
  ["spent", "Harcama", "Harcamaya göre"],
  ["orders", "Sipariş", "Sipariş sayısına göre"],
  ["recent", "Son sipariş", "Son siparişe göre"],
] as const satisfies readonly Secenek[];

type Alan =
  | { anahtar: string; tur: "metin"; onek: string }
  | { anahtar: string; tur: "secim"; secenekler: readonly Secenek[]; varsayilan: string }
  | { anahtar: string; tur: "bayrak"; deger: string; etiket: string };

/*
  Anahtar sırası SABİT: özet metni ve karşılaştırma bu sıraya dayanıyor.
  Aynı süzgeç iki farklı sırayla yazıldığında iki ayrı görünüm gibi
  görünmesin diye sorgu her zaman buradan yeniden kuruluyor.

  "page" BİLEREK YOK: görünüm bir süzgeç, sayfa numarası değil. Kayıtlı
  bir görünümün üçüncü sayfada açılması, kaydedildiği gün oradaydı
  demekten başka bir şey anlatmazdı.
*/
const SEMA: Record<GorunumListesi, readonly Alan[]> = {
  siparisler: [
    { anahtar: "q", tur: "metin", onek: "Arama" },
    { anahtar: "filter", tur: "secim", secenekler: SIPARIS_DURUMLARI, varsayilan: "all" },
    { anahtar: "kargo", tur: "bayrak", deger: "sorunlu", etiket: "Sorunlu kargo" },
    { anahtar: "arsiv", tur: "bayrak", deger: "1", etiket: "Arşiv" },
    { anahtar: "period", tur: "secim", secenekler: SIPARIS_DONEMLERI, varsayilan: "all" },
  ],
  urunler: [
    { anahtar: "q", tur: "metin", onek: "Arama" },
    { anahtar: "filter", tur: "secim", secenekler: URUN_DURUMLARI, varsayilan: "all" },
    { anahtar: "source", tur: "secim", secenekler: URUN_KAYNAKLARI, varsayilan: "all" },
  ],
  indirimler: [
    { anahtar: "q", tur: "metin", onek: "Arama" },
    { anahtar: "filter", tur: "secim", secenekler: INDIRIM_DURUMLARI, varsayilan: "all" },
    { anahtar: "tur", tur: "secim", secenekler: INDIRIM_TURLERI, varsayilan: "all" },
    { anahtar: "biten", tur: "bayrak", deger: "1", etiket: "Süresi geçmiş" },
  ],
  musteriler: [
    { anahtar: "q", tur: "metin", onek: "Arama" },
    { anahtar: "segment", tur: "secim", secenekler: MUSTERI_SEGMENTLERI, varsayilan: "all" },
    { anahtar: "sort", tur: "secim", secenekler: MUSTERI_SIRALAMALARI, varsayilan: "spent" },
  ],
  iadeler: [
    { anahtar: "q", tur: "metin", onek: "Arama" },
    { anahtar: "filter", tur: "secim", secenekler: IADE_DURUMLARI, varsayilan: "beklemede" },
    { anahtar: "period", tur: "secim", secenekler: SIPARIS_DONEMLERI, varsayilan: "all" },
  ],
};

/*
  LİSTENİN ADRESİ. Görünüm adı ile yol çoğu listede aynı ("urunler" →
  /urunler) ama iadeler siparişlerin ALTINDA duruyor. Yolu adından
  türetmek, kaydedilmiş her iade görünümünü var olmayan bir /iadeler
  adresine götürürdü.
*/
const YOLLAR: Record<GorunumListesi, string> = {
  siparisler: "/siparisler",
  urunler: "/urunler",
  iadeler: "/siparisler/iadeler",
  indirimler: "/indirimler",
  musteriler: "/musteriler",
};

export const GORUNUM_LISTELERI = Object.keys(SEMA) as GorunumListesi[];

/** Bir listede kaç görünüm tutulabilir: çip şeridi tek satırda kalmalı. */
export const EN_FAZLA_GORUNUM = 12;

export const gorunumListesiMi = (deger: unknown): deger is GorunumListesi =>
  typeof deger === "string" && (GORUNUM_LISTELERI as string[]).includes(deger);

/*
  Arama metni PostgREST `or` süzgecine giriyor; virgül, parantez ve
  tırnak süzgeç sözdiziminin parçası. Boşluklar da tekleniyor: "kırmızı
   elbise" ile "kırmızı elbise" aynı görünüm sayılsın.
*/
const metniTemizle = (ham: string) =>
  ham.replace(/[,()*\\"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

type Kaynak = string | URLSearchParams | Record<string, string | string[] | undefined>;

function parametreler(ham: Kaynak): URLSearchParams {
  if (ham instanceof URLSearchParams) return ham;
  if (typeof ham === "string") return new URLSearchParams(ham.startsWith("?") ? ham.slice(1) : ham);
  const cikti = new URLSearchParams();
  for (const [anahtar, deger] of Object.entries(ham)) {
    const tek = Array.isArray(deger) ? deger[0] : deger;
    if (typeof tek === "string") cikti.set(anahtar, tek);
  }
  return cikti;
}

/**
 * Sorguyu yalnızca tanınan anahtar ve değerlerden yeniden kurar.
 * Varsayılan değerler ve bilinmeyen anahtarlar düşer; çıktı her zaman
 * aynı sırada, yani iki eşdeğer süzgeç aynı metni verir.
 */
export function gorunumSorgusu(liste: GorunumListesi, ham: Kaynak): string {
  const gelen = parametreler(ham);
  const cikti = new URLSearchParams();
  for (const alan of SEMA[liste]) {
    const deger = gelen.get(alan.anahtar);
    if (deger == null) continue;
    if (alan.tur === "metin") {
      const temiz = metniTemizle(deger);
      if (temiz) cikti.set(alan.anahtar, temiz);
    } else if (alan.tur === "secim") {
      if (deger !== alan.varsayilan && alan.secenekler.some(([anahtar]) => anahtar === deger)) cikti.set(alan.anahtar, deger);
    } else if (deger === alan.deger) {
      cikti.set(alan.anahtar, alan.deger);
    }
  }
  return cikti.toString();
}

/** Görünümün insan okunur özeti: çipin başlığı ve önerilen ad. */
export function gorunumOzeti(liste: GorunumListesi, sorgu: string): string {
  const gelen = new URLSearchParams(gorunumSorgusu(liste, sorgu));
  const parcalar: string[] = [];
  for (const alan of SEMA[liste]) {
    const deger = gelen.get(alan.anahtar);
    if (deger == null) continue;
    if (alan.tur === "metin") parcalar.push(`${alan.onek}: “${deger}”`);
    else if (alan.tur === "secim") {
      const secenek = alan.secenekler.find(([anahtar]) => anahtar === deger);
      if (secenek) parcalar.push(secenek[2] ?? secenek[1]);
    } else parcalar.push(alan.etiket);
  }
  return parcalar.join(" · ");
}

/** Görünümün açtığı adres. Sorgu boşsa listenin kendisi. */
export function gorunumYolu(liste: GorunumListesi, sorgu: string): string {
  const temiz = gorunumSorgusu(liste, sorgu);
  const yol = YOLLAR[liste];
  return temiz ? `${yol}?${temiz}` : yol;
}

/*
  Ad tek satır kalıyor: satır sonu ve sekme çipin yüksekliğini
  bozuyordu, art arda boşluklar da aynı adın iki farklı yazımını
  üretip "bu ad zaten var" denetimini boşa çıkarıyordu.
*/
export const gorunumAdi = (ham: unknown): string =>
  String(ham ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
