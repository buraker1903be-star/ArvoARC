"use client";

import { useEffect, useId, useRef, useState } from "react";
import "./durum-secici.css";

/*
  DURUM SEÇİCİ (16.10.2026). Durum şeritlerindeki seçimler tarayıcının
  kendi <select>'iydi: açılınca işletim sisteminin mavi listesi çıkıyor,
  tonu yalnızca yazı rengindeydi ve panelin geri kalanıyla hiç
  benzeşmiyordu. Kurum sahibi "buton klasında, premium" istedi ve bunun
  bütün ekosistemde ortak olmasını: bu dosya ArvoOS'ta da aynı
  (app/panel/components/durum-secici.tsx). Birinde değişen öbürüne de
  taşınır.

  Bir FORMUN parçası: değer gizli input'ta, seçim yapılınca form
  gönderiliyor (requestSubmit). AnindaForm'un "seçim değişince gönder"
  davranışının aynısı; gizli input'a programla yazmak change olayı
  üretmediği için iki kez gönderilmez.

  Klavye: düğmede ↓/↑/Enter/Boşluk listeyi açar; listede ↑/↓ gezinir,
  Enter seçer, Esc kapatır ve odağı düğmeye geri verir.
*/

export type DurumSecenegi = { deger: string; etiket: string; ton?: string };

export function DurumSecici({
  name,
  deger,
  secenekler,
  etiket,
  disabled = false,
  gonder = true,
}: {
  name: string;
  deger: string;
  secenekler: DurumSecenegi[];
  /** Ekran okuyucu için alanın adı ("Durum", "Ödeme"). */
  etiket: string;
  disabled?: boolean;
  /** false: yalnızca değeri değiştirir, formu göndermez. */
  gonder?: boolean;
}) {
  const [secili, setSecili] = useState(deger);
  const [acik, setAcik] = useState(false);
  const [etkin, setEtkin] = useState(0);
  const kok = useRef<HTMLDivElement>(null);
  const dugme = useRef<HTMLButtonElement>(null);
  const girdi = useRef<HTMLInputElement>(null);
  const liste = useId();

  /* Sunucudan yeni değer gelince (kayıt sonrası yeniden çizim) eşitle. */
  const [onceki, setOnceki] = useState(deger);
  if (onceki !== deger) {
    setOnceki(deger);
    setSecili(deger);
  }

  const mevcut = secenekler.find((s) => s.deger === secili) ?? secenekler[0];

  /*
    React 19 eylemden sonra formu sıfırlıyor ve gizli alan İLK çizimdeki
    değere dönüyor (ArvoOS iş detayında görev seçimleri bu yüzden key
    taşıyor). Her çizimde seçili değer gizli alana yeniden yazılıyor:
    aynı formdaki başka bir alan (ör. "Ne bekleniyor?") gönderildiğinde
    eski değer gitmesin.
  */
  useEffect(() => {
    if (girdi.current) girdi.current.value = secili;
  });

  useEffect(() => {
    if (!acik) return;
    const disari = (olay: PointerEvent) => {
      if (!kok.current?.contains(olay.target as Node)) setAcik(false);
    };
    document.addEventListener("pointerdown", disari);
    return () => document.removeEventListener("pointerdown", disari);
  }, [acik]);

  const ac = () => {
    if (disabled) return;
    setEtkin(Math.max(0, secenekler.findIndex((s) => s.deger === secili)));
    setAcik(true);
  };
  const sec = (yeni: string) => {
    setAcik(false);
    dugme.current?.focus();
    if (yeni === secili) return;
    setSecili(yeni);
    if (girdi.current) girdi.current.value = yeni;
    if (gonder) girdi.current?.form?.requestSubmit();
  };

  return (
    <div className="durum-secici" ref={kok} data-acik={acik ? "" : undefined}>
      <input ref={girdi} type="hidden" name={name} defaultValue={deger} />
      <button
        ref={dugme}
        type="button"
        className="durum-secici-dugme"
        data-tone={mevcut?.ton ?? "neutral"}
        aria-haspopup="listbox"
        aria-expanded={acik}
        aria-controls={liste}
        aria-label={`${etiket}: ${mevcut?.etiket ?? ""}`}
        disabled={disabled}
        onClick={() => (acik ? setAcik(false) : ac())}
        onKeyDown={(olay) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(olay.key) && !acik) {
            olay.preventDefault();
            ac();
          }
        }}
      >
        <i className="durum-secici-nokta" aria-hidden="true" />
        <span>{mevcut?.etiket}</span>
        <svg className="durum-secici-ok" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </button>
      {acik ? (
        <ul
          id={liste}
          role="listbox"
          aria-label={etiket}
          tabIndex={-1}
          className="durum-secici-liste"
          ref={(ul) => ul?.focus()}
          aria-activedescendant={`${liste}-${etkin}`}
          onKeyDown={(olay) => {
            if (olay.key === "Escape" || olay.key === "Tab") {
              olay.preventDefault();
              setAcik(false);
              dugme.current?.focus();
            } else if (olay.key === "ArrowDown") {
              olay.preventDefault();
              setEtkin((e) => Math.min(secenekler.length - 1, e + 1));
            } else if (olay.key === "ArrowUp") {
              olay.preventDefault();
              setEtkin((e) => Math.max(0, e - 1));
            } else if (olay.key === "Enter" || olay.key === " ") {
              olay.preventDefault();
              sec(secenekler[etkin].deger);
            }
          }}
        >
          {secenekler.map((secenek, sira) => (
            <li
              key={secenek.deger}
              id={`${liste}-${sira}`}
              role="option"
              aria-selected={secenek.deger === secili}
              data-tone={secenek.ton ?? "neutral"}
              data-etkin={sira === etkin ? "" : undefined}
              onPointerEnter={() => setEtkin(sira)}
              onClick={() => sec(secenek.deger)}
            >
              <i className="durum-secici-nokta" aria-hidden="true" />
              <span>{secenek.etiket}</span>
              {secenek.deger === secili ? (
                <svg className="durum-secici-tik" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" /></svg>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
