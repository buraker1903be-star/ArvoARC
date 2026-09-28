/*
  VARYANT MATRİSİ — seçeneklerin çarpımından varyant üretimi.

  Panelde varyant TEK TEK ekleniyordu: her biri bir form gönderimi ve
  tam bir gezinme. Dört renk × beş bedenlik bir tişört yirmi gönderim
  demek ve aradaki bir hata (aynı SKU'yu iki kez yazmak gibi) ancak
  yirminci adımda görünüyordu. Shopify'ın "Options" ekranının karşılığı
  yoktu.

  Matris, seçenek adlarını ve değerlerini alıp çarpımı kuruyor:
  Renk(Siyah, Beyaz) × Beden(S, M) → dört varyant, başlıkları
  "Siyah / S" biçiminde (Shopify'ın da kullandığı yazım; içe aktarılan
  ürünlerle aynı görünsün diye).

  ÜRETİLEN SKU ÇAKIŞAMAZ. Veritabanında (organization_id, product_id,
  sku) tekil — 28.09.2026'da on beş ürüne yazılan hayalet varyantların
  ardından kondu. Toplu ekleme, tek bir çakışan SKU yüzünden hiçbir
  varyantın eklenmemesine yol açardı; o yüzden çakışma BURADA
  çözülüyor: var olan bir başlık atlanıyor, çakışan bir kod
  numaralanıyor.

  Saf dosya; testi tests/varyant-matrisi.test.ts.
*/

export type SecenekTanimi = { ad: string; degerler: string[] };

export type MatrisSatiri = {
  baslik: string;
  sku: string;
  /** arc_product_variants.attributes: {"Renk":"Siyah","Beden":"M"}. */
  nitelikler: Record<string, string>;
};

export type MatrisSonucu = {
  satirlar: MatrisSatiri[];
  /** Zaten var olduğu için üretilmeyen birleşim sayısı. */
  atlanan: number;
  /** Doluysa hiçbir şey üretilmedi. */
  hata?: string;
  /** Sessizce değişmeyen bir şey oldu; kullanıcıya söyleniyor. */
  not?: string;
};

/** Tek seferde eklenebilecek varyant sayısı. */
export const EN_FAZLA_VARYANT = 100;
/** Seçenek sayısı: Shopify de üçte duruyor, ekran da üçten fazlasını taşımıyor. */
export const EN_FAZLA_SECENEK = 3;

/*
  SKU parçası: büyük harf, yalnızca A-Z0-9 ve tire.

  actions.ts'deki slugify ile AYNI DEĞİL ve olmamalı: o, adres
  satırındaki ürün bağlantısını üretiyor (küçük harf, 160 karakter).
  SKU depoda ve etikette okunan bir kod; büyük harf ve kısa olması
  gerekiyor.
*/
export function kodParcasi(metin: string, enFazla = 12): string {
  return String(metin ?? "")
    .toLocaleLowerCase("tr-TR")
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
    .replace(/-+$/, "")
    .toUpperCase();
}

/*
  Değerler virgülle ayrılıyor; satır sonu da ayraç sayılıyor çünkü
  listeyi başka bir yerden kopyalayıp yapıştırmak en kısa yol.
  Tekilleştirme büyük/küçük harfe bakmıyor: "Siyah" ile "siyah" tek
  renk, iki ayrı varyant değil.
*/
export function seceneginDegerleri(ham: string): string[] {
  const gorulen = new Set<string>();
  const cikti: string[] = [];
  for (const parca of String(ham ?? "").split(/[,\n;]/)) {
    const deger = parca.replace(/\s+/g, " ").trim().slice(0, 60);
    if (!deger) continue;
    const anahtar = deger.toLocaleLowerCase("tr-TR");
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    cikti.push(deger);
  }
  return cikti;
}

/*
  VİTRİN İLK PARÇAYI RENK OKUYOR.

  get_arvoculture_storefront_variants, varyant başlığını "/" ile bölüp
  BİRİNCİ parçayı renk, ikinciyi beden sayıyor. Matriste seçenekleri
  "Beden, Renk" sırasıyla yazan biri vitrine "renk: M" yazdırırdı —
  panelde her şey doğru görünürken müşteri yanlış etiketi görür.

  Bu yüzden renk gibi görünen seçenek BAŞA alınıyor ve bu kullanıcıya
  SÖYLENİYOR: sessiz bir yeniden sıralama, SKU'ların neden
  "TSHIRT-SIYAH-M" çıktığını açıklamaz.
*/
const RENK_ADLARI = ["renk", "color", "colour", "renkler"];

const renkSecenegiMi = (ad: string) =>
  RENK_ADLARI.includes(
    ad.toLocaleLowerCase("tr-TR").replace(/[ıİ]/g, "i").replace(/[şŞ]/g, "s").trim(),
  );

