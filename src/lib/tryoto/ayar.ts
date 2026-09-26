import { decryptSecret } from "@/lib/payment-credentials";
import { firmalariCozumle, type KargoFirmasi } from "./firmalar";
import { OtoHatasi } from "./hatalar";
import { otoIstek } from "./istemci";

/*
  Mağazanın tryOTO ayarı ve bağlantı sınaması.

  Ayar MAĞAZA BAŞINA (arc_store_settings), ortam değişkeninde değil: tek
  mağazaya sabitlenmiş yapılandırma bu projede somut hasara yol açtı
  (AGENTS.md) ve ortam değişkenine konan tek anahtar, ikinci mağaza
  açıldığında gönderileri yanlış OTO hesabına düşürürdü.
*/

export interface TryotoAyari {
  etkin: boolean;
  anahtarVar: boolean;
  gondericiKodu: string | null;
  testModu: boolean;
}

export type AyarSatiri = {
  tryoto_enabled?: boolean | null;
  tryoto_refresh_token_enc?: string | null;
  tryoto_pickup_location_code?: string | null;
  tryoto_test_mode?: boolean | null;
};

export function tryotoAyari(satir: AyarSatiri | null | undefined): TryotoAyari {
  return {
    etkin: Boolean(satir?.tryoto_enabled),
    anahtarVar: Boolean(satir?.tryoto_refresh_token_enc),
    gondericiKodu: satir?.tryoto_pickup_location_code ?? null,
    testModu: satir?.tryoto_test_mode ?? true,
  };
}

export type BaglantiSonucu =
  | { durum: "kapali" }
  | { durum: "anahtar-yok" }
  | { durum: "basarili"; firmalar: KargoFirmasi[]; hamYanit: string | null }
  | { durum: "hata"; mesaj: string };

/**
 * Kayıtlı anahtarla OTO'ya bağlanıp kargo firmalarını getirir.
 *
 * Ayar ekranında çağrılıyor; hesapta hangi firmaların açık olduğunu
 * panelden görmenin tek yolu bu. Hata SAYFAYI DÜŞÜRMÜYOR: ayarların geri
 * kalanı okunabilir kalmalı, yoksa yanlış yazılmış bir anahtar bütün
 * ayar ekranını erişilemez yapardı.
 */
export async function baglantiyiSina(magazaId: string, satir: AyarSatiri | null | undefined): Promise<BaglantiSonucu> {
  const ayar = tryotoAyari(satir);
  if (!ayar.etkin) return { durum: "kapali" };
  if (!satir?.tryoto_refresh_token_enc) return { durum: "anahtar-yok" };

  try {
    const anahtar = decryptSecret(satir.tryoto_refresh_token_enc);
    const govde = await otoIstek({ magazaId, yenilemeAnahtari: anahtar, yol: "dcList", govde: {} });
    const firmalar = firmalariCozumle(govde);
    /*
      Liste çözülemediyse ham yanıt ekranda gösteriliyor. "Hiç firma yok"
      demek yanıltıcı olurdu: dcList'in gövde şekli belgelenmemiş ve
      tanınmayan bir sarmalayıcı, çalışan bir hesabı çalışmıyor gibi
      gösterirdi.
    */
    return {
      durum: "basarili",
      firmalar,
      hamYanit: firmalar.length ? null : JSON.stringify(govde).slice(0, 600),
    };
  } catch (hata) {
    if (hata instanceof OtoHatasi) return { durum: "hata", mesaj: hata.message };
    // Şifre çözme hatası da buraya düşer: anahtar başka bir şifreleme
    // anahtarıyla yazılmışsa okunamaz ve bunu söylemek gerekir.
    return { durum: "hata", mesaj: hata instanceof Error ? hata.message : "Bağlantı sınanamadı." };
  }
}
