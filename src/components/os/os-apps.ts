/*
  ArvoARC İŞLETİM SİSTEMİ KABUĞU: her iş alanı bir "uygulama"
  (16.10.2026, kurum sahibinin isteği: "ArvoOS kalitesinde, aynı
  özellikler; dock ve pencere sistemi de gelsin").

  Sözleşme ArvoOS/app/panel/os/os-apps.ts'in kopyası: dock, ikinci dock
  (bölümler), başlatıcı, durum çubuğundaki uygulama adı, Ctrl+K ve
  telefondaki bölüm şeridi aynı listeden besleniyor. Eskiden ArvoARC'ın
  sol menüsü (eski components/panel/nav-config.ts) ayrı, komut paleti ayrı,
  mobil menü ayrı bir listeydi; biri güncellenince öteki unutuluyordu.

  Fark: ArvoARC'ın kökü "/" (ArvoOS'unki "/panel").

  Saf modül: Next/React/Supabase'e dokunmaz, birim testi tests/os-apps.test.ts.
*/

export type OsIkon =
  | "home" | "satis" | "katalog" | "analiz" | "tedarik" | "settings" | "apps" | "magaza";

/** altYollar: bölümün kendi yolu dışında onu etkin sayan yollar. */
export type Bolum = { key: string; href: string; label: string; altYollar?: string[] };

export type OsUygulama = {
  key: string;
  label: string;
  href: string;
  ikon: OsIkon;
  /** Bu yollarla başlayan her sayfa bu uygulamanın içinde sayılır. */
  yollar: string[];
  /** Bekleyen iş sayısı gibi rozet; 0 ya da yoksa gösterilmez. */
  rozet?: number;
  /** Uygulamanın bölümleri: ikinci dock, telefondaki şerit ve Ctrl+K. */
  bolumler?: Bolum[];
  /** Yalnızca "Tüm uygulamalar"da (ve Ctrl+K'da); dock'ta yer kaplamaz. */
  yalnizBaslatici?: boolean;
};

export type OsSayfa = { label: string; href: string; uygulama: string };

export const ANA_SAYFA = "/";

/*
  Uygulamalar ArvoARC'ın eski menü gruplarından (SATIŞ, KATALOG, ANALİZ,
  SİSTEM) türedi. Sistem ikiye ayrıldı: tedarikçi ve veri aktarımı
  günlük bir İŞ, mağaza ayarları bir kez kurulan bir YAPILANDIRMA —
  dock'ta ArvoOS'taki gibi Ayarlar en sağda, ayrı.

  Tema (/tema) bilerek menüde yoktu (vitrin teması, ileri düzey); Ayarlar'ın
  bölümü oldu ama yol öneki Ayarlar uygulamasında.
*/
export function arcUygulamalari(rozet?: { operasyon?: number; iade?: number }): OsUygulama[] {
  const operasyon = Math.max(0, Math.round(rozet?.operasyon ?? 0));
  return [
    { key: "home", label: "Ana Ekran", href: ANA_SAYFA, ikon: "home", yollar: [] },
    {
      key: "satis", label: "Satış", href: "/operasyon", ikon: "satis",
      yollar: ["/operasyon", "/siparisler", "/musteriler"],
      ...(operasyon ? { rozet: operasyon } : {}),
      bolumler: [
        { key: "operasyon", href: "/operasyon", label: "Operasyon merkezi" },
        { key: "siparisler", href: "/siparisler", label: "Siparişler" },
        { key: "iadeler", href: "/siparisler/iadeler", label: "İadeler" },
        { key: "musteriler", href: "/musteriler", label: "Müşteriler" },
      ],
    },
    {
      key: "katalog", label: "Katalog", href: "/urunler", ikon: "katalog",
      yollar: ["/urunler", "/koleksiyonlar", "/stok", "/medya", "/indirimler"],
      bolumler: [
        { key: "urunler", href: "/urunler", label: "Ürünler" },
        { key: "koleksiyonlar", href: "/koleksiyonlar", label: "Koleksiyonlar" },
        { key: "stok", href: "/stok", label: "Stok" },
        { key: "medya", href: "/medya", label: "Medya" },
        { key: "indirimler", href: "/indirimler", label: "İndirimler" },
      ],
    },
    { key: "analiz", label: "Analiz", href: "/analitik", ikon: "analiz", yollar: ["/analitik"] },
    {
      key: "tedarik", label: "Tedarik", href: "/tedarikci", ikon: "tedarik",
      yollar: ["/tedarikci", "/veri-aktarimi"],
      bolumler: [
        { key: "tedarikci", href: "/tedarikci", label: "Tedarikçiler" },
        { key: "veri-aktarimi", href: "/veri-aktarimi", label: "Veri aktarımı" },
      ],
    },
    {
      key: "settings", label: "Ayarlar", href: "/ayarlar", ikon: "settings",
      yollar: ["/ayarlar", "/tema"],
      bolumler: [
        /* Ayarlar sayfasının bölümleri (app/(panel)/ayarlar → AYAR_BOLUMLERI). */
        { key: "marka", href: "/ayarlar", label: "Marka kimliği" },
        { key: "satis-ayar", href: "/ayarlar?bolum=satis", label: "Satış" },
        { key: "alan-adi", href: "/ayarlar?bolum=alan-adi", label: "Alan adları" },
        { key: "kargo", href: "/ayarlar?bolum=kargo", label: "Kargo" },
        { key: "odeme", href: "/ayarlar?bolum=odeme", label: "Ödeme" },
        { key: "tema", href: "/tema", label: "Vitrin teması" },
      ],
    },
  ];
}

