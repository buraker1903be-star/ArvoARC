"use client";

import { useState, useTransition } from "react";
import { ConfirmSubmit } from "@/components/panel/confirm-submit";
import { Notice } from "@/components/panel/notice";
import {
  cancelTransferOrder,
  confirmTransferPayment,
  havaleIptalSonuc,
  havaleOnaySonuc,
} from "../siparisler/actions";

/*
  HAVALE EYLEMLERİ — Operasyon Merkezi.

  Operasyon Merkezi sabah açılan ekran ve genellikle birkaç havale
  birikiyor. Her onay tam bir gezinme başlatıyordu: üç ödemeyi
  onaylamak sayfayı üç kez baştan çizmek demekti.

  Yönlendirme kalkınca revalidatePath satırı bekleyenler listesinden
  düşürüyor — istenen geri bildirim zaten bu: ödeme onaylandı, sipariş
  listeden çıktı.

  ONAY PENCERESİ DURUYOR. Bu iki işlem de müşteriye e-posta gönderiyor
  ("Ödemeniz alındı" / "Siparişiniz iptal edildi") ve e-posta geri
  alınamıyor; hızlandırılacak şey gezinme, kararın ağırlığı değil.

  Kilit de sunucuda duruyor (transfer_lock): çift tıklama ya da ikinci
  sekme ikinci e-postayı göndermiyor. Yerinde işlem bunu daha da
  gerekli kılıyor, çünkü sayfa yenilenmediği için düğme ekranda kalıyor
  — o yüzden düğme işlenirken ayrıca kilitleniyor.
*/
export function HavaleEylemleri({
  siparisId,
  onayMesaji,
  iptalMesaji,
}: {
  siparisId: string;
  onayMesaji: string;
  /** Yalnızca beklemede kalmış siparişte var; yoksa iptal düğmesi çizilmiyor. */
  iptalMesaji?: string;
}) {
  const [sonuc, setSonuc] = useState<{ tur: "hata" | "basari"; metin: string } | null>(null);
  const [calisiyor, basla] = useTransition();

  const calistir = (islem: () => Promise<{ hata?: string; basari?: string }>) => {
    setSonuc(null);
    basla(async () => {
      const cevap = await islem();
      if (cevap.hata) setSonuc({ tur: "hata", metin: cevap.hata });
      else if (cevap.basari) setSonuc({ tur: "basari", metin: cevap.basari });
    });
  };

  /*
    Form duruyor, gönderimi kesiliyor: ConfirmSubmit onay penceresini
    gösterip formu normal gönderiyor, yani JavaScript kapalıyken de
    çalışan yol bozulmuyor.
  */
  return (
    <>
      <form
        action={confirmTransferPayment}
        onSubmit={(olay) => {
          olay.preventDefault();
          calistir(() => havaleOnaySonuc(siparisId));
        }}
      >
        <input type="hidden" name="order_id" value={siparisId} />
        <input type="hidden" name="back" value="/operasyon" />
        <ConfirmSubmit className="ac-btn ops-pay-btn" message={onayMesaji} disabled={calisiyor}>
          {calisiyor ? "Gönderiliyor…" : "Ödeme alındı"}
        </ConfirmSubmit>
      </form>

      {iptalMesaji ? (
        <form
          action={cancelTransferOrder}
          onSubmit={(olay) => {
            olay.preventDefault();
            calistir(() => havaleIptalSonuc(siparisId));
          }}
        >
          <input type="hidden" name="order_id" value={siparisId} />
          <input type="hidden" name="back" value="/operasyon" />
          <ConfirmSubmit className="ac-btn ac-btn-danger ops-pay-btn" message={iptalMesaji} disabled={calisiyor}>
            İptal et
          </ConfirmSubmit>
        </form>
      ) : null}

      {/* Sonuç satırın yanında: sayfa yenilenmediği için üstteki çerezli şerit okunmuyor. */}
      {sonuc ? (
        <div className="ops-pay-sonuc">
          <Notice tone={sonuc.tur === "hata" ? "error" : "success"} title={sonuc.tur === "hata" ? "İşlem tamamlanamadı" : "İşlem tamamlandı"}>
            {sonuc.metin}
          </Notice>
        </div>
      ) : null}
    </>
  );
}
