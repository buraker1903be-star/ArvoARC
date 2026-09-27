import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { izlemeSuresiDoldu, izlenmeliMi } from "@/lib/kargo-bolme";
import { gonderiDurumunuYenile } from "@/lib/kargo-durumu-yenile";
import { kargoBildirimiGonder } from "@/lib/kargo-bildirimi-gonder";
import { decryptSecret } from "@/lib/payment-credentials";

/*
  KARGO DURUMLARININ ZAMANLANMIŞ GÜNCELLENMESİ.

  Önceden yalnızca sipariş ekranındaki düğme vardı: durum ancak biri o
  siparişi açıp düğmeye bastığında ilerliyordu. Müşteri "kargom nerede"
  diye sorduğunda panelde günler önceki durum yazıyordu ve teslim edilen
  gönderiler "yolda" görünmeye devam ediyordu.

  Webhook yerine ÇEKME tercih edildi: OTO'nun webhook'u var ama gönderdiği
  yükün şekli belgelenmemiş ve tahmine dayalı bir uç, yanlış eşleşen bir
  bildirimin gönderiyi "teslim edildi" yapması demekti.

  Yetki: Vercel Cron "Authorization: Bearer <CRON_SECRET>" gönderir.
  CRON_SECRET tanımlı değilse uç herkese 401 döner (kapalı başarısızlık).
  Servis anahtarı RLS'i atladığı için yetkiyi bu uç kendisi doğruluyor.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Hobby planında üst sınır 60 saniye; parti bu yüzden sınırlı.
export const maxDuration = 60;

/*
  Tek turda sorulacak gönderi sayısı. OTO çağrıları sıralı gidiyor
  (her biri bir ağ turu) ve 60 saniyeye sığması gerekiyor. Artan kayıt
  bir sonraki tura kalıyor; sıralama en eski güncellenene öncelik
  verdiği için hiçbiri sürekli geride kalmıyor.
*/
const PARTI = 40;

/*
  Kaç gün boyunca sorulur. Kargoya verilmiş ama durumu ilerlemeyen
  gönderi sonsuza kadar sorulmamalı: firma kaydı düşürmüş olabilir ve
  her tur onu yeniden sorarsa sıra gerçek gönderilere kalmaz.
*/
const IZLEME_GUNU = 30;

