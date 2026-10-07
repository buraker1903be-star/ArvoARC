/*
  SAĞLAYICI SEÇİMİ VE YEDEĞE DÜŞME. Saf modül; testi tests/odeme-secim.test.ts.

  Karar (07.10.2026): birincil Garanti Sanal POS, yedek PayTR. Tami
  bırakıldı — yerine Garanti geçti; Tami ile tahsil edilmiş GEÇMİŞ
  siparişlerin iadesi hâlâ Tami'ye gidiyor (lib/odeme/iade.ts), ama yeni
  ödeme Tami'den açılmıyor ve seçeneklerde de yok.

  Devretme YALNIZCA
  müşteri ödeme sayfasına düşmeden önce geçerli — yani ödeme oturumu
  açılırken. Oturum açıldıktan sonra ikinci bir sağlayıcıda oturum
  açılmaz: iki sağlayıcıda birden açık ödeme, çift çekim demek. Ödeme
  başladıktan sonraki sorunlar insan kararıyla (iade/iptal) çözülür.

  "Hazır" olmak yapılandırmanın tamamlanmış olmasıdır (anahtarlar
  girilmiş ve sağlayıcı etkin), sağlayıcının o anda ayakta olması
  değil. Ayakta olup olmadığı ancak istek atılınca öğreniliyor;
  sıradaki aday o yüzden önceden belli.
*/

export type Saglayici = "garanti" | "paytr";

export const SAGLAYICI_ADI: Record<Saglayici, string> = { garanti: "Garanti Sanal POS", paytr: "PayTR" };

/**
 * Denenecek sağlayıcılar, sırayla. Boş dizi "kartla ödeme kapalı"
 * demek: vitrin kart seçeneğini hiç göstermemeli.
 *
 * Tercih edilen sağlayıcı hazır değilse sessizce atlanıyor — mağaza
 * Garanti'yi seçip anahtarlarını girmemişse kartla ödeme tamamen
 * durmasın, hazır olan yedek devralsın.
 */
export function saglayiciSirasi(
  tercih: string | null | undefined,
  hazir: { garanti: boolean; paytr: boolean },
): Saglayici[] {
  const birincil: Saglayici = tercih === "garanti" ? "garanti" : "paytr";
  const yedek: Saglayici = birincil === "garanti" ? "paytr" : "garanti";
  return [birincil, yedek].filter((s) => hazir[s]);
}

/** Vitrinde "kartla ödeme" görünsün mü. */
export const kartlaOdenebilir = (sira: Saglayici[]): boolean => sira.length > 0;
