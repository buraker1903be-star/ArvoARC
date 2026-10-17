/*
  TÜRKÇE İYELİK EKİ — SAYININ OKUNUŞUNA BAĞLI (17.10.2026).

  "Cironun %3'ü" doğru, "%100'i" yanlış ("yüzü"), "%0'i" yanlış
  ("sıfırı"), "%67'i" yanlış ("altmış yedisi"). Ek rakamın
  görünüşünden değil OKUNUŞUNDAN çıkıyor: son sözcüğün son ünlüsü
  (ünlü uyumu) ve ünlüyle bitip bitmediği belirliyor.

  Bu yüzden ekrandaki cümleler ya ekten kaçacak biçimde yazılır ("ciroda
  ilk beşin payı %82") ya da ek BURADAN alınır. Panelde iki örnek birden
  yaşandı: "%82'i" (16.10.2026) ve "%99'i" (17.10.2026) — ikisi de
  kullanıcıya yanlış Türkçe gösterdi.

  Saf; testi tests/turkce-ek.test.ts.
*/

/** Sayının okunuşundaki SON sözcük ("yüz", "dokuz", "otuz"…). */
export function sonSozcuk(sayi: number): string {
  const n = Math.abs(Math.round(sayi));
  if (n === 0) return "sıfır";
  const BIRLER = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
  const ONLAR = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
  const birler = n % 10;
  if (birler) return BIRLER[birler];
  const onlar = Math.floor((n % 100) / 10);
  if (onlar) return ONLAR[onlar];
  if (n % 1000) return "yüz";
  if (n % 1_000_000) return "bin";
  if (n % 1_000_000_000) return "milyon";
  return "milyar";
}

/*
  Son sözcüğe göre 3. tekil iyelik eki. Ünlüyle biten sözcükte
  araya kaynaştırma 's'si giriyor ("altısı", "yedisi", "ikisi").
*/
const EKLER: Record<string, string> = {
  sıfır: "ı", bir: "i", iki: "si", üç: "ü", dört: "ü", beş: "i", altı: "sı", yedi: "si", sekiz: "i", dokuz: "u",
  on: "u", yirmi: "si", otuz: "u", kırk: "ı", elli: "si", altmış: "ı", yetmiş: "i", seksen: "i", doksan: "ı",
  yüz: "ü", bin: "i", milyon: "u", milyar: "ı",
};

/** Kesme işaretiyle birlikte ek: 3 → "'ü", 100 → "'ü", 0 → "'ı", 7 → "'si". */
export function iyelikEki(sayi: number): string {
  return `'${EKLER[sonSozcuk(sayi)] ?? "i"}`;
}

/** "%45'i", "%100'ü", "%0'ı" — yüzdeyi ekiyle birlikte yazar. */
export function yuzdeEkli(yuzde: number): string {
  const tam = Math.round(yuzde);
  return `%${Math.abs(tam)}${iyelikEki(tam)}`;
}
