"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { satirTiklamaKipi } from "@/lib/satir-tiklama";

/*
  SATIRIN TAMAMI TIKLANABİLİR.

  Eskiden bu, ilk hücredeki bağlantıya konan görünmez bir ::after
  kaplamasıyla yapılıyordu: tr{position:relative} + ::after{inset:0}.
  Kaplamanın satır boyunda kalması <tr>'nin mutlak konumlu alt öğeler için
  kapsayıcı blok oluşturmasına bağlı ve Safari bunu yapmıyor — kaplama
  kartın tamamına yayılıyor, boş bir yere tıklamak alakasız bir kayıt
  açıyor ve liste hiç kaymıyordu (08.10.2026).

  Artık konumlandırmaya hiç dayanmıyor: tabloya TEK bir dinleyici
  bağlanıyor, tıklanan satırın ilk hücresindeki gerçek bağlantı bulunup
  oraya gidiliyor. Satır başına bileşen yok; yüz satırlık bir tabloda bile
  tek dinleyici.

  Gerçek bağlantı yerinde duruyor: klavyeyle gezinme, ekran okuyucu ve
  "yeni sekmede aç" onun üzerinden çalışmaya devam ediyor. Bu dinleyici
  yalnızca satırın BOŞ alanına yapılan tıklamayı ekliyor.
*/

/** Kendi işini yapan öğeler: onlara yapılan tıklama satıra sayılmaz. */
const KENDI_ISI = "a,button,input,select,textarea,label,summary,details,form,[role='button']";

export function SatirTiklama() {
  const isaret = useRef<HTMLSpanElement>(null);
  const router = useRouter();

  useEffect(() => {
    /* Kap, bileşenin kendi ebeveyni: tabloyu saran kutu. Sınıf adına
       bağlanmıyoruz ki tablo düzeni değişince kural sessizce kopmasın. */
    const kap = isaret.current?.parentElement;
    if (!kap) return;

    const tiklandi = (olay: MouseEvent) => {
      const hedef = olay.target as HTMLElement | null;
      if (!hedef) return;
      // Ctrl/Cmd yeni sekme, Shift yeni pencere: bağlantının kendisi gibi.
      const kip = satirTiklamaKipi(olay);
      if (kip === "yoksay") return;
      // Hücredeki kendi bağlantısı/düğmesi varsa o çalışsın.
      if (hedef.closest(KENDI_ISI)) return;
      // Metin seçiyorsa gitmeyelim: seçim bitince tıklama da düşüyor.
      if (window.getSelection()?.toString()) return;

      /* Tablo satırı ya da .satir-tiklanir listesinin öğesi (cari
         penceresindeki ödeme takvimi tablo değil liste). */
      const satir = hedef.closest("tbody tr, .satir-tiklanir > li");
      const adres = satir?.querySelector<HTMLAnchorElement>("a.crm-row-link")?.getAttribute("href");
      /* Gidilecek sayfası olmayan satır (ör. maliyet kalemi): satırın
         penceresini açan düğme .satir-ac ile işaretlenir, ona basılır. */
      if (!adres) {
        if (kip === "ayni-sekme") satir?.querySelector<HTMLButtonElement>("button.satir-ac")?.click();
        return;
      }
      /* Aynı sayfada kalan adres (ör. ?maliyet=… penceresi) listeyi en
         üste kaydırmasın: pencere kapanınca kişi kaldığı satırı arıyordu. */
      const ayniSayfa = new URL(adres, window.location.href).pathname === window.location.pathname;
      if (kip === "ayni-sekme") router.push(adres, ayniSayfa ? { scroll: false } : undefined);
      else window.open(adres, "_blank", kip === "yeni-pencere" ? "noopener,popup" : "noopener");
    };

    kap.addEventListener("click", tiklandi);
    return () => kap.removeEventListener("click", tiklandi);
  }, [router]);

  return <span ref={isaret} hidden />;
}
