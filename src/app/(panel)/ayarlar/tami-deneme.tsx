"use client";

import { useState, useTransition } from "react";
import { tamiBaglantisiniDene } from "./actions";

/*
  TAMİ BAĞLANTI DENEMESİ. Sipariş oluşturmadan kimliğin kabul edilip
  edilmediğini gösteriyor; 29.09.2026'da ilk denemede Tami 4003
  ("PG-Auth-Token uyuşmuyor") döndü ve sebebi ancak Vercel
  günlüklerinden okunabildi.

  Sır ekrana dönmüyor: yalnızca Tami'nin mesajı gösteriliyor.
*/
export function TamiDeneme() {
  const [sonuc, setSonuc] = useState<{ ok: boolean; mesaj: string } | null>(null);
  const [calisiyor, basla] = useTransition();

  return (
    <div className="tami-deneme">
      <button
        className="ac-btn"
        type="button"
        disabled={calisiyor}
        onClick={() =>
          basla(async () => {
            try {
              setSonuc(await tamiBaglantisiniDene());
            } catch (hata) {
              setSonuc({ ok: false, mesaj: hata instanceof Error ? hata.message : String(hata) });
            }
          })
        }
      >
        {calisiyor ? "Deneniyor…" : "Tami bağlantısını dene"}
      </button>
      {sonuc ? <p className="maliyet-sonuc" data-tone={sonuc.ok ? undefined : "hata"}>{sonuc.mesaj}</p> : null}
    </div>
  );
}
