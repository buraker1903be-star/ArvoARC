/*
  SAĞLAYICI SEÇİMİ VE YEDEĞE DÜŞME. Saf modül; testi tests/odeme-secim.test.ts.

  Karar (29.09.2026): birincil Tami, yedek PayTR. Devretme YALNIZCA
  müşteri ödeme sayfasına düşmeden önce geçerli — yani ödeme oturumu
  açılırken. Oturum açıldıktan sonra ikinci bir sağlayıcıda oturum
  açılmaz: iki sağlayıcıda birden açık ödeme, çift çekim demek. Ödeme
  başladıktan sonraki sorunlar insan kararıyla (iade/iptal) çözülür.

  "Hazır" olmak yapılandırmanın tamamlanmış olmasıdır (anahtarlar
  girilmiş ve sağlayıcı etkin), sağlayıcının o anda ayakta olması
  değil. Ayakta olup olmadığı ancak istek atılınca öğreniliyor;
  sıradaki aday o yüzden önceden belli.
*/

export type Saglayici = "tami" | "paytr";

export const SAGLAYICI_ADI: Record<Saglayici, string> = { tami: "Tami", paytr: "PayTR" };

/**
 * Denenecek sağlayıcılar, sırayla. Boş dizi "kartla ödeme kapalı"
 * demek: vitrin kart seçeneğini hiç göstermemeli.
 *
 * Tercih edilen sağlayıcı hazır değilse sessizce atlanıyor — mağaza
 * Tami'yi seçip anahtarlarını girmemişse kartla ödeme tamamen
 * durmasın, hazır olan yedek devralsın.
 */
export function saglayiciSirasi(
  tercih: string | null | undefined,
  hazir: { tami: boolean; paytr: boolean },
): Saglayici[] {
  const birincil: Saglayici = tercih === "tami" ? "tami" : "paytr";
  const yedek: Saglayici = birincil === "tami" ? "paytr" : "tami";
  return [birincil, yedek].filter((s) => hazir[s]);
}

/** Vitrinde "kartla ödeme" görünsün mü. */
export const kartlaOdenebilir = (sira: Saglayici[]): boolean => sira.length > 0;
