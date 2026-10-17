import { DAY, NEW_DAYS, RISK_DAYS, type Customer } from "@/app/(panel)/musteriler/customer-data";
import { trToday } from "@/lib/tr-time";

/*
  MÜŞTERİ LİSTESİNİN SAĞINDAKİ İSTATİSTİKLER (16.10.2026).

  Başlıkta tek satır vardı: "N müşteri · müşteri başına X". Mağazanın
  sorduğu sorular bunlar değil — kaç müşteri GERİ GELİYOR, bu ay kaç
  yeni müşteri geldi, kaçı uzaklaştı, ciro kaç kişiye dayanıyor.

  Saf hesap: sayfa müşterileri verir, kart yalnızca çizer. Müşteri
  kaydı siparişlerden türüyor (customer-data.ts), bu yüzden buradaki
  her sayı o türetmenin penceresiyle sınırlı ve sayfa pencere kesilince
  bunu zaten söylüyor.

  EŞİKLER TEK YERDEN: "yeni" ve "uzun süredir yok" tanımı listedeki
  segment süzgeciyle aynı sabitlerden (NEW_DAYS, RISK_DAYS) geliyor.
  İkinci bir kopya, kartla şeridin aynı müşteriyi iki ayrı segmentte
  saymasına yol açardı.
*/

export function musteriIstatistikleri(musteriler: Customer[], an: number) {
  let tekrarEden = 0, yeni = 0, oncekiYeni = 0, riskli = 0, toplamHarcama = 0, tekSiparis = 0;

  for (const musteri of musteriler) {
    toplamHarcama += musteri.spent;
    if (musteri.paidOrders > 1) tekrarEden += 1;
    if (musteri.orders === 1) tekSiparis += 1;
    const ilkYas = an - musteri.firstOrderAt;
    if (ilkYas <= NEW_DAYS * DAY) yeni += 1;
    else if (ilkYas <= 2 * NEW_DAYS * DAY) oncekiYeni += 1;
    if (an - musteri.lastOrderAt > RISK_DAYS * DAY) riskli += 1;
  }

  const enCokHarcayan = [...musteriler]
    .filter((musteri) => musteri.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 6);

  /*
    CİRONUN NE KADARI EN İYİ BEŞ MÜŞTERİDEN? Tek bir müşteriye yaslanan
    ciro, o müşteri gittiğinde görünmeyen bir risk. Oran yalnızca
    harcaması olan müşteriler üzerinden.
  */
  const ilkBes = [...musteriler].sort((a, b) => b.spent - a.spent).slice(0, 5)
    .reduce((toplam, musteri) => toplam + musteri.spent, 0);

  return {
    toplam: musteriler.length,
    tekrarEden,
    /** Tekrar eden müşteri oranı; müşteri yoksa null. */
    tekrarOrani: musteriler.length ? Math.round((tekrarEden / musteriler.length) * 100) : null,
    tekSiparis,
    yeni,
    /** Son 30 günde gelen yeni müşterinin önceki 30 güne göre değişimi. */
    yeniDegisim: oncekiYeni ? Math.round(((yeni - oncekiYeni) / oncekiYeni) * 100) : null,
    riskli,
    toplamHarcama,
    /** Müşteri başına net harcama; müşteri yoksa 0. */
    musteriBasina: musteriler.length ? Math.round(toplamHarcama / musteriler.length) : 0,
    ilkBesPayi: toplamHarcama ? Math.round((ilkBes / toplamHarcama) * 100) : null,
    enCokHarcayan: enCokHarcayan.map((musteri) => ({ ad: musteri.name, harcama: musteri.spent })),
  };
}

/*
  AYLIK SERİLER (17.10.2026). Kutudaki sayı tek başına "iyi mi kötü mü"
  söylemiyor; altı aylık çubuk söylüyor. Ay sınırı TÜRKİYE GÜNÜYLE:
  ayın ilk gününde 00:00–03:00 arasında ilk siparişini veren müşteri
  UTC'ye göre önceki aya düşerdi (AGENTS.md).

  Saf; testi tests/musteri-istatistik.test.ts.
*/
export type AyDilimi = { bas: string; son: string; ad: string; simdiki: boolean };

const ayinIcinde = (damga: number, ay: AyDilimi) => {
  const gun = trToday(damga);
  return gun >= ay.bas && gun <= ay.son;
};

/** Her ayda İLK siparişini veren müşteri sayısı. */
export function aylikYeniMusteri(musteriler: Customer[], aylar: AyDilimi[]) {
  return aylar.map((ay) => ({
    ...ay,
    adet: musteriler.filter((musteri) => ayinIcinde(musteri.firstOrderAt, ay)).length,
  }));
}

/** Tek müşterinin aylık net harcaması (kuruş). */
export function aylikHarcama(siparisler: { an: number; tutar: number }[], aylar: AyDilimi[]) {
  return aylar.map((ay) => ({
    ...ay,
    tutar: siparisler.filter((siparis) => ayinIcinde(siparis.an, ay)).reduce((toplam, siparis) => toplam + siparis.tutar, 0),
  }));
}
