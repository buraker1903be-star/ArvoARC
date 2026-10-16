"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { usePathname } from "next/navigation";
import { etkinBolum, etkinUygulama, type OsUygulama } from "./os-apps";
import { OsSimge } from "./os-icons";

/* Kaynak: ArvoOS/app/panel/os/os-dock.tsx (16.10.2026). Başlatıcıdaki
   "Diğer Arvo ürünleri" ArvoOS'ta markalı karolar; burada baş harf
   (logolar ArvoOS deposunda). */
export type DigerUygulama = { kod: string; ad: string; href: string; ayniSekme: boolean };

/*
  DOCK. Eski kenar menüsünün yerini alır: ekranın altında yüzen tek sıra
  uygulama. Açık uygulamanın altında kurum renginde bir nokta durur.
  Telefonda da aynı dock alt gezinme çubuğu olur; sığmayan uygulamalar
  yana kayar, hepsi başlatıcıda.

  İKİNCİ DOCK. Fareyle bir uygulamanın üstüne gelince dock'un hemen
  üstünde o uygulamanın bölümleri açılır (CRM: Genel Bakış, Talepler,
  Teklifler…). Liste os-bolumler.ts'ten, açık bölüm vurgulu. Sayfa içi
  sekme çubukları kalktığı için bölümlere giden yol bu: dokunmatikte
  üstüne gelme olmadığından bölümü olan ikona DOKUNMAK uygulamayı açmaz,
  ikinci dock'u açar (tekrar dokunmak ya da dışarı dokunmak kapatır).
  Klavyede ikondayken ↑ açar
  ve ilk bölüme geçer, Esc kapatır. İkon ile ikinci dock arasında imleç
  gezerken kapanmasın diye kapanma kısa bir gecikmeyle.

  BAŞLATICI. Sağdaki ızgara düğmesi ekranın ortasında bir pencere açar:
  kurumun bütün uygulamaları büyük ikonlarla, altta kurumun lisanslı diğer
  Arvo ürünleri. Ürünler yeni sekmede açılır (gerekçe panel-navigation.tsx).
*/
/*
  İkinci dock'ta Genel Bakış yok: uygulamanın simgesine basmak zaten genel
  bakışı açıyor, ayrıca yer kaplıyordu (kurum sahibinin isteği, 2026-10).
  Ctrl+K'da "CRM genel bakış" olarak duruyor.
*/
const altBolumler = (u: OsUygulama) => (u.bolumler ?? []).filter((b) => b.key !== "genel-bakis");

