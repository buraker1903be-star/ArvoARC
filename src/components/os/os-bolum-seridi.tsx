"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { etkinBolum, etkinUygulama, type OsUygulama } from "./os-apps";

/*
  TELEFONDA BÖLÜM ŞERİDİ (12.10.2026). Açık uygulamanın bölümleri
  (Operasyon: Genel bakış, İşler, Pano, Takvim…) üst çubuğun altında
  yana kayan sekmeler; telefon uygulamalarındaki üst sekme çubuğu gibi.

  Eskiden telefonda bölüme gitmek iki adımdı: alttaki sekmeye dokununca
  uygulama açılmıyor, dock'un üstünde küçük bir menü açılıyordu; menüdeki
  bağlantıya ikinci kez dokunmak gerekiyordu. Menü fareyle "üstüne
  gelme" için yazılmıştı; dokunmatikte basılan sekmenin yazısı kayıyor,
  bağlantılar çoğu zaman dokunuşu kaçırıyordu (kullanıcı bildirimi).
  Artık alttaki sekme uygulamayı doğrudan açıyor (os-dock.tsx), bölümler
  burada. Masaüstünde gizli (mobil-uygulama.css); orada fareyle açılan
  ikinci dock aynen duruyor.
*/
export function OsBolumSeridi({ uygulamalar }: { uygulamalar: OsUygulama[] }) {
  const yol = usePathname();
  const sorgu = useSearchParams();
  const serit = useRef<HTMLElement>(null);
  const uygulama = etkinUygulama(uygulamalar, yol);
  const bolumler = uygulama?.bolumler ?? [];
  const etkin = bolumler.length ? etkinBolum(bolumler, yol, sorgu.toString()) : null;

  // Seçili sekme görünür kalsın: uzun şeritte sağdakine geçince kaydırılır.
  useEffect(() => {
    serit.current?.querySelector<HTMLElement>("[aria-current='page']")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [etkin?.key]);

  if (bolumler.length < 2) return null;
  return (
    <nav ref={serit} className="os-bolum-serit" aria-label={`${uygulama?.label ?? ""} bölümleri`}>
      {bolumler.map((bolum) => (
        <Link
          key={bolum.key}
          href={bolum.href}
          className={etkin?.key === bolum.key ? "is-active" : undefined}
          aria-current={etkin?.key === bolum.key ? "page" : undefined}
        >
          {bolum.label}
        </Link>
      ))}
    </nav>
  );
}
