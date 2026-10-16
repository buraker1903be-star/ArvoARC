"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { geriHedefi, kokSayfaMi, type OsUygulama } from "./os-apps";
import { OsSimge } from "./os-icons";

/*
  TELEFONDA GERİ DÜĞMESİ (12.10.2026). Ana ekrana eklenen panel tam
  ekran açılıyor ve iPhone'da bu kipte ne tarayıcının geri tuşu ne de
  kenardan kaydırma var: alt sayfadan (talep, iş, personel detayı)
  listeye dönmenin tek yolu alttaki sekmeye basıp baştan gelmekti.

  Yalnızca alt sayfalarda görünür (kök sayfalar alt çubuk ve bölüm
  menüsünden zaten açılıyor) ve yalnızca telefonda (mobil-uygulama.css;
  masaüstünde gizli).

  Uygulama içinde gelindiyse tarayıcı geçmişiyle geri: listenin
  süzgeci ve kaydırma yeri korunur. Sayfa dışarıdan açıldıysa (bildirim,
  bağlantı) geçmişte panel yok; o zaman sayfayı kapsayan bölüme gider.
*/
export function OsGeri({ uygulamalar }: { uygulamalar: OsUygulama[] }) {
  const yol = usePathname();
  const router = useRouter();
  /* Bu kabuk sayfa geçişlerinde yeniden kurulmuyor (layout); ilk açılıştan
     sonra her yol değişikliği uygulama içi bir gezinme. */
  const ilkYol = useRef(yol);
  const iceride = useRef(false);
  useEffect(() => {
    if (yol !== ilkYol.current) iceride.current = true;
  }, [yol]);

  if (kokSayfaMi(uygulamalar, yol)) return null;
  return (
    <button
      type="button"
      className="os-geri"
      aria-label="Geri"
      onClick={() => (iceride.current ? router.back() : router.push(geriHedefi(uygulamalar, yol)))}
    >
      <OsSimge ad="back" boyut={22} />
      <span>Geri</span>
    </button>
  );
}
