import type { SupabaseClient } from "@supabase/supabase-js";
import { lrFiyatlariniTara, LR_BASLANGIC } from "./tarama";

/*
  Taramanın sonucunu arc_price_collections'a bırakır.

  FİYAT YAZMAZ. Liste panelde önizlenip onaylanıyor; LR kalıbı
  değiştirdiğinde yanlış sayı okunabilir ve canlı mağazada yanlış fiyat
  geri alınamaz bir hatadır.

  Satırlar tarayıcı toplayıcısıyla AYNI biçimde yazılıyor
  ({sku, ad, fiyatlar[]}): iki yol da panelde aynı önizlemeden geçiyor.

  Tablonun INSERT politikası yok; yazma servis anahtarıyla yapılıyor
  (çağıran yetkiyi kendisi doğrulamış olmalı).
*/
export async function lrTaramasiniKaydet(
  supabase: SupabaseClient,
  organizationIds: string[],
  secenekler: { enFazlaSayfa?: number; sureMs?: number } = {},
): Promise<{ yazilan: number; satir: number; gezilen: number; hata: string | null }> {
  const tarama = await lrFiyatlariniTara(secenekler);
  if (tarama.hata) return { yazilan: 0, satir: 0, gezilen: tarama.gezilen, hata: tarama.hata };
  if (!tarama.satirlar.length) {
    return { yazilan: 0, satir: 0, gezilen: tarama.gezilen, hata: "LR sayfalarında ürün bulunamadı." };
  }

  const satirlar = tarama.satirlar.map((satir) => ({ sku: satir.sku, ad: satir.ad, fiyatlar: [satir.fiyat] }));
  /*
    Kaynak 'lr-genel': girişsiz görünen MÜŞTERİ fiyatı. Yer imiyle
    toplanan liste 'lr' ve girişliyse alış fiyatı olabiliyor; ikisini
    tek etikette toplamak, hangisinin ne olduğunu kaybetmek demekti.
  */
  const kayitlar = organizationIds.map((organization_id) => ({
    organization_id,
    kaynak: "lr-genel",
    satirlar,
    sayfa: LR_BASLANGIC,
  }));
  if (!kayitlar.length) return { yazilan: 0, satir: satirlar.length, gezilen: tarama.gezilen, hata: null };

  const { error } = await supabase.from("arc_price_collections").insert(kayitlar);
  if (error) return { yazilan: 0, satir: satirlar.length, gezilen: tarama.gezilen, hata: error.message };
  return { yazilan: kayitlar.length, satir: satirlar.length, gezilen: tarama.gezilen, hata: null };
}
