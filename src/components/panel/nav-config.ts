import type { IconName } from "./icons";

export type NavItem = { label: string; href: string; icon: IconName };
export type NavSection = { title: string; items: NavItem[] };

/*
  Menü bölümlere ayrıldı. On iki öğe tek listede duruyordu ve göz
  aradığını bulmak için hepsini okumak zorundaydı. ArvoOS'teki gibi
  işin doğasına göre gruplandı: satış akışı, katalog, analiz, sistem.

  Mağaza Tasarımı (/tema) bilerek menüde yok — vitrin kodla
  tasarlanıyor. Sayfa adresinden erişilebilir.
*/
export const navSections: NavSection[] = [
  {
    title: "SATIŞ",
    items: [
      { label: "Operasyon Merkezi", href: "/operasyon", icon: "pulse" },
      { label: "Siparişler", href: "/siparisler", icon: "box" },
      { label: "Müşteriler", href: "/musteriler", icon: "users" },
    ],
  },
  {
    title: "KATALOG",
    items: [
      { label: "Ürünler", href: "/urunler", icon: "tag" },
      { label: "Koleksiyonlar", href: "/koleksiyonlar", icon: "layers" },
      { label: "Stok Yönetimi", href: "/stok", icon: "archive" },
      { label: "İndirimler", href: "/indirimler", icon: "percent" },
    ],
  },
  {
    title: "ANALİZ",
    items: [{ label: "Satış Analitiği", href: "/analitik", icon: "chart" }],
  },
  {
    title: "SİSTEM",
    items: [
      { label: "Veri Aktarımı", href: "/veri-aktarimi", icon: "swap" },
      { label: "Tedarikçiler", href: "/tedarikci", icon: "truck" },
      { label: "Mağaza Ayarları", href: "/ayarlar", icon: "gear" },
    ],
  },
];

export const homeItem: NavItem = { label: "Genel Bakış", href: "/", icon: "home" };

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/* Menüde olmayan alt sayfalar için üst çubuk etiketi. */
const extraLabels: Record<string, string> = {
  "/siparisler/iadeler": "İade Talepleri",
  "/tema": "Mağaza Tasarımı",
};

export function sectionLabel(pathname: string) {
  const extra = Object.keys(extraLabels).find((href) => isActive(pathname, href));
  if (extra) return extraLabels[extra];
  const item = navSections.flatMap((section) => section.items).find((candidate) => isActive(pathname, candidate.href));
  return item?.label ?? homeItem.label;
}
