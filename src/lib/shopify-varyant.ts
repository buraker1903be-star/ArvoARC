/*
  SHOPIFY CSV'SİNDEN VARYANT SATIRLARI. Saf modül; testi
  tests/shopify-varyant.test.ts.

  NEDEN AYRI BİR MODÜL: buradaki kural canlı veriyi bozdu ve kusur
  içe aktarım fonksiyonunun içine gömülü olduğu için hiç test
  edilmemişti. 20.08.2026'daki tek bir içe aktarımda on beş ürünün her
  birine 4-5 HAYALET VARYANT yazıldı (aynı SKU, boş nitelik, "Default"
  başlık) ve bu ancak 28.09.2026'da fiyat aktarımı yanlış kayda yazınca
  fark edildi.

  Shopify'ın dışa aktarımında bir ürün birkaç satır kaplar: ilk satır
  varyantı, sonrakiler çoğunlukla yalnızca görseli taşır. Görsel
  satırları da aynı SKU ve fiyatı taşıyabiliyor, yani "fiyatı var demek
  ki varyanttır" denemiyor.
*/

import { parseMoneyToCents } from "./money";

export type HamSatir = Record<string, string>;

export interface VaryantSatiri {
  sku: string;
  title: string;
  attributes: Record<string, string>;
  price: number;
  compare_at_price: number | null;
  external_id: string;
}

/*
  KİMLİK SKU'DAN ÜRETİLİYOR, SIRADAN DEĞİL.

  Eskiden `${handle}:${n}` yazılıyordu; n, süzülmüş satırlar içindeki
  sıraydı ve upsert anahtarı da buydu (organization_id, external_id).
  Yani bir varyantın kimliği CSV'deki YERİYDİ: dosyaya bir satır
  eklenince sonraki bütün varyantlar kayıyor, 3.'nün verisi 4.'nün
  satırına yazılıyordu. Stok koruması da aynı anahtarla okunduğu için
  stok yanlış varyanta gidiyor ya da sıfırlanıyordu.
*/
export const varyantKimligi = (handle: string, sku: string) => `${handle}:${sku}`;

/*
  SKU'SUZ SATIR İÇİN ÜRETİLEN KİMLİK.

  Handle 35 karaktere kırpılıyordu ve ilk 35 karakteri aynı olan iki
  ürün, aynı sıra numarasında AYNI SKU'yu alıyordu. Kırpılan kısmın
  özeti ekleniyor: kısa kalıyor ama çakışmıyor.
*/
export function uretilmisSku(handle: string, sira: number): string {
  const govde = handle.slice(0, 35).toUpperCase();
  const kuyruk = handle.length > 35 ? `-${ozet(handle)}` : "";
  return `ArvoARC-${govde}${kuyruk}-${String(sira).padStart(3, "0")}`;
}

/* Kısa, kararlı özet (djb2). Kriptografik değil; amacı yalnızca ayırmak. */
function ozet(metin: string): string {
  let h = 5381;
  for (let i = 0; i < metin.length; i++) h = ((h << 5) + h + metin.charCodeAt(i)) >>> 0;
  return h.toString(36).toUpperCase().slice(0, 6);
}

const kirp = (deger: string | undefined) => String(deger ?? "").trim();

/**
 * Bir ürünün CSV satırlarından varyantlar.
 *
 * @returns satirlar — yazılacak varyantlar; hayalet — varyant sayılmayan satır sayısı.
 */
