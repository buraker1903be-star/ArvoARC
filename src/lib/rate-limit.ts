/*
  Bellekte tutulan istek sınırı (kayan pencere).

  Vitrinin herkese açık uç noktaları (kimlik e-postası, kupon,
  ödeme) sınırsız çağrılabiliyordu: bir adrese art arda sıfırlama
  e-postası gönderilebiliyor, kupon kodları deneme yanılmayla
  aranabiliyordu.

  Sınır sunucu örneğinin belleğinde tutulur. Vercel örnekleri
  yeniden kullandığı için tek kaynaktan gelen seriyi büyük ölçüde
  keser; ama örnekler arasında paylaşılmaz, kesin bir kota değildir.
  Kesin kota için veritabanı ya da Redis tabanlı bir sayaç gerekir.
*/
export function createRateLimiter({ limit, windowMs, maxKeys = 10_000 }: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, number[]>();

  return function hit(key: string, now = Date.now()) {
    const recent = (hits.get(key) ?? []).filter((at) => at > now - windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return { ok: false as const, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
    }
    recent.push(now);
    // Map ekleme sırasını korur: yeniden eklenen anahtar sona geçer,
    // bellek dolunca en uzun süredir görülmeyen anahtar atılır.
    hits.delete(key);
    hits.set(key, recent);
    if (hits.size > maxKeys) {
      const oldest = hits.keys().next().value;
      if (oldest !== undefined) hits.delete(oldest);
    }
    return { ok: true as const, retryAfterSeconds: 0 };
  };
}

/** İsteği yapanın IP adresi; Vercel x-forwarded-for başlığını kendisi yazar. */
export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "bilinmiyor";
}
