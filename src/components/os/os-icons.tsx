import type { OsIkon } from "./os-apps";

/*
  Uygulama ikonları. Eskiden menüde ikon yerine harfler ("C", "İK", "A")
  ve Unicode işaretleri (⌂ ✉ ⊞) vardı; işletim sistemi kabuğunda dock ve
  başlatıcı ikonla tanınıyor. Çizgi ikonlar `currentColor` alır: kurum
  rengi ve koyu tema kendiliğinden işler.
*/
type YardimciSimge = "search" | "bell" | "close" | "logout" | "external" | "sun" | "moon" | "plus" | "back"
  | "crm" | "operations" | "finance" | "hr" | "documents" | "posta" | "messages" | "whatsapp" | "box" | "building"
  | "wallet" | "check" | "pulse" | "tag" | "repeat" | "notifications";

const YOLLAR: Record<OsIkon | YardimciSimge, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  satis: <><path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>,
  katalog: <><path d="M21 7.5 12 3 3 7.5v9L12 21l9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></>,
  /* İade: geri dönen ok; indirim: yüzdeli etiket; finans: ArvoOS'un finans kartı. */
  iade: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  indirim: <><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><path d="m9.5 13.5 4-4" /><circle cx="9.5" cy="9.5" r=".8" fill="currentColor" stroke="none" /><circle cx="13.5" cy="13.5" r=".8" fill="currentColor" stroke="none" /></>,
  finans: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 14.5h2" /></>,
  analiz: <><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></>,
  tedarik: <><path d="M3 6h11v10H3zM14 9h4l3 3.5V16h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  magaza: <><path d="M4 9.5 5.5 4h13L20 9.5" /><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" /><path d="M5.5 11.5V20h13v-8.5M10 20v-5h4v5" /></>,
  crm: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.4 3.5 5.2" /></>,
  operations: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></>,
  finance: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 14.5h2" /></>,
  hr: <><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="10" r="3" /><path d="M8 17c.7-1.8 2.2-2.8 4-2.8s3.3 1 4 2.8" /></>,
  documents: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  posta: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></>,
  messages: <path d="M4 5h16v11H9l-5 4z" />,
  whatsapp: <><path d="M20.5 11.6a8.4 8.4 0 0 1-12.3 7.4L3.5 20.5l1.6-4.5a8.4 8.4 0 1 1 15.4-4.4Z" /><path d="M9 8.8c.2 3 2.6 5.6 5.7 6l1.1-1.4-1.8-1-.9.8a3.6 3.6 0 0 1-1.9-1.9l.8-.9-1-1.8Z" /></>,
  settings: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  /* Ürün kutusu (16.10.2026): konsolda Ürünler eskiden "apps" (dört kare)
     kullanıyordu — dock'un en sağındaki Uygulamalar düğmesiyle aynı simge. */
  box: <><path d="M21 7.5 12 3 3 7.5v9L12 21l9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></>,
  apps: <><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></>,
  /* Kurucu konsolu: kiracı (bina), tahsilat (cüzdan), onay (tik). */
  building: <><path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16" /><path d="M15 9h3a2 2 0 0 1 2 2v10" /><path d="M8 7h3M8 11h3M8 15h3M3 21h18" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h13a2 2 0 0 1 0 5H3" /><circle cx="16.5" cy="12.5" r=".9" fill="currentColor" stroke="none" /></>,
  check: <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12.3 2.4 2.4 4.6-5" /></>,
  /* Sistem sağlığı: nabız çizgisi. */
  pulse: <path d="M3 12h3.5l2-5.5 3.5 11 2.5-7 1.8 3.5H21" />,
  /* Ücret ve paketler (etiket), abonelikler (yenilenen döngü). */
  tag: <><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.3" /></>,
  repeat: <><path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 0 1 4-4h12" /><path d="M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 0 1-4 4H4" /></>,
  notifications: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  logout: <><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 16l-4-4 4-4M6 12h10" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="m15 5-7 7 7 7" />,
};

export type OsIkonAdi = keyof typeof YOLLAR;

export function OsSimge({ ad, boyut = 20 }: { ad: OsIkonAdi; boyut?: number }) {
  return (
    <svg width={boyut} height={boyut} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {YOLLAR[ad]}
    </svg>
  );
}
