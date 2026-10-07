import "server-only";
import { iadeCevabiniCoz, iadeXml, type IadeTuru } from "./iade-istegi";
import type { GarantiAyari } from "./ayar";

/*
  GARANTİ PROVİZYON UCUNA İSTEK. Ağa çıkan tek Garanti modülü; geri
  kalanı saf ve test edilebilir.
*/

const ZAMAN_ASIMI_MS = 20_000;

async function provizyonaGonder(ayar: GarantiAyari, xml: string): Promise<{ ok: boolean; mesaj: string; referans: string | null }> {
  const iptal = AbortSignal.timeout(ZAMAN_ASIMI_MS);
  let yanit: Response;
  try {
    yanit = await fetch(ayar.uclar.provizyon, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      /* Banka XML'i "data" alanında form gövdesi olarak bekliyor. */
      body: new URLSearchParams({ data: xml }),
      signal: iptal,
    });
  } catch {
    /*
      Ulaşılamadı: iade YAPILMADI denemez, yapılmış da olabilir. Mesaj
      bunu açıkça söylüyor ki operasyoncu ikinci kez denemeden önce
      bankadan teyit etsin — iki kez iade, müşteriye iki kez para demek.
    */
    return { ok: false, mesaj: "Bankaya ulaşılamadı. İadenin geçip geçmediğini banka ekranından teyit edin.", referans: null };
  }

  const govde = await yanit.text().catch(() => "");
  if (!yanit.ok) {
    return { ok: false, mesaj: `Banka isteği reddetti (HTTP ${yanit.status}).`, referans: null };
  }
  return iadeCevabiniCoz(govde);
}

/**
 * İade. Önce İPTAL (void), olmazsa İADE (refund) deneniyor.
 *
 * Gün sonu alınmamış işlem iptal edilir, alınmış olan iade edilir ve
 * hangisi olduğunu dışarıdan bilmiyoruz: banka yanlış türde "işlem
 * bulunamadı" diyor. İkisini de denemek, operasyoncuyu "hangisi
 * lazımdı" sorusuyla baş başa bırakmaktan iyi.
 *
 * İKİ KEZ PARA GİTMİYOR: iptal BAŞARILI olursa ikincisi hiç
 * çağrılmıyor; başarısız olduysa ortada geçmiş bir işlem yok.
 */
export async function iadeEt(
  ayar: GarantiAyari,
  girdi: { siparisNo: string; tutarKurus: number; musteriIp: string },
): Promise<{ ok: boolean; mesaj: string; referans: string | null }> {
  let son: { ok: boolean; mesaj: string; referans: string | null } = {
    ok: false,
    mesaj: "Mağazanın Garanti iade şifresi (PROVRFN) girilmemiş.",
    referans: null,
  };

  for (const tur of ["void", "refund"] as IadeTuru[]) {
    const xml = iadeXml(ayar.kimlik, ayar.testModu, { ...girdi, tur });
    if (!xml) return son;
    son = await provizyonaGonder(ayar, xml);
    if (son.ok) return son;
  }
  return son;
}
