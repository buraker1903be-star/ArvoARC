import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/tenant";
import { magazaAdresi } from "@/lib/magaza-adresi";

/*
  Panelin "Mağazayı gör" bağlantısı.

  Yedek adres ArvoCulture'dı: adresi olmayan BAŞKA bir salonun sahibi
  kendi mağazasına gitmek isterken o markanın vitrinine düşüyordu.
  Adres artık kiracının kaydından çözülüyor (doğrulanmış özel alan adı,
  platform alt alan adı, en son eski storefront_url); yoksa kullanıcı
  adresi bağlayacağı yere gönderiliyor.
*/
export async function GET(istek: Request) {
  const { supabase, organization } = await requireTenant();
  const { data } = await supabase
    .from("arc_store_settings")
    .select("storefront_url,custom_domain,domain_verified_at,platform_subdomain")
    .eq("organization_id", organization.id)
    .maybeSingle();
  const adres = data ? magazaAdresi(data) : null;
  return NextResponse.redirect(adres ? new URL(adres) : new URL("/ayarlar#magaza-alan-adi", istek.url));
}
