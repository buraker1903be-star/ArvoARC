"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import "./os-pencere.css";

/*
  PENCERE SİSTEMİ. Kaynak: ArvoOS/app/panel/platform/musteriler/[id]/pencere.tsx
  (16.10.2026). ArvoOS'ta kayıt detayının düğmeleri sayfadan ayrılmadan
  bir pencere açıyor; ArvoARC'ta eskiden her biri ayrı bir sayfaya ya da
  sayfanın dibindeki bir forma gidiyordu.

  Pencere ADRESTE (?pencere=…): içerik sunucuda yalnızca açık pencere için
  okunuyor; içindeki form kaydedince sayfa yeniden çiziliyor ve adres aynı
  kaldığı için pencere AÇIK kalıyor — istemcide tutulan bir "açık mı"
  durumu o yeniden çizimde kaybolurdu.

  showModal() elle çağrılıyor: <dialog open> pencereyi kipsiz yapıyor
  (arka plan tıklanabilir, Esc çalışmıyor). Kapanınca adres pencere
  parametresi olmadan değişiyor.
*/
export function Pencere({ ust, baslik, kapatAdresi, genis = true, children }: {
  ust: string;
  baslik: string;
  kapatAdresi: string;
  genis?: boolean;
  children: ReactNode;
}) {
  const pencere = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const oge = pencere.current;
    if (oge && !oge.open) oge.showModal();
  }, []);

  return (
    <dialog
      ref={pencere}
      className={genis ? "plt-pencere is-genis" : "plt-pencere"}
      aria-label={baslik}
      /*
        Kapanma olayı KENDİSİNDEN mi geldi? İçeride başka bir <dialog>
        (onay penceresi) açılabiliyor; React olayı kendi ağacında yukarı
        taşıdığı için iç pencereyi kapatmak bunu da kapatıyordu (ArvoOS,
        15.10.2026, canlıda ölçüldü).
      */
      onClose={(olay) => { if (olay.target === pencere.current) router.replace(kapatAdresi, { scroll: false }); }}
      onClick={(olay) => { if (olay.target === pencere.current) pencere.current?.close(); }}
    >
      <div className="plt-pencere-govde">
        <header className="plt-pencere-bas">
          <div>
            <small>{ust}</small>
            <h2>{baslik}</h2>
          </div>
          <button type="button" className="plt-pencere-kapat" aria-label="Kapat" onClick={() => pencere.current?.close()}>×</button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
