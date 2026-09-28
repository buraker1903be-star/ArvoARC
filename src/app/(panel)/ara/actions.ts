"use server";

import { requireTenant } from "@/lib/tenant";
import { panelAra, type AramaCiktisi } from "@/lib/panel-arama";

/*
  Komut paletinin kayıt araması.

  Palet dar bir liste gösteriyor, o yüzden sınırlar sayfadan küçük:
  amaç "hepsini göster" değil, aradığın kaydı iki tuşta açmak. Daha
  fazlası için palet /ara sayfasına bağlanıyor.

  Yetki ve kurum kısıtı requireTenant'tan geliyor; istemci yalnızca
  terimi yolluyor.
*/
export async function paletAra(terim: string): Promise<AramaCiktisi> {
  const { supabase, organization } = await requireTenant();
  return await panelAra(supabase, organization.id, String(terim ?? ""), {
    siparis: 5,
    musteri: 3,
    urun: 5,
    koleksiyon: 3,
  });
}
