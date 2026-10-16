/*
  Kişi adlarını tek biçime getirir: "Adı Soyadı", her sözcüğün baş harfi
  büyük. ArvoOS'taki lib/format-name.ts ile aynı kural (16.10.2026).

  Vitrinden gelen siparişte adı müşteri kendisi yazıyor: aynı listede
  "ORHAN UĞUZ", "çetin halil gedik" ve "Ferah Ahmed" yan yana duruyordu;
  büyük harfli olanlar gözle daha iri görünüyor, küçük harfli olanlar
  özensiz. Yazı boyutu aynı, sorun veride.

  Türkçe'de i/İ ve ı/I eşleşmesi İngilizce'den farklı olduğu için
  toLocaleUpperCase("tr-TR") şart: "irmak" → "Irmak" değil "İrmak".

  Veri DEĞİŞTİRİLMİYOR, yalnızca gösterim biçimleniyor: fatura ve kargo
  etiketi gibi resmi çıktılarda kayıtlı hâl kullanılır.
*/

const upper = (value: string) => value.toLocaleUpperCase("tr-TR");
const lower = (value: string) => value.toLocaleLowerCase("tr-TR");

// Ad içinde büyük kalması gereken kısaltmalar ve unvanlar
const KEEP_UPPER = new Set(["OP", "DR", "PROF", "DOÇ", "YRD", "MD", "PHD", "AV"]);

function formatWord(word: string): string {
  if (!word) return word;
  const bare = word.replace(/[.]/g, "");
  if (KEEP_UPPER.has(upper(bare))) return upper(word);
  // Tireli ve kesme işaretli adlar: "ali-veli", "o'brien"
  return word
    .split(/([-'’])/)
    .map((part) => (/^[-'’]$/.test(part) || !part ? part : upper(part.charAt(0)) + lower(part.slice(1))))
    .join("");
}

export function formatPersonName(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.split(" ").map(formatWord).join(" ");
}
