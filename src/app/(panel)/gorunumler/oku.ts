import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GorunumListesi } from "@/lib/kayitli-gorunum";

/*
  Okuma, eylemlerden AYRI dosyada.

  actions.ts "use server" taşıyor ve oradan dışa verilen her fonksiyon
  ağ üzerinden çağrılabilir bir uç oluyor. Supabase istemcisini
  parametre alan bir okuma fonksiyonu böyle bir uç olarak anlamsız —
  istemci serileştirilemez — ve gereksiz bir yüzey açardı.
*/

export type Gorunum = { id: string; ad: string; sorgu: string };

/** Listenin kaydedilmiş görünümleri; şeridi çizen sayfalar buradan okuyor. */
export async function gorunumleriOku(
  supabase: SupabaseClient,
  organizationId: string,
  liste: GorunumListesi,
): Promise<Gorunum[]> {
  const { data, error } = await supabase
    .from("arc_saved_views")
    .select("id,ad,sorgu")
    .eq("organization_id", organizationId)
    .eq("liste", liste)
    .order("sira")
    .order("created_at");
  /*
    Hata YUTULMUYOR. Boş dizi döndürmek "görünüm yok" gibi okunur ve
    kullanıcı kaydettiklerinin silindiğini sanardı; şeridin sessizce
    kaybolması hata sayfasından daha kötü.
  */
  if (error) throw new Error("Kaydedilmiş görünümler okunamadı: " + error.message);
  return (data ?? []) as Gorunum[];
}
