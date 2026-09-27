import { parseMoneyToCents } from "./money";

/*
  ALIŞ FİYATI AKTARIMI: yapıştırılan metinden SKU ve maliyet.

  LR'ın partner portalı fiyat listesi indirmiyor; fiyatlar yalnızca
  ekranda görünüyor. Otomatik giriş yapıp kazımak denenmedi ve
  denenmemeli: şifre saklamayı gerektirir, portalın kullanım şartlarına
  aykırı olması olası ve sessizce yanlış fiyat çekerse kâr yanlış
  hesaplanır (27.09.2026'da kâr sütunu eklendiğinde konuşuldu).

  Bunun yerine kullanıcı tablodaki satırları kopyalayıp yapıştırıyor.
  Ayrıştırıcı BİLEREK LİBERAL: kopyalanan metin sekmeyle, noktalı
  virgülle ya da birkaç boşlukla ayrılmış gelebiliyor ve fiyat sütunu
  ilk de olabilir son da.
*/

export interface MaliyetSatiri {
  sku: string;
  kurus: number;
}

export interface AyristirmaSonucu {
  satirlar: MaliyetSatiri[];
  /** Okunamayan satırlar; kullanıcıya olduğu gibi gösteriliyor. */
  atlanan: string[];
}

/*
  Fiyat gibi görünen parça: rakam içeriyor ve rakam/ayırıcı/para
  simgesi dışında bir şey taşımıyor. "340,50", "₺340,50", "340.50 TL"
  geçerli; "LR-340" geçersiz — SKU'lar da rakam içeriyor ve onu fiyat
  sanmak bütün aktarımı bozardı.
*/
const fiyatGibi = (parca: string): boolean => {
  const sade = parca.replace(/[₺$€\s]/g, "").replace(/TL$/i, "");
  return /^[0-9]+([.,][0-9]+)*$/.test(sade) && /[0-9]/.test(sade);
};

/* SKU gibi görünen parça: en az bir harf ya da tire içeriyor. */
const skuGibi = (parca: string): boolean => /[A-Za-z\-_]/.test(parca) && parca.length >= 2;

export function maliyetleriAyristir(metin: string): AyristirmaSonucu {
  const satirlar: MaliyetSatiri[] = [];
  const atlanan: string[] = [];
  const gorulen = new Set<string>();

  for (const ham of String(metin ?? "").split(/\r?\n/)) {
    const satir = ham.trim();
    if (!satir) continue;

    /*
      Başlık satırı atlanıyor: kopyalanan tabloda "SKU / Fiyat" gibi bir
      satır olabiliyor ve fiyat sütunu okunamadığı için zaten elenecek —
      ama kullanıcıya "atlandı" diye göstermek gereksiz gürültü.
    */
    const parcalar = satir.split(/\t|;|\s{2,}|,(?=\s)/).map((p) => p.trim()).filter(Boolean);
    if (parcalar.length < 2) {
      // Tek boşlukla ayrılmış olabilir: "LR-123 340,50"
      const tek = satir.split(/\s+/);
      if (tek.length >= 2) parcalar.splice(0, parcalar.length, ...tek);
      else { atlanan.push(satir); continue; }
    }

    const fiyatIndeksi = parcalar.findLastIndex(fiyatGibi);
    const sku = parcalar.find((p, i) => i !== fiyatIndeksi && skuGibi(p));
    if (fiyatIndeksi < 0 || !sku) { atlanan.push(satir); continue; }

    const kurus = parseMoneyToCents(parcalar[fiyatIndeksi]);
    // Sıfır fiyat "okunamadı" demek: parseMoneyToCents geçersizde 0 dönüyor.
    if (!kurus) { atlanan.push(satir); continue; }

    const anahtar = sku.toLocaleUpperCase("tr-TR");
    /* Aynı SKU iki kez geçerse SONUNCU kazanıyor: kullanıcı düzeltmeyi
       alta ekliyor olabilir. */
    if (gorulen.has(anahtar)) {
      const mevcut = satirlar.findIndex((s) => s.sku.toLocaleUpperCase("tr-TR") === anahtar);
      satirlar[mevcut] = { sku, kurus };
      continue;
    }
    gorulen.add(anahtar);
    satirlar.push({ sku, kurus });
  }

  return { satirlar, atlanan };
}