export function OsDock({ uygulamalar, digerUygulamalar }: { uygulamalar: OsUygulama[]; digerUygulamalar: DigerUygulama[] }) {
  const yol = usePathname();
  const pencere = useRef<HTMLDialogElement>(null);
  const etkin = etkinUygulama(uygulamalar, yol);
  const home = uygulamalar.find((u) => u.key === "home");
  const dockta = uygulamalar.filter((u) => u.key !== "home" && u.key !== "settings" && !u.yalnizBaslatici);

  const zaman = useGecikme();
  /* Açıldığı sayfa da tutulur: sayfa değişince ikinci dock kendiliğinden
     gizlenir (efektte state yazmadan). */
  const [altDurum, setAlt] = useState<{ key: string; x: number; alt: number; yol: string } | null>(null);
  const alt = altDurum && altDurum.yol === yol ? altDurum : null;

  const konum = (oge: HTMLElement) => {
    const r = oge.getBoundingClientRect();
    const d = oge.closest(".os-dock")?.getBoundingClientRect();
    return { x: r.left + r.width / 2, alt: d ? window.innerHeight - d.top + 10 : 96, yol };
  };
  const kapat = (gecikme = 220) => {
    if (gecikme === 0) { zaman.iptal(); setAlt(null); return; }
    zaman.kur(() => setAlt(null), gecikme);
  };
  const ac = (uygulama: OsUygulama, oge: HTMLElement, gecikme = 90) => {
    if (!altBolumler(uygulama).length) { kapat(0); return; }
    const yer = konum(oge);
    zaman.kur(() => setAlt({ key: uygulama.key, ...yer }), gecikme);
  };

  // Dokunmatikte açıkken dışarıya dokunmak kapatır (fareyle ayrılınca zaten kapanıyor).
  const acikAnahtar = alt?.key ?? null;
  useEffect(() => {
    if (!acikAnahtar) return;
    const disari = (olay: PointerEvent) => {
      const hedef = olay.target as Element | null;
      if (hedef?.closest(".os-subdock, .os-dock-item.is-sub-open")) return;
      setAlt(null);
    };
    document.addEventListener("pointerdown", disari);
    return () => document.removeEventListener("pointerdown", disari);
  }, [acikAnahtar]);

  // Pencere boyu değişince konum bayatlar: kapanır.
  useEffect(() => {
    const yeniden = () => setAlt(null);
    window.addEventListener("resize", yeniden);
    return () => window.removeEventListener("resize", yeniden);
  }, []);

  const fareMi = (olay: ReactPointerEvent) => olay.pointerType === "mouse";
  const ikonKlavye = (uygulama: OsUygulama) => (olay: ReactKeyboardEvent<HTMLElement>) => {
    if (olay.key === "ArrowUp" && altBolumler(uygulama).length) {
      olay.preventDefault();
      zaman.iptal();
      setAlt({ key: uygulama.key, ...konum(olay.currentTarget) });
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>(".os-subdock a")?.focus());
    } else if (olay.key === "Escape") kapat(0);
  };
  const altUygulama = alt ? uygulamalar.find((u) => u.key === alt.key) : null;
  const altEtkin = altUygulama?.bolumler ? etkinBolum(altUygulama.bolumler, yol, typeof window === "undefined" ? "" : window.location.search) : null;

  const simge = (uygulama: OsUygulama) => {
    const acik = etkin?.key === uygulama.key;
    return (
      <Link
        key={uygulama.key}
        href={uygulama.href}
        className={["os-dock-item", acik ? "is-active" : "", alt?.key === uygulama.key ? "is-sub-open" : ""].filter(Boolean).join(" ")}
        aria-label={uygulama.rozet ? `${uygulama.label}, ${uygulama.rozet} okunmamış` : uygulama.label}
        aria-current={acik ? "page" : undefined}
        aria-haspopup={altBolumler(uygulama).length ? "true" : undefined}
        aria-expanded={altBolumler(uygulama).length ? alt?.key === uygulama.key : undefined}
        onPointerEnter={(olay) => { if (fareMi(olay)) ac(uygulama, olay.currentTarget); }}
        onPointerLeave={(olay) => { if (fareMi(olay)) kapat(); }}
        onKeyDown={ikonKlavye(uygulama)}
        onPointerDown={(olay) => zaman.isaretciKaydet(olay.pointerType)}
        onClick={(olay) => {
          /* Telefonda (≤760px) sekme uygulamayı doğrudan açar; bölümler
             sayfanın üstündeki şeritte (os-bolum-seridi.tsx). Bu ara menü
             telefonda yazıyı kaydırıyor, bağlantıları dokunuşu kaçırıyordu. */
          if (!zaman.dokunmaMi() || !altBolumler(uygulama).length || window.matchMedia("(max-width: 760px)").matches) return;
          olay.preventDefault();
          if (alt?.key === uygulama.key) kapat(0);
          else { zaman.iptal(); setAlt({ key: uygulama.key, ...konum(olay.currentTarget) }); }
        }}
      >
        <OsSimge ad={uygulama.ikon} boyut={22} />
        <span className="os-dock-label">{uygulama.label}</span>
        {uygulama.rozet ? <b className="os-dock-badge">{uygulama.rozet > 99 ? "99+" : uygulama.rozet}</b> : null}
      </Link>
    );
  };

  return (
    <>
      {altUygulama?.bolumler && alt ? (
        <nav
          className="os-subdock"
          aria-label={`${altUygulama.label} bölümleri`}
          style={{ left: Math.min(Math.max(alt.x, 160), (typeof window === "undefined" ? 1280 : window.innerWidth) - 160), bottom: alt.alt }}
          onPointerEnter={() => zaman.iptal()}
          onPointerLeave={(olay) => { if (fareMi(olay)) kapat(); }}
          onKeyDown={(olay) => {
            if (olay.key === "Escape") {
              const ikon = document.querySelector<HTMLElement>(".os-dock .os-dock-item.is-sub-open");
              kapat(0);
              ikon?.focus();
            }
          }}
        >
          <span className="os-subdock-title">{altUygulama.label}</span>
          {altBolumler(altUygulama).map((bolum) => (
            <Link
              key={bolum.key}
              href={bolum.href}
              className={altEtkin?.key === bolum.key ? "is-active" : undefined}
              aria-current={altEtkin?.key === bolum.key ? "page" : undefined}
              onClick={() => kapat(0)}
            >
              {bolum.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <nav className="os-dock" aria-label="Uygulamalar" onPointerLeave={(olay) => { if (fareMi(olay)) kapat(); }}>
        {home ? simge(home) : null}
        <span className="os-dock-sep" aria-hidden="true" />
        {dockta.map(simge)}
        <span className="os-dock-sep" aria-hidden="true" />
        <button type="button" className="os-dock-item" aria-haspopup="dialog" title="Tüm uygulamalar" onClick={() => pencere.current?.showModal()}>
          <OsSimge ad="apps" boyut={22} />
          <span className="os-dock-label">Uygulamalar</span>
        </button>
      </nav>

      <dialog
        ref={pencere}
        className="os-launcher"
        aria-label="Uygulamalar"
        /* Pencerenin dışına basınca kapanır: hedef dialog ise tıklama boşluğa gelmiştir. */
        onClick={(olay) => { if (olay.target === pencere.current) pencere.current?.close(); }}
      >
        <header className="os-launcher-head">
          <div>
            <h2>Uygulamalar</h2>
            <p>Mağazanızın bütün çalışma alanları.</p>
          </div>
          <button type="button" className="os-icon-btn" aria-label="Kapat" onClick={() => pencere.current?.close()}>
            <OsSimge ad="close" boyut={18} />
          </button>
        </header>
        <div className="os-launcher-grid">
          {uygulamalar.map((uygulama) => (
            <Link key={uygulama.key} href={uygulama.href} className="os-launcher-app" onClick={() => pencere.current?.close()}>
              <span className={etkin?.key === uygulama.key ? "os-app-tile is-active" : "os-app-tile"}>
                <OsSimge ad={uygulama.ikon} boyut={30} />
              </span>
              <span>{uygulama.label}</span>
            </Link>
          ))}
        </div>
        {digerUygulamalar.length ? (
          <section className="os-launcher-products" aria-label="Diğer Arvo ürünleri">
            <h3>Diğer Arvo ürünleri</h3>
            <div className="os-launcher-grid">
              {digerUygulamalar.map((urun) => (
                <a
                  key={urun.kod}
                  href={urun.href}
                  className="os-launcher-app"
                  onClick={() => pencere.current?.close()}
                  {...(urun.ayniSekme ? {} : { target: "_blank", rel: "noreferrer" })}
                >
                  <span className="os-app-tile os-app-tile--product">
                    <i aria-hidden="true">{urun.ad.replace(/^Arvo\s*/, "").slice(0, 1)}</i>
                  </span>
                  <span>{urun.ad} {urun.ayniSekme ? null : <OsSimge ad="external" boyut={12} />}</span>
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </dialog>
    </>
  );
}

/*
  Gecikmeli aç/kapa: tek zamanlayıcı. Yeni bir istek öncekini iptal eder
  (fare ikondan ikona geçerken önceki açma ya da kapama düşer). Zamanlayıcı
  ref'te; yalnızca olay işleyicilerinden çağrılır.
*/
function useGecikme() {
  const kimlik = useRef(0);
  const isaretci = useRef("mouse");
  useEffect(() => () => window.clearTimeout(kimlik.current), []);
  return useMemo(() => ({
    /** Son basışın türü: dokunmatikte tıklama ikinci dock'u açar. */
    isaretciKaydet(tur: string) { isaretci.current = tur; },
    dokunmaMi() { return isaretci.current !== "mouse"; },
    kur(is: () => void, ms: number) {
      window.clearTimeout(kimlik.current);
      kimlik.current = window.setTimeout(is, ms);
    },
    iptal() {
      window.clearTimeout(kimlik.current);
    },
  }), []);
}
