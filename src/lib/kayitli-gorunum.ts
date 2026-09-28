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

export type GorunumListesi = "siparisler" | "urunler";

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
    { anahtar: "period", tur: "secim", secenekler: SIPARIS_DONEMLERI, varsayilan: "all" },
  ],
  urunler: [
    { anahtar: "q", tur: "metin", onek: "Arama" },
    { anahtar: "filter", tur: "secim", secenekler: URUN_DURUMLARI, varsayilan: "all" },
    { anahtar: "source", tur: "secim", secenekler: URUN_KAYNAKLARI, varsayilan: "all" },
  ],
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
  return temiz ? `/${liste}?${temiz}` : `/${liste}`;
}

/*
  Ad tek satır kalıyor: satır sonu ve sekme çipin yüksekliğini
  bozuyordu, art arda boşluklar da aynı adın iki farklı yazımını
  üretip "bu ad zaten var" denetimini boşa çıkarıyordu.
*/
export const gorunumAdi = (ham: unknown): string =>
  String(ham ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
