import { bildirimiOku } from "@/lib/panel-bildirim";
import { Notice } from "./notice";
import { BildirimTemizle } from "./bildirim-temizle";

/*
  İşlem sonucu şeridi. Kaynağı ÇEREZ; adres satırındaki ?error= artık
  okunmuyor, çünkü dışarıdan gönderilen bir bağlantı kullanıcıya uydurma
  bir mesaj gösterebiliyordu (lib/panel-bildirim.ts).

  Sunucu bileşeni çerezi silemiyor (Next yalnızca işlem ve route
  handler'da yazmaya izin veriyor); silme işi yanındaki istemci
  bileşeninde.
*/
export async function PanelBildirimi({ basarililBaslik }: { basarililBaslik?: string } = {}) {
  const bildirim = await bildirimiOku();
  if (!bildirim) return null;
  return (
    <>
      <Notice
        tone={bildirim.tur === "hata" ? "error" : bildirim.tur === "uyari" ? "warn" : "success"}
        title={
          bildirim.tur === "hata"
            ? "İşlem tamamlanamadı"
            : bildirim.tur === "uyari"
              ? "Bekleniyor"
              : (basarililBaslik ?? "İşlem tamamlandı")
        }
      >
        {bildirim.metin}
      </Notice>
      <BildirimTemizle />
    </>
  );
}
