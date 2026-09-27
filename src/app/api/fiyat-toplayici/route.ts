import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { jetonuCoz } from "@/lib/fiyat-toplayici-jeton";
import { satirlariDogrula } from "@/lib/fiyat-toplayici";

/*
  TARAYICI TOPLAYICISININ BIRAKTIĞI LİSTE.

  LR'ın fiyatları yalnızca ekranda görünüyor (portal liste indirmiyor) ve
  girişliyken alış, çıkışken müşteri fiyatı yazıyor. Sunucudan taramak
  şifre saklamayı gerektirirdi; bu yüzden toplayıcı kullanıcının kendi
  oturumunda çalışıp satırları BURAYA bırakıyor, panel önizleyip
  uyguluyor. Fiyat bu uçta YAZILMIYOR — yanlış sütun toplanmış olabilir.

  Yetki jetondan (lib/fiyat-toplayici-jeton.ts): istek başka bir alan
  adından, çerezsiz geliyor. Servis anahtarı RLS'i atladığı için yetkiyi
  bu uç kendisi doğruluyor; tablonun INSERT politikası yok.

  CORS: yanıt kimlik bilgisi taşımıyor, yetki gövdedeki jetonda. Bu
  yüzden köken `*` — LR'ın sayfası tek köken değil (ülke ve dil yolları
  aynı alan adında ama kullanıcı kısa bağlantılardan da geliyor).
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
};

/*
  Sınır MAĞAZA BAŞINA: toplayıcı elle tıklanıyor, dakikada birkaç tur
  normal. Jetonu sızmış biri tabloyu doldurmayı deneyebilir.
*/
const sinir = createRateLimiter({ limit: 12, windowMs: 60_000 });

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  let gelen: { jeton?: unknown; sayfa?: unknown; satirlar?: unknown };
  try {
    gelen = (await request.json()) as typeof gelen;
  } catch {
    return NextResponse.json({ hata: "Gövde okunamadı." }, { status: 400, headers: CORS });
  }

  const kimlik = jetonuCoz(typeof gelen.jeton === "string" ? gelen.jeton : "");
  if (!kimlik) {
    /*
      Süresi dolmuş ve imzası tutmayan jeton AYNI yanıtı alıyor ama mesaj
      kullanıcıya ne yapacağını söylüyor: yer imi kodu panelde yenilenir.
    */
    return NextResponse.json(
      { hata: "Yer imi geçersiz ya da süresi dolmuş. Panelden yeni kodu alın." },
      { status: 401, headers: CORS },
    );
  }

  if (!sinir(`${kimlik.organizationId}:${clientIp(request)}`).ok) {
    return NextResponse.json({ hata: "Çok sık gönderim. Bir dakika sonra deneyin." }, { status: 429, headers: CORS });
  }

  const { satirlar, atlanan } = satirlariDogrula(gelen.satirlar);
  if (!satirlar.length) {
    return NextResponse.json(
      { hata: "Sayfadan okunabilir fiyat çıkmadı.", atlanan },
      { status: 422, headers: CORS },
    );
  }

  const sayfa = typeof gelen.sayfa === "string" ? gelen.sayfa.slice(0, 500) : null;
  const supabase = serviceClient();
  const { error } = await supabase.from("arc_price_collections").insert({
    organization_id: kimlik.organizationId,
    kaynak: "lr",
    satirlar,
    sayfa,
  });
  if (error) {
    /*
      Hata yutulmuyor: kullanıcı tarayıcıda "gönderildi" görüp panelde
      hiçbir şey bulamazsa sebebini arayacak yeri yok.
    */
    console.error("[fiyat-toplayici] liste yazılamadı", error.message);
    return NextResponse.json({ hata: "Liste kaydedilemedi." }, { status: 500, headers: CORS });
  }

  return NextResponse.json({ alinan: satirlar.length, atlanan }, { headers: CORS });
}
