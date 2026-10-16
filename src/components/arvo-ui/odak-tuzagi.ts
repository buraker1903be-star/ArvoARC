"use client";

import { useEffect, type RefObject } from "react";

/*
  AÇILIR KATMANDA KLAVYE TUZAĞI (15.10.2026).

  Panelde dört ayrı açılır katman var (bildirim çekmecesi, mesaj
  penceresi, PanelDrawer, PanelBottomSheet) ve dördü de aynı şekilde
  yazılmıştı: portal ile .panel-root'a basılıyor, role="dialog"
  aria-modal="true" taşıyor, Esc ile kapanıyor. Hiçbirinde odak tuzağı
  yoktu.

  ARIA ODAĞI TUTMAZ. aria-modal ekran okuyucuya "arkası kapalı" der;
  klavyeyi hapsetmez. Canlıda ölçüldü: bildirim çekmecesinde dokuz
  Tab'da, mesaj penceresinde üç Tab'da odak arkadaki sayfaya düşüyordu.
  Katman o sırada ekranı kaplıyor, yani kullanıcı görmediği kontrollerde
  geziniyor ve bastığında arkada bir şey oluyor.

  Üç parça birlikte gerekiyor; biri eksikse ötekiler yarım kalıyor:
   1. Açılışta odak katmana alınır (kapsayıcıya tabIndex -1 verilir ya
      da kapat düğmesi gösterilir).
   2. Açıkken kabuğun kalanı inert olur.
   3. Kapanışta odak geldiği yere döner.

  Kapatma yüzeyi (backdrop) katmanın KENDİ kökünün içinde olduğu için
  dışarı tıklayıp kapatma inert'ten etkilenmiyor.

  Yalnızca bu kancanın eklediği inert geri alınır: başka bir sebeple
  zaten inert olan bir öğeyi kapanışta açmak, sessizce yeni bir kapı
  açmak olurdu.
*/
export function useOdakTuzagi(
  acik: boolean,
  /** Açılışta odaklanacak öğe: katmanın kapsayıcısı ya da kapat düğmesi. */
  odakRef: RefObject<HTMLElement | null>,
  /** Katmanın .panel-root altındaki kök sınıfı (ör. "ntd-root"). */
  kokSinifi: string,
) {
  useEffect(() => {
    if (!acik) return;
    const aktif = document.activeElement;
    const geriOdak = aktif instanceof HTMLElement && !aktif.closest(`.${kokSinifi}`) ? aktif : null;

    const kabuk = document.querySelector(".panel-root");
    const disaridakiler = kabuk
      ? [...kabuk.children].filter(
          (el): el is HTMLElement =>
            el instanceof HTMLElement && !el.classList.contains(kokSinifi) && !el.hasAttribute("inert"),
        )
      : [];
    for (const el of disaridakiler) el.setAttribute("inert", "");

    const kare = window.requestAnimationFrame(() => odakRef.current?.focus({ preventScroll: true }));

    return () => {
      window.cancelAnimationFrame(kare);
      for (const el of disaridakiler) el.removeAttribute("inert");
      if (geriOdak && geriOdak.isConnected && geriOdak.offsetParent !== null) {
        geriOdak.focus({ preventScroll: true });
      }
    };
  }, [acik, odakRef, kokSinifi]);
}
