/*
  ADRES PARÇASI (slug) — tek kaynak.

  Panelde ÜÇ ayrı kopyası vardı (urunler/actions.ts, urunler/[id]/
  actions.ts, koleksiyonlar/actions.ts) ve biri ötekilerden FARKLI
  davranıyordu: Türkçe harfleri NFD ayrıştırmasına bırakıyordu. ç, ğ,
  ö, ü birleşik karakter olduğu için bu yolla çözülüyor ama NOKTASIZ ı
  (U+0131) ayrı bir temel harf; ayrışmıyor ve süzgeçte siliniyordu.

  Sonuç: "Kırmızı Elbise" ürünü oluşturulurken "k-rm-z-elbise",
  düzenleyicide kaydedilirken "kirmizi-elbise" oluyordu. Yani ürüne
  dokunmadan Kaydet'e basmak mağazadaki adresini değiştiriyordu.

  Tedarikçi tarafındaki lib/supplier/tarzyeri.ts'nin kendi slugify'ı
  ayrı bırakıldı: o, tedarikçinin ürün kodlarıyla birlikte çalışıyor
  ve buradaki değişiklikler oradaki eşleşmeyi bozabilir.

  Saf dosya; testi tests/slug.test.ts.
*/

/** Türkçe metni adres parçasına çevirir. */
export function slugla(deger: unknown, enFazla = 160): string {
  return String(deger ?? "")
    .toLocaleLowerCase("tr-TR")
    /* Bu altı harf AÇIKÇA çevriliyor: ı ayrışmıyor, ötekiler de
       yazımın beklenen karşılığına insin diye burada duruyor. */
    .replace(/[çÇ]/g, "c")
    .replace(/[ğĞ]/g, "g")
    .replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o")
    .replace(/[şŞ]/g, "s")
    .replace(/[üÜ]/g, "u")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, enFazla)
    /* Kırpma tirenin ortasında bitmesin: "kirmizi-" gibi bir adres olmaz. */
    .replace(/-+$/, "");
}

/**
 * Kullanılmayan ilk adres: taban, taban-2, taban-3…
 * (organization_id, slug) tekil olduğu için kopyalama bunu kullanıyor.
 */
export function bosSlug(taban: string, kullanilan: Iterable<string>, enFazlaDeneme = 200): string | null {
  const alinmis = new Set([...kullanilan].map((slug) => String(slug ?? "").trim().toLowerCase()));
  if (!taban) return null;
  if (!alinmis.has(taban)) return taban;
  for (let sayac = 2; sayac <= enFazlaDeneme; sayac += 1) {
    const aday = `${taban}-${sayac}`;
    if (!alinmis.has(aday)) return aday;
  }
  return null;
}
