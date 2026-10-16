/* Kaynak: ArvoOS/lib/gunluk-seri.ts (16.10.2026, ArvoARC paneli ArvoOS'un bileşenleriyle yeniden yazılıyor). */
/*
  Genel bakış grafiği için günlük seri: son N günün (bugün dahil) her
  gününe düşen kayıt sayısı ve bir önceki N günle kıyas.

  Ana ekran ve modül genel bakışları aynı grafiği kullanıyor
  (app/panel/os/genel-bakis.tsx). Gün sınırı Türkiye saatiyle: sunucu UTC'de
  çalıştığı için gece 00:00–03:00 arası kayıt yoksa bir önceki güne düşerdi
  (AGENTS.md: tarih Türkiye saatiyle).

  Saf fonksiyon: saat dışarıdan verilir (simdi), birim testi gunluk-seri.test.ts.
*/
const TZ = "Europe/Istanbul";
const GUN_MS = 24 * 60 * 60 * 1000;

const gunAnahtari = (deger: string | number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(deger));

export type SeriGunu = { key: string; count: number; day: string; title: string; isToday: boolean };
export type GunlukSeri = { days: SeriGunu[]; total: number; previous: number; today: number; max: number; delta: number | null };

/**
 * @param tarihler kaydın zamanı (ISO). Önceki dönem kıyası için en az
 *   2×gun gün geriye kadar olanlar verilmeli.
 * @param agirlik her kaydın sayıya katkısı (ör. tutar); verilmezse 1.
 */
/** Son `gun` günün boş dilimleri (bugün en sonda) ve gün→sıra indeksi. */
function dilimleriKur(simdi: number, gun: number) {
  const indeks = new Map<string, number>();
  const days: SeriGunu[] = Array.from({ length: gun }, (_, sira) => {
    const an = simdi - (gun - 1 - sira) * GUN_MS;
    const key = gunAnahtari(an);
    indeks.set(key, sira);
    return {
      key,
      count: 0,
      day: new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric" }).format(new Date(an)),
      title: new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(an)),
      isToday: sira === gun - 1,
    };
  });
  return { days, indeks };
}

/** Dilimler dolduktan sonraki özet alanları (iki girişte ortak). */
function seriOzeti(days: SeriGunu[], previous: number, gun: number): GunlukSeri {
  const total = days.reduce((toplam, g) => toplam + g.count, 0);
  return {
    days,
    total,
    previous,
    today: days[gun - 1].count,
    max: Math.max(1, ...days.map((g) => g.count)),
    delta: previous ? Math.round(((total - previous) / previous) * 100) : null,
  };
}

export function gunlukSeri(tarihler: string[], simdi: number, gun = 14, agirlik?: number[]): GunlukSeri {
  const { days, indeks } = dilimleriKur(simdi, gun);
  let previous = 0;
  tarihler.forEach((tarih, sira) => {
    if (!tarih) return;
    const katki = agirlik?.[sira] ?? 1;
    const yer = indeks.get(gunAnahtari(tarih));
    if (yer !== undefined) days[yer].count += katki;
    else {
      const yas = simdi - Date.parse(tarih);
      if (yas >= gun * GUN_MS && yas < 2 * gun * GUN_MS) previous += katki;
    }
  });
  return seriOzeti(days, previous, gun);
}

/*
  VERİTABANINDAN GELEN GÜN DİLİMLERİ ekrana.

  Sayım artık orada yapılıyor (ör. crm_genel_bakis_ozeti): sayfa
  kurumun bütün kayıtlarını çekip bellekte saymıyor — satır tavanına
  çarpıldığı gün grafik sessizce eksiliyordu. Dönen özet yalnızca kayıt
  OLAN günleri taşıyor; boş gün de çubuk olarak görünmeli, yoksa "dün
  hiç talep gelmedi" bilgisi kayboluyor ve çubuklar yanıltıcı biçimde
  bitişik duruyor.

  Gün anahtarı iki tarafta da TÜRKİYE günü: veritabanı
  `timezone('Europe/Istanbul', …)::date` ile üretiyor, buradaki
  `gunAnahtari` aynı sınırı kullanıyor. Biri UTC'ye kayarsa günün ilk
  ve son kaydı yanlış dilime düşer.

  Önceki dönem: aynı uzunlukta, hemen öncesindeki pencere. Özet 2×gun
  günü taşıdığı için pencerenin dışında kalan her gün oraya toplanır.
*/
export function gunlukSeriDilimler(
  ozet: readonly { gun: string; adet: number }[],
  simdi: number,
  gun = 14,
): GunlukSeri {
  const { days, indeks } = dilimleriKur(simdi, gun);
  const oncekiBasi = gunAnahtari(simdi - (2 * gun - 1) * GUN_MS);
  let previous = 0;
  for (const satir of ozet) {
    const adet = Number(satir.adet) || 0;
    const yer = indeks.get(satir.gun);
    if (yer !== undefined) days[yer].count += adet;
    else if (satir.gun >= oncekiBasi) previous += adet;
  }
  return seriOzeti(days, previous, gun);
}
