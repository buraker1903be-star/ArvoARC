import { OtoHatasi, otoHataMetni } from "./hatalar";

/*
  tryOTO REST istemcisi (api.tryoto.com/rest/v2).

  KİMLİK AKIŞI: OTO panelinden alınan YENİLEME anahtarı (refresh token)
  uzun ömürlü ve mağaza ayarlarında şifreli duruyor; her çağrı öncesi
  ondan kısa ömürlü bir erişim anahtarı (access token) üretiliyor
  (/refreshToken). Erişim anahtarı veritabanına YAZILMIYOR: kısa ömürlü bir
  sırrı kalıcı saklamak, kazancı olmayan bir risk.

  ÖNBELLEK bellekte ve mağaza başına. Sunucusuz ortamda her örnek kendi
  önbelleğini tutuyor, yani bu bir garanti değil yalnızca çağrı tasarrufu —
  kod önbellek boşmuş gibi de doğru çalışır. Süre OTO'nun bildirdiği
  değerden 60 saniye kısa tutuluyor: tam sınırda yenilemek, yolda olan bir
  isteğin süresi dolmuş anahtarla varmasına yol açıyor.

  Not: OTO'nun örnekleri Suudi Arabistan şehirleriyle (Riyadh, Jeddah) ve
  cüzdan bakiyesi modeliyle çalışıyor. Hangi kargo firmalarının açık olduğu
  hesaba göre değişiyor; firma listesi koda gömülmedi, dcList ucundan
  okunuyor.
*/

export const OTO_TABAN = "https://api.tryoto.com/rest/v2";

type JetonKaydi = { jeton: string; gecerlilikSonu: number };
const jetonlar = new Map<string, JetonKaydi>();

/** Önbelleği boşaltır (anahtar değişince ayar ekranı çağırıyor). */
export function jetonlariUnut(magazaId?: string) {
  if (magazaId) jetonlar.delete(magazaId);
  else jetonlar.clear();
}

async function govdeyiCoz(yanit: Response): Promise<unknown> {
  const metin = await yanit.text();
  if (!metin) return null;
  try {
    return JSON.parse(metin);
  } catch {
    // OTO bazı hata durumlarında düz metin ya da HTML dönüyor; ham metni
    // hata mesajı olarak taşımak, "geçersiz JSON" demekten bilgilendirici.
    return { message: metin.slice(0, 300) };
  }
}

/**
 * Erişim anahtarı. `magazaId` yalnızca önbellek anahtarı olarak kullanılıyor;
 * sır tek başına yenileme anahtarında.
 */
export async function erisimAnahtari(magazaId: string, yenilemeAnahtari: string): Promise<string> {
  const kayitli = jetonlar.get(magazaId);
  if (kayitli && kayitli.gecerlilikSonu > Date.now()) return kayitli.jeton;

  const yanit = await fetch(`${OTO_TABAN}/refreshToken`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: yenilemeAnahtari }),
    // Sunucusuz işlevin süresi dolmadan hata verelim ki kullanıcı bekleyip
    // genel bir zaman aşımı ekranı görmesin.
    signal: AbortSignal.timeout(15_000),
  });
  const govde = await govdeyiCoz(yanit);
  const kayit = (govde ?? {}) as Record<string, unknown>;
  const jeton = typeof kayit.access_token === "string" ? kayit.access_token : null;
  if (!yanit.ok || !jeton) throw new OtoHatasi(otoHataMetni(govde), yanit.status);

  /*
    OTO süreyi bildirmezse 50 dakika varsayılıyor (belgelenen bir saatin
    altında). Yanlış tarafa sapmak pahalı değil: süresi dolmuş anahtarla
    gelen ilk istek 401 alır ve çağrı yeniden denenir.
  */
  const saniye = typeof kayit.expires_in === "number" && kayit.expires_in > 120 ? kayit.expires_in : 3000;
  jetonlar.set(magazaId, { jeton, gecerlilikSonu: Date.now() + (saniye - 60) * 1000 });
  return jeton;
}

export interface OtoCagri {
  magazaId: string;
  yenilemeAnahtari: string;
  yol: string;
  govde?: unknown;
  yontem?: "GET" | "POST";
}

/**
 * OTO ucuna kimlikli istek. Başarısızlıkta OtoHatasi fırlatır; mesajı
 * doğrudan kullanıcıya gösterilebilir.
 */
export async function otoIstek<T = unknown>(cagri: OtoCagri): Promise<T> {
  const calistir = async (jeton: string) =>
    fetch(`${OTO_TABAN}/${cagri.yol.replace(/^\/+/, "")}`, {
      method: cagri.yontem ?? "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${jeton}` },
      body: cagri.govde === undefined ? undefined : JSON.stringify(cagri.govde),
      signal: AbortSignal.timeout(20_000),
    });

  let jeton = await erisimAnahtari(cagri.magazaId, cagri.yenilemeAnahtari);
  let yanit = await calistir(jeton);

  /*
    401'de BİR KEZ yeniden deneniyor: önbellekteki anahtarın süresi
    beklenenden önce dolmuş olabilir (OTO tarafında iptal, saat kayması).
    Sonsuz denemeye girilmiyor — ikinci 401 gerçekten yetki sorunudur ve
    kullanıcıya söylenmeli.
  */
  if (yanit.status === 401) {
    jetonlariUnut(cagri.magazaId);
    jeton = await erisimAnahtari(cagri.magazaId, cagri.yenilemeAnahtari);
    yanit = await calistir(jeton);
  }

  const govde = await govdeyiCoz(yanit);
  const kayit = (govde ?? {}) as Record<string, unknown>;
  /*
    OTO HTTP 200 ile de başarısızlık bildiriyor: gövdedeki success alanı
    false olabiliyor. Yalnızca durum koduna bakmak, hatayı başarı sanıp
    boş bir gönderi kaydı yazmak demekti.
  */
  if (!yanit.ok || kayit.success === false) throw new OtoHatasi(otoHataMetni(govde), yanit.status);
  return govde as T;
}
