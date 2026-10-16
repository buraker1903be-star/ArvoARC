/*
  İNDİRİM LİSTESİNİN SAĞINDAKİ İSTATİSTİKLER (16.10.2026).

  Ekranda dört sayı vardı (aktif kural, kupon, otomatik, ürün indirimi)
  ve hepsi BELLEKTE, o anda çekilmiş listeden hesaplanıyordu. Kampanya
  sayısı arttıkça sayı sessizce eksilecekti; dahası "kaç kupon var"
  mağazanın sorduğu soru değil — sorduğu şu: hangi kupon çalışıyor,
  hangisi bitmek üzere, limiti dolan var mı.

  Saf hesap: sayfa kuralları okuyup buraya veriyor, kart yalnızca
  çiziyor (siparis-istatistik.ts ile aynı biçim).

  KULLANIM SAYACI BİRİKİMLİ. `usage_count` tetikleyiciyle artıyor
  (arc_count_coupon_use: sipariş ödendiğinde) ve ne zaman arttığı
  kayıtlı değil — bu yüzden "son 30 gün" diye bir kullanım sayısı
  ÜRETİLMİYOR. Olmayan bir zaman bilgisini uydurmaktansa toplamı
  söylemek dürüst olanı.
*/

export type IstatistikIndirimi = {
  status: string | null;
  code: string | null;
  name: string | null;
  discount_type: string | null;
  value: number | null;
  usage_count: number | null;
  usage_limit: number | null;
  ends_at: string | null;
};

/** Bitişine bu kadar kalan aktif kural "bitmek üzere" sayılıyor. */
export const BITIYOR_GUN = 7;
/** Limitinin bu oranına gelen kural "limiti doluyor" sayılıyor. */
const LIMIT_ESIGI = 0.8;

const TUR_ADI: Record<string, string> = {
  percentage: "Yüzde indirim",
  fixed_amount: "Sepet indirimi",
  free_shipping: "Ücretsiz kargo",
};

export function indirimIstatistikleri(kurallar: IstatistikIndirimi[], an: number) {
  const gun = 86_400_000;
  let aktif = 0, kuponlu = 0, otomatik = 0, toplamKullanim = 0;
  let bitiyor = 0, suresiGecmis = 0, limitiDoluyor = 0;
  const turler = new Map<string, number>();
  const kullanilanlar: { ad: string; adet: number }[] = [];

  for (const kural of kurallar) {
    const kullanim = Math.max(0, Number(kural.usage_count ?? 0) || 0);
    toplamKullanim += kullanim;
    const bitis = kural.ends_at ? Date.parse(kural.ends_at) : null;
    const gecerliBitis = bitis !== null && !Number.isNaN(bitis) ? bitis : null;

    if (kural.status === "active") {
      aktif += 1;
      if (kural.code) kuponlu += 1;
      else otomatik += 1;
      /*
        Süresi geçmiş ama hâlâ "aktif" duran kural: durum alanını
        kimse geri almıyor (expired yazan bir iş yok). Vitrin kuralı
        uygulamıyor çünkü tarih kontrolü sorguda, ama panelde "Aktif"
        görünüyor — sayı bu yüzden ayrı veriliyor.
      */
      if (gecerliBitis !== null && gecerliBitis < an) suresiGecmis += 1;
      else if (gecerliBitis !== null && gecerliBitis - an <= BITIYOR_GUN * gun) bitiyor += 1;

      const limit = Number(kural.usage_limit ?? 0) || 0;
      if (limit > 0 && kullanim / limit >= LIMIT_ESIGI) limitiDoluyor += 1;
    }

    const tur = TUR_ADI[kural.discount_type ?? ""] ?? "Diğer";
    turler.set(tur, (turler.get(tur) ?? 0) + 1);
    if (kullanim > 0) kullanilanlar.push({ ad: kural.code || kural.name || "Adsız", adet: kullanim });
  }

  return {
    aktif,
    kuponlu,
    otomatik,
    toplamKullanim,
    bitiyor,
    suresiGecmis,
    limitiDoluyor,
    turler: [...turler.entries()].sort((a, b) => b[1] - a[1]).map(([tur, adet]) => ({ tur, adet })),
    enCokKullanilan: kullanilanlar.sort((a, b) => b.adet - a.adet).slice(0, 6),
  };
}
