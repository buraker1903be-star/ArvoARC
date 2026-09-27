import { kategoriBaglantilari, urunleriAyristir, type LrUrunu } from "./katalog";
import { lrGetir, type CerezTorbasi } from "./istek";

/*
  LR'IN HERKESE AÇIK KATALOĞUNUN TARANMASI.

  Kullanıcının asıl istediği buydu: "sistemin otomatik olarak taranıp
  fiyatları güncellemesi". Müşteri fiyatı (bizim TAVANIMIZ) girişsiz
  görünüyor, yani sunucu kendi başına okuyabiliyor; yer imi yalnızca
  girişli alış fiyatları için gerekiyor.

  Tarama yine FİYAT YAZMIYOR: liste arc_price_collections'a bırakılıyor,
  panelde önizlenip onaylanıyor. LR bir gün kalıbı değiştirirse yanlış
  sayı okunabilir ve canlı mağazada yanlış fiyat geri alınamaz.

  Sayfalar SIRAYLA ve sınırlı sayıda geziliyor: başkasının sunucusuna
  paralel yüzlerce istek atmak doğru değil, üstelik zaman bütçesi
  aşılınca işlev ortada kesilirdi.
*/

export const LR_BASLANGIC = "https://shop.lrworld.com/home/TR/tr";

export interface TaramaSonucu {
  satirlar: LrUrunu[];
  gezilen: number;
  /** Bütçe dolduğu için gezilemeyen sayfa sayısı. */
  kalan: number;
  hata: string | null;
}

export async function lrFiyatlariniTara({
  baslangic = LR_BASLANGIC,
  enFazlaSayfa = 40,
  sureMs = 40_000,
  getir = lrGetir,
  simdi = () => Date.now(),
}: {
  baslangic?: string;
  enFazlaSayfa?: number;
  sureMs?: number;
  getir?: typeof lrGetir;
  simdi?: () => number;
} = {}): Promise<TaramaSonucu> {
  const bitis = simdi() + sureMs;
  const torba: CerezTorbasi = new Map();

  const ilk = await getir(baslangic, torba);
  if (ilk.durum !== 200) {
    /* Hata yutulmuyor: boş liste dönmek "LR'da ürün kalmamış" gibi okunurdu. */
    return { satirlar: [], gezilen: 0, kalan: 0, hata: `LR sayfası açılamadı (HTTP ${ilk.durum}).` };
  }

  const sira = kategoriBaglantilari(ilk.html, ilk.adres);
  const gezildi = new Set<string>([ilk.adres]);
  const toplanan = new Map<string, LrUrunu>();
  const ekle = (satirlar: LrUrunu[]) => {
    for (const satir of satirlar) toplanan.set(satir.sku, satir);
  };
  ekle(urunleriAyristir(ilk.html).satirlar);

  let gezilen = 1;
  while (sira.length && gezilen < enFazlaSayfa) {
    if (simdi() >= bitis) break;
    const adres = sira.shift()!;
    if (gezildi.has(adres)) continue;
    gezildi.add(adres);

    const cevap = await getir(adres, torba);
    gezilen += 1;
    if (cevap.durum !== 200) continue;
    ekle(urunleriAyristir(cevap.html).satirlar);

    /*
      Alt kategoriler yalnızca sınıra kadar kuyruğa giriyor: menü
      kendini tekrar ettiği için kuyruk aksi hâlde sürekli büyür.
    */
    if (gezildi.size + sira.length < enFazlaSayfa * 2) {
      for (const bag of kategoriBaglantilari(cevap.html, cevap.adres)) {
        if (!gezildi.has(bag) && !sira.includes(bag)) sira.push(bag);
      }
    }
  }

  return { satirlar: [...toplanan.values()], gezilen, kalan: sira.length, hata: null };
}
