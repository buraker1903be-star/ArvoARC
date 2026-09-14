"use client";

import { Icon } from "./icons";

export const THEME_KEY = "arvoarc.theme";

/*
  Karanlık / aydınlık mod. Tercih localStorage'da; kök yerleşimdeki
  küçük betik sayfa çizilmeden önce okuyup <html data-theme> yazar,
  böylece yenilemede beyaz parlama olmaz.

  Hangi simgenin görüneceği CSS'te (html[data-theme]) seçiliyor:
  sunucu temayı bilmediği için simgeyi React durumunda tutmak
  hidrasyon uyuşmazlığı çıkarırdı.
*/
export function ThemeToggle() {
  function toggle() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* gizli sekme: tercih bu oturumla sınırlı kalır */
    }
  }

  return (
    <button type="button" className="panel-icon-button panel-theme-toggle" onClick={toggle} aria-label="Aydınlık / karanlık mod" title="Aydınlık / karanlık mod">
      <span className="theme-icon-moon"><Icon name="moon" size={17} /></span>
      <span className="theme-icon-sun"><Icon name="sun" size={17} /></span>
    </button>
  );
}