export function etkinUygulama(uygulamalar: OsUygulama[], yol: string): OsUygulama | null {
  if (yol === ANA_SAYFA) return uygulamalar.find((u) => u.key === "home") ?? null;
  let enIyi: OsUygulama | null = null;
  let enUzun = 0;
  for (const uygulama of uygulamalar) {
    for (const onek of uygulama.yollar) {
      if ((yol === onek || yol.startsWith(`${onek}/`)) && onek.length > enUzun) {
        enIyi = uygulama;
        enUzun = onek.length;
      }
    }
  }
  return enIyi;
}

/*
  Açık bölüm: yolu en UZUN eşleşen. "/siparisler/iadeler/…" İadeler'e,
  "/siparisler/<id>" Siparişler'e düşer. Bölümün adresinde sorgu varsa
  (?bolum=…) o da tutmalı; tutan sorgulu bölüm aynı yoldaki sorgusuzdan önce gelir.
*/
export function etkinBolum(bolumler: Bolum[], yol: string, sorgu = ""): Bolum | null {
  const parametreler = new URLSearchParams(sorgu);
  let enIyi: Bolum | null = null;
  let puan = -1;
  for (const bolum of bolumler) {
    const [bYol, bSorgu = ""] = bolum.href.split("?");
    const bParam = new URLSearchParams(bSorgu);
    if (![...bParam.entries()].every(([k, v]) => parametreler.get(k) === v)) continue;
    const yollar = [bYol, ...(bolum.altYollar ?? [])];
    const eslesen = yollar.filter((y) => yol === y || yol.startsWith(`${y}/`));
    if (!eslesen.length) continue;
    const p = Math.max(...eslesen.map((y) => y.length)) * 10 + [...bParam.keys()].length;
    if (p > puan) { enIyi = bolum; puan = p; }
  }
  return enIyi;
}

/* Ctrl+K'daki sayfalar uygulamaların bölümlerinden gelir. */
export function osSayfalari(uygulamalar: OsUygulama[]): OsSayfa[] {
  const sayfalar: OsSayfa[] = uygulamalar.flatMap((u) => (u.bolumler ?? []).map((b) => ({ label: b.label, href: b.href, uygulama: u.key })));
  for (const u of uygulamalar) {
    if (!u.bolumler?.length && u.key !== "home") sayfalar.push({ label: u.label, href: u.href, uygulama: u.key });
  }
  return sayfalar;
}

/** Avatar için baş harfler: "burak erdoğan" → "BE". Türkçe büyük harf (i → İ). */
export function basHarfler(ad: string): string {
  return ad.split(/\s+/).filter(Boolean).slice(0, 2).map((parca) => parca[0]!.toLocaleUpperCase("tr")).join("") || "?";
}

/** Türkçe büyük/küçük harf ve aksan duyarsız arama (İ/ı, ş/s…). */
export function aramaAnahtari(metin: string): string {
  return metin
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/*
  TELEFONDA GERİ. Ana ekrana eklenen panel tarayıcı çubuğu olmadan
  açılıyor; iPhone'da bu kipte geri tuşu yok. Kök sayfalar alt çubuk ve
  bölüm şeridinden zaten erişilenler.
*/
const yolKoku = (href: string) => href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";

export function kokSayfaMi(uygulamalar: OsUygulama[], yol: string): boolean {
  const y = yolKoku(yol);
  if (y === ANA_SAYFA) return true;
  return uygulamalar.some((u) => yolKoku(u.href) === y || (u.bolumler ?? []).some((b) => yolKoku(b.href) === y));
}

/** Uygulama içi geçmiş yokken geri nereye gider: en yakın bölüm ya da uygulama; yoksa ana ekran. */
export function geriHedefi(uygulamalar: OsUygulama[], yol: string): string {
  const y = yolKoku(yol);
  let hedef = ANA_SAYFA;
  let uzunluk = 0;
  for (const u of uygulamalar) {
    const adaylar = [
      { kok: yolKoku(u.href), hedef: u.href },
      ...(u.bolumler ?? []).map((b) => ({ kok: yolKoku(b.href), hedef: b.href })),
      ...u.yollar.map((onek) => ({ kok: yolKoku(onek), hedef: u.href })),
    ];
    for (const aday of adaylar) {
      if (aday.kok !== "/" && aday.kok !== y && y.startsWith(`${aday.kok}/`) && aday.kok.length > uzunluk) {
        hedef = aday.hedef;
        uzunluk = aday.kok.length;
      }
    }
  }
  return hedef;
}
