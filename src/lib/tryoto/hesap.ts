/*
  tryOTO hesap bilgisi (accountInfo). Saf modül; testi tests/tryoto-hesap.test.ts.

  Bağlantı sınaması için dcList kullanılıyordu ve yanlış seçimdi: o uç
  planla sınırlı (ücretsiz hesapta HTTP 403 döndü, 27.09.2026) ve
  başarısızlığı "bağlantı kurulamadı" diye okunuyordu, oysa anahtar
  geçerliydi. accountInfo hem anahtarı doğruluyor hem işe yarar iki şey
  söylüyor: paket adı ve BAKİYE — gönderi oluşturmak OTO cüzdanından
  düşüyor, bakiye biterse etiket üretilemiyor.
*/

export interface HesapBilgisi {
  ad: string | null;
  eposta: string | null;
  paket: string | null;
  /** Kalan bakiye; birimini OTO söylemiyor, olduğu gibi gösteriliyor. */
  bakiye: number | null;
}

const metin = (kayit: Record<string, unknown>, adlar: string[]): string | null => {
  for (const ad of adlar) {
    const deger = kayit[ad];
    if (typeof deger === "string" && deger.trim()) return deger.trim();
  }
  return null;
};

export function hesabiCozumle(govde: unknown): HesapBilgisi | null {
  if (!govde || typeof govde !== "object") return null;
  const dis = govde as Record<string, unknown>;
  /*
    Alanlar bazen doğrudan gövdede, bazen bir sarmalayıcının içinde
    dönüyor; ikisi de deneniyor. Hiçbiri tutmazsa null — çağıran "bağlandı
    ama hesap okunamadı" diyebilsin, uydurma bir ad göstermesin.
  */
  const ic = (dis.data ?? dis.account ?? dis.result) as Record<string, unknown> | undefined;
  const kayit = ic && typeof ic === "object" ? { ...dis, ...ic } : dis;

  const sayi = (ad: string[]): number | null => {
    for (const alan of ad) {
      const deger = kayit[alan];
      if (typeof deger === "number" && Number.isFinite(deger)) return deger;
      if (typeof deger === "string" && deger.trim() && Number.isFinite(Number(deger))) return Number(deger);
    }
    return null;
  };

  const hesap: HesapBilgisi = {
    ad: metin(kayit, ["name", "fullName", "accountName"]),
    eposta: metin(kayit, ["email", "mail"]),
    paket: metin(kayit, ["packageName", "package", "subscription"]),
    bakiye: sayi(["remainingCredit", "credit", "balance"]),
  };
  // Hiçbir alan okunamadıysa bu gövde accountInfo değil.
  return hesap.ad || hesap.eposta || hesap.paket || hesap.bakiye !== null ? hesap : null;
}