function sameSecret(provided: string | null, secret: string | undefined) {
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const bearer = (request: Request) => request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

type GonderiSatiri = {
  id: string;
  organization_id: string;
  order_id: string;
  sequence: number;
  status: string;
  shipped_at: string | null;
  /*
    PostgREST bire-bir ilişkiyi nesne olarak döndürüyor ama bazı
    sürümlerde tek elemanlı DİZİ geliyor. İki şekil de okunuyor: yanlış
    varsayım, bütün gönderilerin sessizce elenmesi ve zamanlanmış görevin
    hiçbir şey yapmadan "başarılı" dönmesi demekti.
  */
  arc_orders: { order_number: string } | { order_number: string }[] | null;
};

const siparisNosu = (gonderi: GonderiSatiri): string | null => {
  const kayit = Array.isArray(gonderi.arc_orders) ? gonderi.arc_orders[0] : gonderi.arc_orders;
  return kayit?.order_number?.trim() || null;
};

export async function GET(request: Request) {
  if (!sameSecret(bearer(request), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  }

  const supabase = serviceClient();
  const simdi = new Date();

  /*
    EN ESKİ GÜNCELLENEN ÖNCE. Parti dolduğunda kalanlar bir sonraki tura
    kalıyor; bu sıralama olmadan aynı kayıtlar her turda başa geçer ve
    listenin sonundaki gönderiler hiç sorulmazdı.
  */
  const { data, error } = await supabase
    .from("arc_shipments")
    .select("id,organization_id,order_id,sequence,status,shipped_at,arc_orders(order_number)")
    .eq("source", "oto")
    .order("updated_at", { ascending: true })
    .limit(PARTI * 2);
  if (error) {
    console.error("[kargo] gönderiler okunamadı", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const izlenecek = ((data ?? []) as unknown as GonderiSatiri[])
    .filter((gonderi) => izlenmeliMi(gonderi.status))
    .filter((gonderi) => !izlemeSuresiDoldu(gonderi.shipped_at, simdi, IZLEME_GUNU))
    .filter((gonderi) => Boolean(siparisNosu(gonderi)))
    .slice(0, PARTI);

  if (!izlenecek.length) {
    return NextResponse.json({ sorulan: 0, guncellenen: 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  /*
    Anahtar MAĞAZA BAŞINA bir kez çözülüyor. Gönderi başına çözmek, aynı
    mağazanın kırk gönderisinde kırk kez şifre çözme demekti; üstelik
    ayarı olmayan mağaza için kırk kez boşa sorgu.
  */
  const magazaIdleri = [...new Set(izlenecek.map((gonderi) => gonderi.organization_id))];
  const { data: ayarlar } = await supabase
    .from("arc_store_settings")
    .select("organization_id,tryoto_enabled,tryoto_refresh_token_enc")
    .in("organization_id", magazaIdleri);

  const anahtarlar = new Map<string, string>();
  for (const ayar of (ayarlar ?? []) as Array<{ organization_id: string; tryoto_enabled: boolean | null; tryoto_refresh_token_enc: string | null }>) {
    if (!ayar.tryoto_enabled || !ayar.tryoto_refresh_token_enc) continue;
    try {
      anahtarlar.set(ayar.organization_id, decryptSecret(ayar.tryoto_refresh_token_enc));
    } catch {
      // Başka bir şifreleme anahtarıyla yazılmış kayıt: o mağaza atlanıyor.
      console.error("[kargo] anahtar çözülemedi", ayar.organization_id);
    }
  }

  let guncellenen = 0;
  const hatalar: string[] = [];
  /*
    Bildirilecek siparişler BİRİKTİRİLİYOR: durum güncellemesi bir pakete
    ilk kez takip numarası yazmış olabiliyor ve aynı siparişin birkaç
    paketi aynı turda güncellenebiliyor. Sipariş başına tek çağrı, paket
    başına tek e-posta gönderiyor.
  */
  const bildirilecek = new Map<string, string>();

  for (const gonderi of izlenecek) {
    const anahtar = anahtarlar.get(gonderi.organization_id);
    if (!anahtar) continue;
    const sonuc = await gonderiDurumunuYenile(supabase, gonderi.organization_id, anahtar, {
      id: gonderi.id,
      sequence: gonderi.sequence,
      status: gonderi.status,
      siparisNo: siparisNosu(gonderi)!,
    });
    if (sonuc.guncellendi) {
      guncellenen += 1;
      bildirilecek.set(gonderi.order_id, gonderi.organization_id);
    } else if (sonuc.hata) {
      hatalar.push(`${siparisNosu(gonderi)}-${gonderi.sequence}: ${sonuc.hata}`);
    }
  }

  for (const [orderId, magazaId] of bildirilecek) {
    await kargoBildirimiGonder(supabase, magazaId, orderId);
  }

  /*
    Hepsi düştüyse 500 dönülüyor: 200, Vercel'in zamanlayıcı geçmişinde
    "sorun yok" gösteriyor ve tamamen kopmuş bir entegrasyon hiç fark
    edilmiyordu. Kısmi hata başarısızlık sayılmıyor — tek bir gönderinin
    OTO'da bulunamaması normal ve sebebi kartına yazıldı.
  */
  const tamamenBasarisiz = guncellenen === 0 && hatalar.length > 0;
  if (hatalar.length) console.error("[kargo] güncellenemeyen gönderiler", hatalar);
  return NextResponse.json(
    { sorulan: izlenecek.length, guncellenen, hata: hatalar.length },
    { status: tamamenBasarisiz ? 500 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