type Girdi = {
  /** SKU'nun başına gelen kod; boşsa üründen türetilmiş bir kod verin. */
  skuOneki: string;
  /** Üründe zaten olan SKU'lar. */
  mevcutSkular: string[];
  /** Üründe zaten olan varyant başlıkları. */
  mevcutBasliklar: string[];
};

export function matrisiKur(secenekler: SecenekTanimi[], girdi: Girdi): MatrisSonucu {
  const gecerli = secenekler
    .map((secenek) => ({ ad: String(secenek.ad ?? "").replace(/\s+/g, " ").trim().slice(0, 40), degerler: secenek.degerler }))
    .filter((secenek) => secenek.ad && secenek.degerler.length);

  if (!gecerli.length) return { satirlar: [], atlanan: 0, hata: "En az bir seçenek adı ve değeri girin." };
  if (gecerli.length > EN_FAZLA_SECENEK) return { satirlar: [], atlanan: 0, hata: `En fazla ${EN_FAZLA_SECENEK} seçenek kullanılabilir.` };

  /* Renk seçeneği başta değilse öne alınıyor; öteki seçenekler kendi
     aralarındaki sırayı koruyor. */
  const renkSirasi = gecerli.findIndex((secenek) => renkSecenegiMi(secenek.ad));
  const siralandi = renkSirasi > 0;
  const duzen = siralandi
    ? [gecerli[renkSirasi], ...gecerli.filter((_, sira) => sira !== renkSirasi)]
    : gecerli;
  const siralamaNotu = siralandi
    ? `“${gecerli[renkSirasi].ad}” seçeneği başa alındı: mağaza varyant başlığının ilk parçasını renk olarak okuyor.`
    : undefined;

  const toplam = duzen.reduce((carpim, secenek) => carpim * secenek.degerler.length, 1);
  /*
    Sınır aşıldığında HİÇBİR ŞEY üretilmiyor: ilk yüzü ekleyip
    gerisini sessizce atmak, kullanıcıya eksik bir katalog bırakır ve
    hangi birleşimin düştüğü ekranda görünmez.
  */
  if (toplam > EN_FAZLA_VARYANT) {
    return { satirlar: [], atlanan: 0, hata: `Bu seçenekler ${toplam} varyant üretir; tek seferde en fazla ${EN_FAZLA_VARYANT} eklenebilir.` };
  }

  const onek = kodParcasi(girdi.skuOneki, 16);
  if (!onek) return { satirlar: [], atlanan: 0, hata: "SKU öneki gerekli: kodlar bu önekle üretiliyor." };

  const kullanilanSku = new Set(girdi.mevcutSkular.map((sku) => String(sku ?? "").trim().toUpperCase()).filter(Boolean));
  const mevcutBaslik = new Set(girdi.mevcutBasliklar.map((baslik) => String(baslik ?? "").trim().toLocaleLowerCase("tr-TR")).filter(Boolean));

  /* Birleşimler seçeneklerin YAZILDIĞI sırada: ilk seçenek en yavaş
     değişiyor, yani liste "Siyah / S, Siyah / M, Beyaz / S…" diye akıyor. */
  let birlesimler: string[][] = [[]];
  for (const secenek of duzen) {
    birlesimler = birlesimler.flatMap((onceki) => secenek.degerler.map((deger) => [...onceki, deger]));
  }

  const satirlar: MatrisSatiri[] = [];
  let atlanan = 0;
  for (const birlesim of birlesimler) {
    const baslik = birlesim.join(" / ");
    if (mevcutBaslik.has(baslik.toLocaleLowerCase("tr-TR"))) {
      atlanan += 1;
      continue;
    }

    /*
      Kod çakışması iki değerin aynı koda inmesinden de doğabiliyor
      ("Small" ile "S" → "S"). Numaralandırma o yüzden var; atlamak
      olsaydı kullanıcı bir birleşimin neden eksik olduğunu göremezdi.
    */
    const govde = [onek, ...birlesim.map((deger) => kodParcasi(deger))].filter(Boolean).join("-");
    let sku = govde;
    for (let sayac = 2; kullanilanSku.has(sku); sayac += 1) sku = `${govde}-${sayac}`;
    kullanilanSku.add(sku);

    const nitelikler: Record<string, string> = {};
    duzen.forEach((secenek, sira) => { nitelikler[secenek.ad] = birlesim[sira]; });
    satirlar.push({ baslik, sku, nitelikler });
  }

  if (!satirlar.length) return { satirlar: [], atlanan, hata: "Bu birleşimlerin hepsi üründe zaten var." };
  return { satirlar, atlanan, not: siralamaNotu };
}
