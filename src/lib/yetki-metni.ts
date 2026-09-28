/*
  YETKİ HATASI METNİ — tek kaynak.

  Panelde "yetkiniz yok" mesajının SEKİZ ayrı yazımı vardı:

    "Bu işlem için yetkiniz yok."
    "Bu hesap stok işlemi yetkisine sahip değil."
    "Bu hesap ürün işlemi yetkisine sahip değil."
    "Aktarım için yetkiniz yok."
    "Temayı değiştirmek için yönetici yetkisi gerekir."
    "Bu ayarları değiştirmek için yönetici yetkisi gerekir."
    "İade işlemi için yönetici yetkisi gerekiyor."
    "Sipariş silmek için mağaza sahibi ya da yönetici olmalısınız."

  İki kusur vardı. Birincisi hiçbiri SIRADAKİ ADIMI söylemiyordu:
  kullanıcı duvara çarpıyor, yetkiyi kimin verebileceğini bilmiyordu.

  İkincisi daha kötü: bazıları YANLIŞTI. Tema ve mağaza ayarlarının
  kapısı owner/admin/manager (üç rol) olduğu hâlde mesaj "yönetici
  yetkisi gerekir" diyordu — müdür rolündeki kullanıcı yapabileceği
  bir işi yapamayacağını sanırdı.

  Bu yüzden metin KAPIDAN türetiliyor: çağıran hangi rol kümesini
  denetlediyse onu söylüyor, kendi cümlesini yazmıyor.

  Saf dosya; testi tests/yetki-metni.test.ts.
*/

/** Panelde kullanılan iki kapı; kod tarafındaki rol kümeleriyle birebir. */
export type YetkiKapisi = "yonetim" | "sahiplik";

/** owner/admin/manager — panelin günlük iş kapısı ("canManage"). */
export const YONETIM_ROLLERI = ["owner", "admin", "manager"] as const;
/** owner/admin — para ve geri alınamaz işler. */
export const SAHIPLIK_ROLLERI = ["owner", "admin"] as const;

export const rolleri = (kapi: YetkiKapisi): readonly string[] =>
  kapi === "sahiplik" ? SAHIPLIK_ROLLERI : YONETIM_ROLLERI;

export const yetkili = (kapi: YetkiKapisi, rol: string | null | undefined): boolean =>
  rolleri(kapi).includes(String(rol ?? ""));

/**
 * "İade işlemi için mağaza sahibi veya yönetici yetkisi gerekiyor.
 *  Müdür rolü bu işlemi yapamıyor; mağaza sahibinden isteyin."
 *
 * `is` cümlenin öznesi ve BÜYÜK HARFLE başlamıyor: çağıran yerde
 * "Stok hareketi", "Ürün düzenleme" gibi yazılıyor ve baş harfi
 * burada büyütülüyor — Türkçe'de i→İ dönüşümü yerele bağlı.
 */
export function yetkiYok(is: string, kapi: YetkiKapisi = "yonetim"): string {
  const ham = String(is ?? "").trim() || "Bu işlem";
  const ozne = ham.charAt(0).toLocaleUpperCase("tr-TR") + ham.slice(1);
  return kapi === "sahiplik"
    ? `${ozne} için mağaza sahibi veya yönetici yetkisi gerekiyor. Müdür rolü bu işlemi yapamıyor; mağaza sahibinden isteyin.`
    : `${ozne} için mağaza sahibi, yönetici veya müdür yetkisi gerekiyor. Hesabınızın rolü daha sınırlı; yetkinizi mağaza sahibi yükseltebilir.`;
}
