"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { etkinUygulama, type OsUygulama } from "./os-apps";

/* Kaynak: ArvoOS/app/panel/os/os-status.tsx (16.10.2026). Çevrimiçi ekip
   göstergesi (OsCanli) alınmadı: ArvoARC'ta varlık tablosu yok. */

/* Durum çubuğunda kurum adının altında açık uygulamanın adı. */
export function OsUygulamaAdi({ uygulamalar }: { uygulamalar: OsUygulama[] }) {
  const yol = usePathname();
  return <small className="os-brand-app">{etkinUygulama(uygulamalar, yol)?.label ?? "Mağaza"}</small>;
}

/*
  Saat Türkiye saatiyle (AGENTS.md: tarih Türkiye saatiyle). Sunucu UTC'de;
  ilk çizim boş, saat hidrasyondan sonra yazılır ki sunucu ile istemci
  farklı metin çizip uyuşmazlık vermesin.
*/
const saatBicimi = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
/* "8 Ekim Perşembe" — saatin üstünde. Eskiden ana ekranın başlığındaydı;
   durum çubuğuna taşındı (kurum sahibinin isteği), ana ekranda yer açıldı. */
const tarihBicimi = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", weekday: "long", timeZone: "Europe/Istanbul" });

export function OsSaat() {
  const [an, setAn] = useState<{ saat: string; tarih: string } | null>(null);
  useEffect(() => {
    const yaz = () => { const simdi = new Date(); setAn({ saat: saatBicimi.format(simdi), tarih: tarihBicimi.format(simdi) }); };
    yaz();
    const zamanlayici = window.setInterval(yaz, 15_000);
    return () => window.clearInterval(zamanlayici);
  }, []);
  return (
    <span className="os-clock" suppressHydrationWarning>
      <small className="os-clock-date">{an?.tarih ?? ""}</small>
      <time>{an?.saat ?? ""}</time>
    </span>
  );
}
