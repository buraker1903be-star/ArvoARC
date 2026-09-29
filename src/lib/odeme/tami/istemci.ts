import "server-only";
import { correlationId, pgAuthToken, securityHash } from "./imza";
import { tokenIstegi, type TokenIstegi } from "./istek";
import type { TamiAyari } from "./ayar";
import type { TamiSorguYaniti } from "./yanit";

/*
  TAMİ İSTEKLERİ. Ortak ödeme sayfası akışında üç uç kullanılıyor:
  jeton alma, sorgulama ve iade.

  securityHash YALNIZCA sorgulama ve iadede isteniyor; ortak ödeme
  sayfasının jeton ucu onu istemiyor (belgede istek gövdesinde yok).
  Her yere eklemek de, hiç eklememek de isteği reddettirirdi.

  HATA YUTULMUYOR. Bu projede OTO çağrılarında üç ayrı boş catch vardı
  ve sonuç "sebebi hiçbir ekranda görünmeyen" bir arızaydı; burada da
  durum kodu ve Tami'nin mesajı çağırana taşınıyor.
*/

const ZAMAN_ASIMI_MS = 20_000;

export type TamiSonucu<T> = { ok: true; veri: T } | { ok: false; hata: string; durum: number };

async function istek<T>(
  adres: string,
  ayar: TamiAyari,
  govde: Record<string, unknown>,
  { imzali }: { imzali: boolean },
): Promise<TamiSonucu<T>> {
  const yuk = imzali ? { ...govde, securityHash: securityHash(govde, ayar.jwk) } : govde;
  let cevap: Response;
  try {
    cevap = await fetch(adres, {
      method: "POST",
      signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
      headers: {
        "content-type": "application/json",
        "PG-Api-Version": "v3",
        "PG-Auth-Token": pgAuthToken(ayar.kimlik),
        correlationId: correlationId(),
      },
      body: JSON.stringify(yuk),
    });
  } catch (hata) {
    /* Ağ hatası ve zaman aşımı: sağlayıcı ayakta değil sayılıyor, yedeğe düşülebilir. */
    return { ok: false, durum: 0, hata: hata instanceof Error ? hata.message : "Tami'ye ulaşılamadı" };
  }

  const metin = await cevap.text();
  let veri: unknown;
  try {
    veri = metin ? JSON.parse(metin) : {};
  } catch {
    return { ok: false, durum: cevap.status, hata: `Tami yanıtı okunamadı (HTTP ${cevap.status})` };
  }

  const kayit = veri as { success?: boolean; errorMessage?: string; errorCode?: string };
  if (!cevap.ok) {
    return {
      ok: false,
      durum: cevap.status,
      hata: kayit.errorMessage ?? kayit.errorCode ?? `Tami isteği reddetti (HTTP ${cevap.status})`,
    };
  }
  /*
    HTTP 200 + success:false ÜÇÜNCÜ BİR DURUM. OTO'da bu gözden
    kaçmıştı: yanıt geldi diye başarı sayılıyordu.
  */
  if (kayit.success === false) {
    return { ok: false, durum: cevap.status, hata: kayit.errorMessage ?? kayit.errorCode ?? "Tami işlemi reddetti" };
  }
  return { ok: true, veri: veri as T };
}

/** Ortak ödeme sayfası için tek kullanımlık jeton. */
export async function jetonAl(
  ayar: TamiAyari,
  girdi: { odemeKimligi: string; tutarKurus: number; telefon: string; donusAdresi: string },
): Promise<TamiSonucu<{ oneTimeToken: string; tokenCreateTime?: string }>> {
  let govde: TokenIstegi;
  try {
    govde = tokenIstegi(girdi);
  } catch (hata) {
    return { ok: false, durum: 0, hata: hata instanceof Error ? hata.message : "Ödeme isteği hazırlanamadı" };
  }
  const sonuc = await istek<{ oneTimeToken?: string; tokenCreateTime?: string }>(
    ayar.uclar.token,
    ayar,
    govde as unknown as Record<string, unknown>,
    { imzali: false },
  );
  if (!sonuc.ok) return sonuc;
  if (!sonuc.veri.oneTimeToken) return { ok: false, durum: 200, hata: "Tami jetonu boş döndü" };
  return { ok: true, veri: { oneTimeToken: sonuc.veri.oneTimeToken, tokenCreateTime: sonuc.veri.tokenCreateTime } };
}

/** Ödemenin GERÇEK durumu; tarayıcı dönüşü değil bu belirliyor. */
export const sorgula = (ayar: TamiAyari, odemeKimligi: string) =>
  istek<TamiSorguYaniti>(ayar.uclar.sorgu, ayar, { orderId: odemeKimligi, isTransactionDetail: "false" }, { imzali: true });

/** Tam ya da kısmi iade; tutar verilmezse siparişin tamamı iade edilir. */
export const iadeEt = (
  ayar: TamiAyari,
  girdi: { odemeKimligi: string; tutar?: number; sebep?: string },
) =>
  istek<{ amount?: number; currency?: string }>(
    ayar.uclar.iade,
    ayar,
    {
      orderId: girdi.odemeKimligi,
      ...(girdi.tutar !== undefined ? { amount: girdi.tutar } : {}),
      ...(girdi.sebep ? { reason: girdi.sebep.slice(0, 150) } : {}),
    },
    { imzali: true },
  );