export function shopifyVaryantlari(
  handle: string,
  satirlar: HamSatir[],
  secenekAdlari: Record<number, string>,
): { satirlar: VaryantSatiri[]; hayalet: number } {
  const cikti = new Map<string, VaryantSatiri>();
  let hayalet = 0;
  let sira = 0;

  for (const ham of satirlar) {
    const nitelikler: Record<string, string> = {};
    for (const i of [1, 2, 3]) {
      const ad = secenekAdlari[i];
      const deger = kirp(ham[`Option${i} Value`]);
      if (ad && deger) nitelikler[ad] = deger;
    }
    const fiyatMetni = kirp(ham["Variant Price"]);
    const skuMetni = kirp(ham["Variant SKU"]);

    /* Ne fiyatı ne SKU'su ne de seçeneği olan satır varyant değil (yalnızca görsel). */
    if (!fiyatMetni && !skuMetni && !Object.keys(nitelikler).length) continue;

    sira += 1;
    const sku = skuMetni || uretilmisSku(handle, sira);

    /*
      AYNI SKU İKİNCİ KEZ GELDİYSE satır varyant değil.

      Eskiden ayıklama şu anahtarla yapılıyordu:
        [Option1..3 Value, Variant SKU, Variant Price].join("|")
      Değerler KIRPILMADAN alınıyordu — oysa nitelikler kırpılarak
      okunuyordu. Yani yalnızca boşlukla ayrılan iki satır ayrı varyant
      sayılıyor, ama nitelikleri boş kaldığı için "Default" başlıkla
      yazılıyordu. Canlıdaki hayalet satırların şekli tam olarak buydu:
      bir gerçek başlık + 4-5 tane "Default", hepsi aynı SKU'da.

      SKU zaten varyantın kimliği; ayıklama da onunla yapılıyor. Nitelik
      taşıyan satır, taşımayana tercih ediliyor: gerçek varyant satırı
      genellikle ilk gelir ama garanti değil.
    */
    const onceki = cikti.get(sku);
    if (onceki) {
      hayalet += 1;
      if (Object.keys(onceki.attributes).length || !Object.keys(nitelikler).length) continue;
    }

    /* Fiyat zaten kuruş olarak saklanıyor; öncekini metne çevirip yeniden ayrıştırmak yüz katına çıkarırdı. */
    const fiyat = fiyatMetni ? parseMoneyToCents(fiyatMetni) : (onceki?.price ?? 0);
    const ustuCiziliMetni = kirp(ham["Variant Compare At Price"]);
    const ustuCizili = ustuCiziliMetni ? parseMoneyToCents(ustuCiziliMetni) : (onceki?.compare_at_price ?? 0);

    cikti.set(sku, {
      sku,
      /*
        Başlık "Default" DEĞİL. Nitelik yoksa SKU yazılıyor: "Default",
        aynı üründe birkaç kez görününce hangi varyantın hangisi olduğunu
        ekranda da veride de okunamaz hale getiriyordu.
      */
      title: Object.values(nitelikler).join(" / ") || sku,
      attributes: nitelikler,
      price: fiyat,
      /* Üstü çizili fiyat ancak satış fiyatının ÜSTÜNDEYSE anlamlı; değilse kampanya yok. */
      compare_at_price: ustuCizili > fiyat ? ustuCizili : null,
      external_id: varyantKimligi(handle, sku),
    });
  }

  return { satirlar: [...cikti.values()], hayalet };
}

/*
  PANELDEN YÖNETİLEN ÜRÜN.

  Bazı ürünler Shopify CSV'sinden geldi ama orada SKU'ları yoktu; SKU'yu
  içe aktarım üretti (ArvoARC-<handle>-001) ve o kimlik LR'da karşılığı
  olmadığı için fiyat akışına hiç girmedi. Doğru SKU'lar elle yazılınca
  aynı CSV'nin tekrar aktarılması, üretilmiş kimliği YENİDEN üretip
  düzeltilmiş kaydın yanına ikinci bir varyant ekler.

  Bu yüzden ürün "panelden yönetiliyor" diye işaretlenebiliyor: içe
  aktarım o handle'a hiç dokunmuyor. İşaret metadata'da, ayrı bir sütun
  değil — ürün metadata'sı zaten içe aktarım ayarlarını taşıyor
  (shopify_handle, images_migrated…) ve şema anlık görüntüsü el
  değmeden kalıyor.
*/
export const PANEL_YONETIMI_ANAHTARI = "panelden_yonetiliyor";

export function panelYonetiminde(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const deger = (metadata as Record<string, unknown>)[PANEL_YONETIMI_ANAHTARI];
  /* Metin de kabul ediliyor: jsonb'den 'true' olarak okunabiliyor. */
  return deger === true || deger === "true";
}
