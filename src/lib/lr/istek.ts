/*
  LR'IN HERKESE AÇIK SAYFALARINI GETİRME.

  Sayfa doğrudan gelmiyor: ilk istek bir çerez denemesine, oradan CAS'ın
  "gateway" adresine, oradan geri sayfaya yönleniyor (27.09.2026'da
  ölçüldü — çerezsiz istek 404 dönüyor). Bu yüzden yönlendirmeler ELLE
  izleniyor ve çerezler bir turdan ötekine taşınıyor.

  GİRİŞ YOK. gateway=true "oturum yoksa misafir olarak devam et"
  demek; kullanıcı adı, şifre ve SSO jetonu hiç işin içine girmiyor.
  Girişli (alış) fiyatlar için tarayıcı toplayıcısı var.
*/

/** Çerezler istekler arasında taşınıyor; çağıran bir tur boyunca aynı torbayı veriyor. */
export type CerezTorbasi = Map<string, string>;

export interface LrCevabi {
  durum: number;
  html: string;
  /** Yönlendirmelerden sonra ulaşılan adres. */
  adres: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/*
  Yönlendirme yalnızca LR'ın kendi sunucularına izleniyor (shop → sso →
  shop). Başka bir alan adına gitmek, çerezleri oraya taşımak demekti.
*/
const IZINLI_SON = ".lrworld.com";
const EN_FAZLA_YONLENDIRME = 6;

export const lrAdresiMi = (adres: string): boolean => {
  try {
    const url = new URL(adres);
    return url.protocol === "https:" && (url.hostname === "lrworld.com" || url.hostname.endsWith(IZINLI_SON));
  } catch {
    return false;
  }
};

function cerezleriTopla(cevap: Response, torba: CerezTorbasi) {
  for (const satir of cevap.headers.getSetCookie?.() ?? []) {
    const [ikili] = satir.split(";");
    const ayirac = ikili.indexOf("=");
    if (ayirac > 0) torba.set(ikili.slice(0, ayirac).trim(), ikili.slice(ayirac + 1).trim());
  }
}

export async function lrGetir(
  adres: string,
  torba: CerezTorbasi,
  { zamanAsimiMs = 12_000 }: { zamanAsimiMs?: number } = {},
): Promise<LrCevabi> {
  let gecerli = adres;
  for (let adim = 0; adim <= EN_FAZLA_YONLENDIRME; adim += 1) {
    if (!lrAdresiMi(gecerli)) return { durum: 0, html: "", adres: gecerli };

    const cerez = [...torba].map(([ad, deger]) => `${ad}=${deger}`).join("; ");
    const cevap = await fetch(gecerli, {
      redirect: "manual",
      signal: AbortSignal.timeout(zamanAsimiMs),
      headers: {
        "user-agent": UA,
        "accept-language": "tr-TR,tr;q=0.9",
        accept: "text/html,application/xhtml+xml",
        ...(cerez ? { cookie: cerez } : {}),
      },
    });
    cerezleriTopla(cevap, torba);

    if (cevap.status >= 300 && cevap.status < 400) {
      const hedef = cevap.headers.get("location");
      if (!hedef) return { durum: cevap.status, html: "", adres: gecerli };
      gecerli = new URL(hedef, gecerli).toString();
      continue;
    }
    return { durum: cevap.status, html: cevap.status === 200 ? await cevap.text() : "", adres: gecerli };
  }
  /* Yönlendirme döngüsü: sessizce dönmek yerine durumu çağırana bildiriyoruz. */
  return { durum: 508, html: "", adres: gecerli };
}
