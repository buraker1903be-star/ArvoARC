import { createHash, createHmac } from "node:crypto";

/*
  TAMİ İMZALARI. İki ayrı şey var ve karıştırılmaları kolay:

  1) PG-Auth-Token — her istekte başlıkta gider:
       "merchantNumber:terminalNumber:base64(sha256(merchant+terminal+secretKey))"
     Sıradan base64 (base64url DEĞİL); Tami'nin örneğinde
     printBase64Binary kullanılıyor.

  2) securityHash — gövdenin JWK ile imzalanmış hâli (JWS, compact).
     Anahtar terminale özel: kty "oct", alg "HS512", kid ve k portalden
     (İşyeri Ayarları → POS Yönetimi) alınıyor. Ortak ödeme sayfasının
     token ucu bunu İSTEMİYOR; sorgulama ve iade uçları istiyor.

  Gövde imzalanırken securityHash alanının kendisi hesaba katılmaz —
  belgede açıkça yazıyor ve unutulursa imza hiçbir zaman tutmaz.
*/

export interface TamiKimligi {
  merchantNumber: string;
  terminalNumber: string;
  secretKey: string;
}

/** Terminale özel JWK; k ve kid portalden alınıyor. */
export interface TamiJwk {
  kid: string;
  k: string;
}

const base64url = (veri: Buffer) => veri.toString("base64url");

export function pgAuthToken({ merchantNumber, terminalNumber, secretKey }: TamiKimligi): string {
  const metin = `${merchantNumber}${terminalNumber}${secretKey}`;
  const ozet = createHash("sha256").update(metin, "utf8").digest("base64");
  return `${merchantNumber}:${terminalNumber}:${ozet}`;
}

/**
 * Gövdenin JWS imzası (securityHash alanına konur).
 *
 * `k` base64url kodlu bir bayt dizisi (JWK "oct" kuralı); HMAC anahtarı
 * o baytların KENDİSİ, metin hâli değil. Dizgeyi olduğu gibi anahtar
 * saymak imzayı sessizce yanlış üretir — istek "hash hatalı" diye döner
 * ve sebebi hiçbir yerde yazmaz.
 */
export function securityHash(govde: Record<string, unknown>, jwk: TamiJwk): string {
  /* securityHash alanı imzaya girmiyor (Tami belgesi). */
  const { securityHash: _atilan, ...imzalanacak } = govde as Record<string, unknown> & { securityHash?: unknown };
  void _atilan;

  const baslik = base64url(Buffer.from(JSON.stringify({ alg: "HS512", typ: "JWT", kid: jwk.kid }), "utf8"));
  const yuk = base64url(Buffer.from(JSON.stringify(imzalanacak), "utf8"));
  const imza = base64url(
    createHmac("sha512", Buffer.from(jwk.k, "base64url")).update(`${baslik}.${yuk}`, "utf8").digest(),
  );
  return `${baslik}.${yuk}.${imza}`;
}

/** Her istekte tekil olmalı; Tami günlüklerinde isteği bu değerle buluyoruz. */
export const correlationId = (): string => crypto.randomUUID();
