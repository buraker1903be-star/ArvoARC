/* Kaynak: ArvoOS/lib/liste-sayfalama.ts (16.10.2026, ArvoARC paneli ArvoOS'un bileşenleriyle yeniden yazılıyor). */
/*
  LİSTE SAYFALAMASI — sayfa numarası ve son sayfa hesabı.

  Üç listede (teklifler, sözleşmeler, işler) aynı iki satır
  kopyalanıyordu. Kopya hesap, sayfa boyu bir listede değişince
  ötekilerde sessizce eski kalması demek; son sayfa hesabı da
  "toplam gelmezse ne olacak" sorusunu her yerde yeniden cevaplıyordu.

  Saf modül: birim testi tests/unit/liste-sayfalama.test.ts.
*/

/** Listelerin ortak sayfa boyu. */
export const SAYFA_BOYU = 50;

/**
 * Adresteki ?sayfa= değeri. Bozuk, eksi ya da sıfır değer ilk sayfaya
 * düşüyor: "?sayfa=abc" ile gelen bağlantı hata vermemeli.
 */
export function sayfaNumarasi(ham: string | undefined): number {
  return Math.max(1, Number.parseInt(ham ?? "1", 10) || 1);
}

/**
 * Son sayfa. Toplam sayı varsa ondan; yoksa (sayım istenmediyse ya da
 * dönmediyse) dolu bir sayfa "devamı var" sayılıyor — eksik bir
 * "Sonraki" düğmesi, kullanıcıyı kayıtların bittiğine inandırır.
 */
export function sonSayfaNo(toplam: number | null | undefined, satirSayisi: number, sayfaNo: number, boyut = SAYFA_BOYU): number {
  if (typeof toplam === "number") return Math.max(1, Math.ceil(toplam / boyut));
  return satirSayisi === boyut ? sayfaNo + 1 : sayfaNo;
}

/** Sorguya verilecek aralık: [başlangıç, bitiş] (PostgREST range). */
export function sayfaAraligi(sayfaNo: number, boyut = SAYFA_BOYU): [number, number] {
  return [(sayfaNo - 1) * boyut, sayfaNo * boyut - 1];
}

/*
  BOŞ SAYFA HATA DEĞİL.

  PostgREST son satırın ötesine taşan bir aralığı REDDEDİYOR: 416 ve
  `PGRST103` ("Requested range not satisfiable"). Sayfalar bunu gerçek
  okuma hatası sayıp fırlatıyordu, yani kullanıcı "İŞLEM TAMAMLANAMADI ·
  Bir sorun oluştu · Hata kodu: …" çökme ekranını görüyordu.

  16.10.2026'da canlıda ölçüldü: sekiz listede `?sayfa=2` bu ekranı
  veriyordu (talepler, teklifler, sözleşmeler, işler, arşiv, belgeler,
  posta, bildirimler). Deneme kurumunda kayıtlar tek sayfaya sığdığı
  için ikinci sayfa zaten aralık dışıydı — ama koşul kayıt sayısına
  bağlı değil: elli bir kayıtlık bir listede ikinci sayfadayken bir
  kayıt silinince, "Sonraki" ile gidilen sayfa yenilendiğinde, ya da
  bayat bir yer imiyle aynı ekran çıkıyor.

  HATA YUTULMUYOR: yalnızca bu TEK kod boş sayfa sayılıyor, geri kalan
  her okuma hatası eskisi gibi fırlıyor (lib/panel-action ve
  check:okunamayan kuralı yerinde kalsın).
*/
export function aralikDisiMi(hata: { code?: string | null } | null | undefined): boolean {
  return hata?.code === "PGRST103";
}

/**
 * ?sayfa düşürülmüş adres: var olmayan bir sayfa ilk sayfaya döner ve
 * ÖTEKİ SÜZGEÇLER KORUNUR — süzgeci de sıfırlamak, kullanıcıyı aradığı
 * listeden çıkarır.
 */
export function sayfasizAdres(yol: string, parametreler: Record<string, string | string[] | undefined>): string {
  const sorgu = new URLSearchParams();
  for (const [ad, deger] of Object.entries(parametreler)) {
    if (ad === "sayfa" || deger === undefined) continue;
    for (const tek of Array.isArray(deger) ? deger : [deger]) if (tek) sorgu.append(ad, tek);
  }
  const metin = sorgu.toString();
  return metin ? `${yol}?${metin}` : yol;
}
