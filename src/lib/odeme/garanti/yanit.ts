/*
  GARANTİ 3D DÖNÜŞÜNÜN OKUNMASI. Saf modül; testi tests/garanti-yanit.test.ts.

  Banka müşteriyi bize bir POST ile geri gönderiyor. İki ayrı soru var
  ve karıştırılmaları ödenmemiş siparişi "ödendi" yapar:

   1. mdstatus — 3D DOĞRULAMASI nasıl sonuçlandı.
   2. response / procreturncode — PARA ÇEKİLDİ Mİ.

  3D Pay Hosting'de provizyonu banka yapıyor, yani ikisi de aynı
  dönüşte geliyor. Yalnızca mdstatus'a bakmak yetmez: doğrulama başarılı
  olup provizyon reddedilebilir (limit yetersiz). Yalnızca response'a
  bakmak da yetmez: imzasız bir istek "Approved" yazabilir — bu yüzden
  imza denetimi (imza.ts · donusHashiDogru) ÖNCE geliyor ve bu modül
  imzası doğrulanmış veriyle çağrılıyor.

  mdstatus değerleri:
    1     tam doğrulama (3D şifresi girildi)
    2,3,4 kart ya da banka 3D'ye kayıtlı değil — "yarı güvenli"
    0,5-9 doğrulama başarısız

  2/3/4 KABUL EDİLİYOR, çünkü bankanın kendi sanal POS'u da bu işlemleri
  geçiriyor ve provizyon zaten yapılmış oluyor; reddetmek, parası çekilmiş
  müşterinin siparişini açmamak demekti. Ters ibraz riski işyerinde
  kalıyor; bu bir iş kararı ve mağaza ayarından kapatılabiliyor.
*/

export type GarantiSonuc =
  | { durum: "basarili"; mdstatus: string; referans: string | null; onayKodu: string | null }
  | { durum: "basarisiz"; mdstatus: string; mesaj: string };

const TAM_DOGRULAMA = "1";
const YARI_GUVENLI = new Set(["2", "3", "4"]);

/** Ekrana basılabilecek, bankadan gelen açıklama. */
function bankaMesaji(donus: Record<string, string>): string {
  /*
    Üç ayrı alan geliyor ve hangisinin dolu olduğu hataya göre
    değişiyor. Yalnızca birine bakan ilk taslak çoğu hatada boş mesaj
    gösteriyordu; sıra, en açıklayıcıdan en genele.
  */
  const aday = [donus.mderrormessage, donus.errmsg, donus.hostmsg, donus.mdstatus && `3D sonucu: ${donus.mdstatus}`]
    .map((m) => (m ?? "").trim())
    .find(Boolean);
  return aday || "Banka işlemi tamamlamadı.";
}

export function donusuCoz(
  donus: Record<string, string>,
  yariGuvenliKabul: boolean,
): GarantiSonuc {
  const mdstatus = (donus.mdstatus ?? "").trim();
  const dogrulandi = mdstatus === TAM_DOGRULAMA || (yariGuvenliKabul && YARI_GUVENLI.has(mdstatus));
  if (!dogrulandi) return { durum: "basarisiz", mdstatus, mesaj: bankaMesaji(donus) };

  /*
    Provizyon sonucu İKİ alandan okunuyor ve ikisi de aranıyor:
    procreturncode "00" ya da response "Approved". Bankanın bazı
    dönüşlerinde biri boş geliyor; yalnızca birine bakmak başarılı
    ödemeyi başarısız saymaya yol açıyordu.
  */
  const kod = (donus.procreturncode ?? "").trim();
  const cevap = (donus.response ?? "").trim().toLowerCase();
  const onaylandi = kod === "00" || cevap === "approved";
  if (!onaylandi) return { durum: "basarisiz", mdstatus, mesaj: bankaMesaji(donus) };

  return {
    durum: "basarili",
    mdstatus,
    /* İade bu referansla isteniyor; yoksa iade elle yapılmak zorunda
       kalır, o yüzden null da olsa taşınıyor. */
    referans: (donus.hostrefnum ?? donus.retrefnum ?? "").trim() || null,
    onayKodu: (donus.authcode ?? donus.AuthCode ?? "").trim() || null,
  };
}
