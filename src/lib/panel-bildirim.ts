import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BILDIRIM_CEREZI } from "./panel-bildirim-cerez";

/*
  PANEL İŞLEM SONUÇLARI ÇEREZDE TAŞINIYOR, ADRESTE DEĞİL.

  Önceden sonuç adrese yazılıyordu (`/siparisler/123?error=...`) ve
  sayfalar onu doğrudan basıyordu — tanınmayan kod bile
  `ERRORS[kod] ?? kod` ile olduğu gibi ekrana geliyordu. Yani dışarıdan
  gönderilen bir bağlantı, kullanıcıya sistemin ürettiği gibi görünen
  uydurma bir mesaj gösterebiliyordu: "Ödemeniz iade edildi, bu formu
  doldurun" gibi. ArvoOS'ta aynı karar bilerek verilmişti
  (ArvoOS/lib/panel-action.ts).

  Çerez kısa ömürlü ve TEK KULLANIMLIK: sayfa okuyup gösteriyor, yanına
  konan küçük bir istemci bileşeni siliyor. Silinmezse yenilemede aynı
  mesaj tekrar çıkar ve kullanıcı işlemi ikinci kez yaptığını sanır.
*/

export { BILDIRIM_CEREZI };

/*
  Üç ton var. "uyari" ayrı duruyor çünkü bazı sonuçlar hata değil bekleme
  bildiriyor (DNS kaydının yayılması gibi) ve bunu kırmızı göstermek
  kullanıcıyı yanlış yere, ayarları düzeltmeye yönlendiriyordu.
*/
export type Bildirim = { tur: "hata" | "basari" | "uyari"; metin: string };

const secenekler = () => ({
  path: "/",
  /*
    60 saniye: yönlendirme ile sayfanın açılması arasındaki süre için
    fazlasıyla yeterli. Uzun ömür, kullanıcının bir sonraki oturumunda
    eski bir mesajın çıkmasına yol açardı.
  */
  maxAge: 60,
  sameSite: "lax" as const,
  httpOnly: false, // Tarayıcı tarafı siliyor; gizli bir veri taşımıyor.
  secure: process.env.NODE_ENV === "production",
});

/** İşlem sonucunu bırakır; hemen ardından redirect çağrılabilir. */
export async function bildirimBirak(sonuc: { hata?: string; basari?: string; uyari?: string }) {
  const tur = sonuc.hata ? "hata" : sonuc.uyari ? "uyari" : "basari";
  const metin = (sonuc.hata ?? sonuc.uyari ?? sonuc.basari ?? "").trim();
  if (!metin) return;
  // Uzun mesaj çerez sınırını zorlar; 400 karakter her hata metnine yetiyor.
  (await cookies()).set(BILDIRIM_CEREZI, `${tur}:${encodeURIComponent(metin.slice(0, 400))}`, secenekler());
}

/** Bekleyen bildirimi okur (silmez; silme işi istemcide). */
export async function bildirimiOku(): Promise<Bildirim | null> {
  const ham = (await cookies()).get(BILDIRIM_CEREZI)?.value;
  if (!ham) return null;
  const ayrac = ham.indexOf(":");
  if (ayrac < 0) return null;
  const tur = ham.slice(0, ayrac);
  if (tur !== "hata" && tur !== "basari" && tur !== "uyari") return null;
  try {
    const metin = decodeURIComponent(ham.slice(ayrac + 1)).trim();
    return metin ? { tur, metin } : null;
  } catch {
    // Bozuk çerez: mesaj göstermemek, çöp göstermekten iyidir.
    return null;
  }
}

/*
  Bildirim bırakıp yönlendiren kısayol. Her ekranda aynı iki satır
  yazılıyordu ve biri unutulduğunda sonuç sessizce kayboluyordu.

  `never` dönüyor çünkü redirect akışı kesiyor; çağıranın `return await`
  yazması gerekiyor — "await" tek başına TypeScript'in ulaşılmazlık
  çıkarımını tetiklemiyor ve sonraki satırlar daraltılmamış tiplerle
  derlenmeye çalışılıyor.
*/
export async function bildirimliDonus(hedef: string, sonuc: { hata?: string; basari?: string; uyari?: string }): Promise<never> {
  await bildirimBirak(sonuc);
  redirect(hedef);
}
