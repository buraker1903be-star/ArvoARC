"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { aramaAnahtari, osSayfalari, type OsUygulama } from "./os-apps";
import { THEME_KEY } from "@/components/panel/theme-toggle";

/* Kaynak: ArvoOS/app/panel/os/os-command-palette.tsx (16.10.2026).
   ArvoOS'taki "müşteri sorgula" penceresi burada yok; yazılan metin
   panelin genel aramasına (/ara) gider: sipariş, ürün ve müşteri. */
const MUSTERI_SORGU_OLAYI = "os:musteri-sorgula";
import { OsSimge, type OsIkonAdi } from "./os-icons";

/* Öğeler düz veri; ne yapacakları calistir() içinde. Kapanış fonksiyonu
   taşıyan öğeler çizim sırasında ref okuyor sayılıyordu (react-hooks/refs). */
type Oge = { id: string; grup: string; label: string; ipucu?: string; ikon: OsIkonAdi } & (
  | { tur: "git"; href: string }
  | { tur: "tema" }
  | { tur: "cikis" }
  | { tur: "musteri"; sorgu: string }
);

/*
  CTRL+K / ⌘K: uygulamalar, uygulama içi sayfalar ve komutlar tek kutuda.
  Panelde hiç arama yoktu; bir ekrana gitmek menüde doğru grubu bulup
  açmayı gerektiriyordu.

  Klavye: ↑↓ gez, Enter aç, Esc kapat. Durum çubuğundaki arama kutusu da
  aynı pencereyi açar ("os:ara" olayı).

  Yalnızca kişinin dock'undaki uygulamalar ve onların sayfaları önerilir;
  yetki kararı burada verilmiyor, gizlenen bir şeyi göstermemek için
  aynı listeden besleniyor.
*/
export function OsKomutPaleti({ uygulamalar, cikis, kayitAramasi }: {
  uygulamalar: OsUygulama[];
  cikis: () => Promise<void>;
  /*
    Yazılan metni bir KAYIT listesinde aratan kısayol. Panelde bu müşteri
    sorgulama penceresi (CRM yetkisine bağlı); kurucu konsolunda kiracı
    listesi. Verilmezse kutu yalnızca ekran ve komut önerir — konsolda
    14.10.2026'ya kadar öyleydi ve kiracı adı yazan kurucu hiçbir sonuç
    görmüyordu.
  */
  /*
    DÜZ METİN, FONKSİYON DEĞİL. Layout bir SUNUCU bileşeni, bu kutu
    istemci bileşeni: araya fonksiyon geçirilemiyor, React onu
    serileştiremiyor ve render'da patlıyor. 14.10.2026'da tam bu oldu ve
    palet layout'ta olduğu için konsolun BÜTÜN ekranları 500 verdi.
    Etiketin ve adresin yazılan metinle birleşmesi burada yapılıyor.
  */
  kayitAramasi?: { etiket: string; ipucu: string; adresOneki: string };
}) {
  const router = useRouter();
  const pencere = useRef<HTMLDialogElement>(null);
  const kutu = useRef<HTMLInputElement>(null);
  const cikisFormu = useRef<HTMLFormElement>(null);
  const [sorgu, setSorgu] = useState("");
  const [secili, setSecili] = useState(0);

  const kapat = () => pencere.current?.close();
  const ac = () => {
    setSorgu("");
    setSecili(0);
    if (!pencere.current?.open) pencere.current?.showModal();
    window.requestAnimationFrame(() => kutu.current?.focus());
  };

  useEffect(() => {
    const tus = (olay: KeyboardEvent) => {
      if ((olay.ctrlKey || olay.metaKey) && olay.key.toLocaleLowerCase("en") === "k") {
        olay.preventDefault();
        if (pencere.current?.open) kapat(); else ac();
      }
    };
    const dis = () => ac();
    window.addEventListener("keydown", tus);
    window.addEventListener("os:ara", dis);
    return () => {
      window.removeEventListener("keydown", tus);
      window.removeEventListener("os:ara", dis);
    };
  }, []);

  const ikonu = new Map(uygulamalar.map((u) => [u.key, u.ikon]));
  const ogeler: Oge[] = [
    ...uygulamalar.map((u): Oge => ({ id: `app:${u.key}`, grup: "Uygulamalar", label: u.label, ikon: u.ikon, tur: "git", href: u.href })),
    ...osSayfalari(uygulamalar).map((s): Oge => ({
      id: `sayfa:${s.href}`,
      grup: "Sayfalar",
      label: s.label,
      ipucu: uygulamalar.find((u) => u.key === s.uygulama)?.label,
      ikon: ikonu.get(s.uygulama) ?? "apps",
      tur: "git",
      href: s.href,
    })),
    { id: "komut:tema", grup: "Komutlar", label: "Aydınlık / karanlık temaya geç", ikon: "moon", tur: "tema" },
    { id: "komut:cikis", grup: "Komutlar", label: "Çıkış yap", ikon: "logout", tur: "cikis" },
  ];

  const calistir = (oge: Oge) => {
    if (oge.tur === "cikis") { cikisFormu.current?.requestSubmit(); return; }
    kapat();
    if (oge.tur === "git") { router.push(oge.href); return; }
    if (oge.tur === "musteri") { window.dispatchEvent(new CustomEvent(MUSTERI_SORGU_OLAYI, { detail: { sorgu: oge.sorgu } })); return; }
    const sonraki = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", sonraki);
    try { window.localStorage.setItem(THEME_KEY, sonraki); } catch { /* gizli sekme */ }
  };

  const anahtar = aramaAnahtari(sorgu.trim());
  const eslesen = anahtar
    ? ogeler.filter((oge) => aramaAnahtari(`${oge.label} ${oge.ipucu ?? ""}`).includes(anahtar))
    : ogeler;
  /* Müşteri araması CRM'i görene, en az 2 harf yazılınca. Sonuçlar
     "Müşteri sorgula" penceresinde: yetki ve geçmiş orada. */
  const crmVar = false;
  const yazilan = sorgu.trim();
  const sonuc: Oge[] = yazilan.length < 2
    ? eslesen
    : crmVar
      ? [...eslesen, { id: "musteri", grup: "Kayıtlar", label: `“${yazilan}” için müşteri ve talep geçmişini ara`, ipucu: "CRM", ikon: "crm", tur: "musteri", sorgu: yazilan }]
      : kayitAramasi
        ? [...eslesen, {
            id: "kayit", grup: "Kayıtlar", ikon: "crm", tur: "git",
            label: `“${yazilan}” ${kayitAramasi.etiket}`,
            ipucu: kayitAramasi.ipucu,
            /* Türkçe karakter ve boşluk kaçırılmazsa adres bozulur ve
               liste boş döner; arama çalışmıyor sanılır. */
            href: `${kayitAramasi.adresOneki}${encodeURIComponent(yazilan)}`,
          }]
        : eslesen;
  const etkin = Math.min(secili, Math.max(sonuc.length - 1, 0));

  const klavye = (olay: React.KeyboardEvent) => {
    if (olay.key === "ArrowDown") { olay.preventDefault(); setSecili((etkin + 1) % Math.max(sonuc.length, 1)); }
    else if (olay.key === "ArrowUp") { olay.preventDefault(); setSecili((etkin - 1 + sonuc.length) % Math.max(sonuc.length, 1)); }
    else if (olay.key === "Enter") { olay.preventDefault(); const oge = sonuc[etkin]; if (oge) calistir(oge); }
  };

  let sonGrup = "";
  return (
    <dialog
      ref={pencere}
      className="os-palette"
      aria-label="Ara veya komut çalıştır"
      onClick={(olay) => { if (olay.target === pencere.current) kapat(); }}
    >
      <div className="os-palette-input">
        <OsSimge ad="search" boyut={20} />
        <input
          ref={kutu}
          value={sorgu}
          onChange={(olay) => { setSorgu(olay.target.value); setSecili(0); }}
          onKeyDown={klavye}
          placeholder="Uygulama, sayfa, komut ya da sipariş, ürün, müşteri ara"
          aria-label="Ara"
          aria-controls="os-palette-list"
          aria-activedescendant={sonuc[etkin] ? `os-oge-${etkin}` : undefined}
          role="combobox"
          aria-expanded="true"
          autoComplete="off"
          spellCheck={false}
        />
        <kbd>Esc</kbd>
      </div>
      <ul id="os-palette-list" className="os-palette-list" role="listbox" aria-label="Sonuçlar">
        {sonuc.map((oge, sira) => {
          const baslik = oge.grup !== sonGrup ? oge.grup : null;
          sonGrup = oge.grup;
          return (
            <li key={oge.id} role="presentation">
              {baslik ? <div className="os-palette-group" role="presentation">{baslik}</div> : null}
              <button
                id={`os-oge-${sira}`}
                type="button"
                role="option"
                aria-selected={sira === etkin}
                className={sira === etkin ? "os-palette-item is-active" : "os-palette-item"}
                onMouseMove={() => setSecili(sira)}
                onClick={() => calistir(oge)}
              >
                <span className="os-palette-icon"><OsSimge ad={oge.ikon} boyut={16} /></span>
                <span className="os-palette-label">{oge.label}</span>
                {oge.ipucu ? <small>{oge.ipucu}</small> : null}
              </button>
            </li>
          );
        })}
        {sonuc.length === 0 ? <li className="os-palette-empty">“{sorgu}” için sonuç yok</li> : null}
      </ul>
      <footer className="os-palette-foot"><span>↑↓ gez</span><span>Enter aç</span><span>Esc kapat</span></footer>
      <form ref={cikisFormu} action={cikis} hidden />
    </dialog>
  );
}

/* Durum çubuğundaki arama kutusu: paleti açar. */
export function OsAramaDugmesi() {
  return (
    <button type="button" className="os-search" onClick={() => window.dispatchEvent(new Event("os:ara"))} aria-label="Ara veya komut çalıştır (Ctrl+K)">
      <OsSimge ad="search" boyut={18} />
      <span className="os-search-text">Ara veya komut çalıştır</span>
      <kbd>Ctrl K</kbd>
    </button>
  );
}
