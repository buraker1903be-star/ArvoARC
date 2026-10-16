"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as KlavyeOlayi } from "react";
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

  ARAMA ve onSec SONRADAN EKLENDİ (16.10.2026), ikisi de İSTEĞE BAĞLI:
  varsayılan davranış birebir eskisi, yani ArvoOS'taki kopya olduğu
  gibi çalışmaya devam eder. Manuel sipariş penceresinde seçenek
  sayısı 243'tü; tarayıcının <select>'i hiç değilse yazarak atlamaya
  izin veriyordu, aramasız bir liste onun GERİSİNE düşerdi.
*/

export type DurumSecenegi = { deger: string; etiket: string; ton?: string };

export function DurumSecici({
  name,
  deger,
  secenekler,
  etiket,
  disabled = false,
  gonder = true,
  bicim = "hap",
  aranabilir = false,
  onSec,
}: {
  name: string;
  deger: string;
  secenekler: DurumSecenegi[];
  /** Ekran okuyucu için alanın adı ("Durum", "Ödeme"). */
  etiket: string;
  disabled?: boolean;
  /** false: yalnızca değeri değiştirir, formu göndermez. */
  gonder?: boolean;
  /*
    BİÇİM. "hap" durum şeritleri için: etiket gibi, renk noktalı.
    "alan" bir FORM alanı için: kutu biçimli, nokta yok, yanındaki
    metin kutularıyla aynı boy ve köşe. İkisi de aynı listeyi, aynı
    klavye davranışını ve aynı erişilebilirlik sözleşmesini kullanıyor;
    tarayıcının <select>'i formlarda da panelin dilinin dışında
    kalıyordu.
  */
  bicim?: "hap" | "alan";
  /** Liste uzunsa (ürün/varyant gibi) üstte arama kutusu çıkar. */
  aranabilir?: boolean;
  /** Seçim değişince haber verir: dışarıdaki toplam/özet canlı kalsın. */
  onSec?: (deger: string) => void;
}) {
  const [secili, setSecili] = useState(deger);
  const [acik, setAcik] = useState(false);
  const [etkin, setEtkin] = useState(0);
  const [sorgu, setSorgu] = useState("");
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

  /* Arama Türkçe küçük harfle: "İ" ve "I" aynı kutuda yazılıyor. */
  const sade = (metin: string) => metin.toLocaleLowerCase("tr-TR");
  const gorunen = aranabilir && sorgu.trim() ? secenekler.filter((s) => sade(s.etiket).includes(sade(sorgu.trim()))) : secenekler;

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

  /* Ok tuşuyla gezilen satır kaydırma alanının dışına düşüyordu:
     aria-activedescendant listeyi kendiliğinden kaydırmıyor. */
  useEffect(() => {
    if (!acik) return;
    document.getElementById(`${liste}-${etkin}`)?.scrollIntoView({ block: "nearest" });
  }, [acik, etkin, liste]);

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
    setSorgu("");
    setEtkin(Math.max(0, secenekler.findIndex((s) => s.deger === secili)));
    setAcik(true);
  };
  /* Klavye iki yerden geliyor (arama kutusu ve liste); kural tek. */
  const klavye = (olay: KlavyeOlayi<HTMLElement>) => {
    if (olay.key === "Escape" || olay.key === "Tab") {
      olay.preventDefault();
      setAcik(false);
      dugme.current?.focus();
    } else if (olay.key === "ArrowDown") {
      olay.preventDefault();
      setEtkin((e) => Math.min(gorunen.length - 1, e + 1));
    } else if (olay.key === "ArrowUp") {
      olay.preventDefault();
      setEtkin((e) => Math.max(0, e - 1));
    } else if (olay.key === "Enter" || (olay.key === " " && !aranabilir)) {
      /* Boşluk aramada boşluktur: "aloe via" yazılabilsin. */
      olay.preventDefault();
      if (gorunen[etkin]) sec(gorunen[etkin].deger);
    }
  };

  const sec = (yeni: string) => {
    setAcik(false);
    dugme.current?.focus();
    if (yeni === secili) return;
    setSecili(yeni);
    if (girdi.current) girdi.current.value = yeni;
    onSec?.(yeni);
    if (gonder) girdi.current?.form?.requestSubmit();
  };

  return (
    <div className="durum-secici" ref={kok} data-bicim={bicim} data-acik={acik ? "" : undefined}>
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
        <div className="durum-secici-kutu">
          {/* Arama kutusu listenin İÇİNDE: alanın kendisi seçili değeri
              gösteriyor, arama geçici. Enter formu göndermesin diye
              klavye burada da ele alınıyor. */}
          {aranabilir ? (
            <input
              className="durum-secici-arama"
              type="text"
              value={sorgu}
              autoFocus
              placeholder="Ara…"
              aria-label={`${etiket} ara`}
              aria-controls={liste}
              onChange={(olay) => {
                setSorgu(olay.target.value);
                setEtkin(0);
              }}
              onKeyDown={klavye}
            />
          ) : null}
          <ul
            id={liste}
            role="listbox"
            aria-label={etiket}
            tabIndex={-1}
            className="durum-secici-liste"
            ref={(ul) => {
              if (!aranabilir) ul?.focus();
            }}
            aria-activedescendant={`${liste}-${etkin}`}
            onKeyDown={klavye}
          >
            {gorunen.map((secenek, sira) => (
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
            {gorunen.length === 0 ? <li className="durum-secici-bos" role="presentation">Eşleşen seçenek yok</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
