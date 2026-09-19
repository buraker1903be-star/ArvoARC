import { NextResponse } from "next/server";

/*
  Dağıtımın hangi Supabase projesine bağlı olduğunu ve hangi sürümle
  çalıştığını söyler. Veritabanı taşınırken (AYRILMA.md) giriş sorunlarının
  nedenini ayırmak için gerekti: panel ve giriş sayfası bu adresi hiçbir
  yerde göstermiyordu. Proje adresi gizli değil (vitrin sayfalarında açıkta);
  anahtar, kullanıcı ya da veri döndürülmez.
*/
export const dynamic = "force-dynamic";

export function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let supabase = "tanımsız";
  try { supabase = new URL(url).hostname; } catch {}
  return NextResponse.json(
    {
      supabase,
      servis_anahtari: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      surum: (process.env.VERCEL_GIT_COMMIT_SHA ?? "yerel").slice(0, 7),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
