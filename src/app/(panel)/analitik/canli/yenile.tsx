"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/*
  CANLI EKRANI TAZELER.

  Önceden tazeleme haritanın içindeydi: istemci bileşeni on saniyede
  bir sunucu işlemini çağırıp noktaları değiştiriyordu. Yeni düzende
  şerit, akış, açık sayfalar ve kaynaklar da canlı; hepsini istemciye
  taşımak sayfanın tamamını istemci bileşeni yapardı. Bunun yerine
  sunucu bileşeni yeniden çiziliyor (`router.refresh()`).

  SEKME ARKADAYKEN TAZELENMEZ: açık bırakılan bir panel gün boyu boşa
  sorgu üretirdi. Sekmeye dönülünce hemen tazeleniyor, yoksa on
  saniyeye kadar eski sayıya bakılıyordu.

  GERÇEK ZAMANLI ABONELİK (Realtime) KULLANILMIYOR: `arc_visits` RLS
  açık ve politikasız, yayın tarayıcıya satır göndermez — tabloyu
  açmak da istenen bir şey değil.
*/
export function CanliYenile({ saniye = 10 }: { saniye?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tazele = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const zamanlayici = window.setInterval(tazele, saniye * 1000);
    document.addEventListener("visibilitychange", tazele);
    return () => {
      window.clearInterval(zamanlayici);
      document.removeEventListener("visibilitychange", tazele);
    };
  }, [router, saniye]);

  return null;
}
