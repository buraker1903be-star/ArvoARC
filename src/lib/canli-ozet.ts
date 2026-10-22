import { kaynakAdi } from "@/lib/ziyaret-kaynagi";

/*
  CANLI EKRANIN ÖZETİ — SAF.

  Veri katmanı (analitik/canli/veri.ts) son yirmi dört saatin ziyaret
  satırlarını tek sorguda okuyor; bütün sayılar burada çıkarılıyor.
  AYRI DOSYA, çünkü ölçülen şey zamana bağlı eşikler (5 dakika, 1
  saat, 30 dakika) ve konuma göre toplama: Supabase'e bağlı bir
  dosyanın içinde kalsa hiçbiri test edilemezdi ve yanlış sayan bir
  ekran, sayı göstermeyen ekrandan kötüdür.

  `simdi` DIŞARIDAN: testin sahte bir an kurması için ve render
  içinde `Date.now()` çağırmamak için.
*/

export type ZiyaretSatiri = {
  path: string;
  product_slug: string | null;
  country: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  ip_hash: string | null;
  source: string | null;
  created_at: string;
};

export type Nokta = {
  lat: number;
  lon: number;
  city: string | null;
  country: string | null;
  /** O konumdaki ziyaret sayısı (nokta boyu buna göre). */
  adet: number;
  /** En YENİ ziyaretin yaşı: parlaklık ve dalga buna bakıyor. */
  dakika: number;
};

export type Olay = {
  zaman: string;
  /** "urun" vurgulu çiziliyor; gezinme sayfaları sade. */
  tur: "urun" | "sayfa";
  yol: string;
  kaynak: string;
  sehir: string | null;
  ulke: string | null;
};

export type CanliOzet = {
  noktalar: Nokta[];
  suAn: number;
  gunluk: number;
  sonSaatZiyaretci: number;
  sonSaatGoruntuleme: number;
  sonSaatUrun: number;
  akis: Olay[];
  acikSayfalar: Array<{ ad: string; adet: number }>;
  ulkeler: Array<{ ad: string; adet: number }>;
  sehirler: Array<{ ad: string; adet: number }>;
  kaynaklar: Array<{ ad: string; adet: number }>;
  /** Ürün slug sayımı; adları veri katmanı ekliyor. */
  urunSayimi: Array<{ ad: string; adet: number }>;
};

/** Akışta en çok kaç satır: kart kendi içinde kayıyor ama sınırsız
    bir liste her tazelemede ekranı kilitler. */
export const AKIS_SINIRI = 40;

/** En çok tekrar edenler; eşitlikte ada göre kararlı sıra. */
export function enCok<T extends string>(
  degerler: Array<T | null>,
  kac: number,
): Array<{ ad: T; adet: number }> {
  const sayac = new Map<T, number>();
  for (const deger of degerler) {
    if (!deger) continue;
    sayac.set(deger, (sayac.get(deger) ?? 0) + 1);
  }
  return [...sayac.entries()]
    .map(([ad, adet]) => ({ ad, adet }))
    .sort((a, b) => b.adet - a.adet || a.ad.localeCompare(b.ad, "tr"))
    .slice(0, kac);
}

/**
 * Satırlardan canlı ekranın bütün sayıları.
 *
 * Satırların YENİDEN ESKİYE geldiği varsayılıyor (sorgu öyle
 * sıralıyor); akış sırası buna dayanıyor. En yeni yaşı yine açıkça
 * `Math.min` ile alınıyor ki sıralama bir gün değişirse nokta
 * parlaklığı sessizce bozulmasın.
 */
export function canliOzet(satirlar: ZiyaretSatiri[], simdi: number): CanliOzet {
  const noktaHavuzu = new Map<string, Nokta>();
  const sonBesDakika = new Set<string>();
  const sonSaatKisi = new Set<string>();
  let sonSaatGoruntuleme = 0;
  let sonSaatUrun = 0;
  const akis: Olay[] = [];
  const acikYollar: Array<string | null> = [];

  for (const satir of satirlar) {
    const yas = (simdi - Date.parse(satir.created_at)) / 60000;
    const dakika = Math.max(0, Math.round(yas));

    if (yas <= 5) {
      if (satir.ip_hash) sonBesDakika.add(satir.ip_hash);
      acikYollar.push(satir.path);
    }
    if (yas <= 60) {
      if (satir.ip_hash) sonSaatKisi.add(satir.ip_hash);
      sonSaatGoruntuleme += 1;
      if (satir.product_slug) sonSaatUrun += 1;
    }
    if (yas <= 30 && akis.length < AKIS_SINIRI) {
      akis.push({
        zaman: satir.created_at,
        tur: satir.product_slug ? "urun" : "sayfa",
        yol: satir.path,
        kaynak: kaynakAdi(satir.source),
        sehir: satir.city,
        ulke: satir.country,
      });
    }

    /*
      NOKTALAR KONUMA GÖRE TOPLANIYOR, ziyaret başına bir nokta
      değil. Önceden her ziyaret ayrı bir benekti: İstanbul'dan gelen
      kırk ziyaret haritada tek koyu lekeye biniyor ve "kaç kişi"
      sorusunun yanıtı kayboluyordu.

      Haritada son bir saat: daha eskisi "canlı" değil, geçmiş.
    */
    if (yas <= 60 && satir.lat !== null && satir.lon !== null) {
      const anahtar = `${satir.lat},${satir.lon}`;
      const mevcut = noktaHavuzu.get(anahtar);
      if (mevcut) {
        mevcut.adet += 1;
        mevcut.dakika = Math.min(mevcut.dakika, dakika);
        /* Şehir adı bir satırda boş gelebiliyor; dolu olanı tutuyoruz. */
        mevcut.city ??= satir.city;
        mevcut.country ??= satir.country;
      } else {
        noktaHavuzu.set(anahtar, {
          lat: satir.lat,
          lon: satir.lon,
          city: satir.city,
          country: satir.country,
          adet: 1,
          dakika,
        });
      }
    }
  }

  return {
    noktalar: [...noktaHavuzu.values()],
    suAn: sonBesDakika.size,
    gunluk: satirlar.length,
    sonSaatZiyaretci: sonSaatKisi.size,
    sonSaatGoruntuleme,
    sonSaatUrun,
    akis,
    acikSayfalar: enCok(acikYollar, 8),
    ulkeler: enCok(
      satirlar.map((s) => s.country),
      6,
    ),
    sehirler: enCok(
      satirlar.map((s) => s.city),
      6,
    ),
    /*
      Ham kaynak ("l.instagram.com") okunabilir ada çevriliyor ÖNCE,
      sayım sonra: yoksa aynı platform üç ayrı satıra bölünürdü
      (lib/ziyaret-kaynagi).
    */
    kaynaklar: enCok(
      satirlar.map((s) => kaynakAdi(s.source)),
      6,
    ),
    urunSayimi: enCok(
      satirlar.map((s) => s.product_slug),
      8,
    ),
  };
}
