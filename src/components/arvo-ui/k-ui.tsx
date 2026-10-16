import Link from "next/link";
import type { ReactNode } from "react";
import { MobilSatir, type MobilIsaret } from "./mobil-satir";
import { SatirTiklama } from "./satir-tiklama";
// Panelin liste ve kart düzeni: sayfa kullandığı sınıfın CSS'ini kendi import eder (AGENTS.md).
import "./crm.css";
import "./kayit-detay.css";
import "./mobil-satir.css";
import "./k-ui.css";

/* Baş harfler: "ahmet yılmaz" → "AY" (ArvoOS lib/table-format initials). */
const initials = (ad: string) => ad.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toLocaleUpperCase("tr")).join("") || "?";

/*
  KONSOLUN GÖRÜNÜŞÜ = PANELİN GÖRÜNÜŞÜ (14.10.2026, kurum sahibinin
  tarifi: "bizim ArvoOS panel gibi olmalı").

  Konsol iki tasarım dilinden oluşuyordu: ayarlar ekranının kart dili
  (StgSection — renkli simge kutusu, büyük harfli üst başlık, açıklama
  paragrafı) ve kendi tablo stili (.plt-table). Panelin liste sayfaları
  (talepler, işler, sözleşmeler) ise sade kart + başlık satırı ve
  .talep-tablo .crm-data-table kullanıyor: sabit başlık, satıra tıklama,
  telefonda tek kompakt satır (MobilSatir). Kurucu gün içinde iki kabuk
  arasında gidip geliyor ve iki ayrı ürün görüyordu.

  Bu dosya o dilin konsoldaki karşılığı. Yeni bir konsol ekranı tablo ve
  kart için bunları kullanır; StgSection ve .plt-table'a dönülmez.
*/

/** Panel kartı: başlık satırı (başlık + kısa açıklama + sağda eylem) ve içerik. */
export function KKart({ id, baslik, aciklama, sag, children, sinif }: {
  id?: string;
  baslik: ReactNode;
  aciklama?: ReactNode;
  sag?: ReactNode;
  children?: ReactNode;
  sinif?: string;
}) {
  return (
    <section id={id} className={`panel-card k-kart${sinif ? ` ${sinif}` : ""}`} aria-label={typeof baslik === "string" ? baslik : undefined}>
      <header className="k-kart-bas">
        <div>
          <h2>{baslik}</h2>
          {/* KOMPAKT (14.10.2026): açıklama en çok İKİ satır (15.10'da
              birden ikiye çıktı, gerekçesi konsol-ui.css'te), sığmazsa üç
              nokta. title hâlâ duruyor: iki satıra da sığmayan uzun
              açıklamanın tamamı farede görünsün. Eskiden paragraf olarak
              açılıyor, konsol sayfaları İşler'in iki-üç katı metinle
              uzuyordu. */}
          {aciklama ? <p title={typeof aciklama === "string" ? aciklama : undefined}>{aciklama}</p> : null}
        </div>
        {sag ? <div className="k-kart-sag">{sag}</div> : null}
      </header>
      {children}
    </section>
  );
}

/*
  BAŞLIK ÜSTÜ ETİKET: "PLATFORM · <SAYFA ADI>" (15.10.2026).

  Dokuz sayfa bu kalıptaydı, dördü değildi: "TİCARİ" (sözleşme
  onayları), "ÜRÜN VE ERİŞİM" (modül matrisi), "PLATFORM · TİCARİ
  ÇEKİRDEK" (bireysel aboneler) ve Ödeme Onayları'nın Tahsilat'la AYNI
  etiketi. Etiket her sayfanın ilk satırı: farklı olduğunda kurucu bir
  anlığına nerede olduğunu kaybediyor ve iki ayrı sayfa aynı etiketi
  taşıdığında hangisinde olduğunu hiç anlamıyor.

  Etiket sayfanın KENDİ adıdır, bulunduğu iş alanının değil — iş alanı
  zaten dock'ta işaretli ve üst çubukta yazıyor.
*/
export type KKolon = { ad: string; sinif?: string };

/**
 * Panel tablosu. Satırlar <KSatir> ya da elle yazılmış <tr>; ilk hücrede
 * .crm-row-link varsa satırın tamamı tıklanır (SatirTiklama).
 */
export function KTablo({ kolonlar, children }: { kolonlar: KKolon[]; children: ReactNode }) {
  return (
    <div className="talep-tablo k-tablo">
      <table className="crm-data-table" data-cols="konsol">
        <thead><tr>{kolonlar.map((k, i) => <th key={`${k.ad}-${i}`} className={k.sinif}>{k.ad}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
      <SatirTiklama />
    </div>
  );
}

/**
 * İlk hücre: başlık (bağlantıysa satırın tamamı tıklanır) ve altında kısa
 * bilgi. avatar: kurum ya da kişi satırında baş harf kutusu — İşler
 * listesindeki sorumlu avatarının karşılığı; satırı gözle bulmayı
 * kolaylaştırıyor.
 */
export function KBaslik({ href, baslik, alt, etiket = "Kayıt", avatar }: { href?: string | null; baslik: string; alt?: ReactNode; etiket?: string; avatar?: boolean }) {
  const metin = <>
    <span className="crm-table-title" title={baslik}>{baslik}</span>
    {alt ? <span className="crm-table-sub">{alt}</span> : null}
  </>;
  return (
    <td data-label={etiket} className={avatar ? "k-kimlik" : undefined}>
      {avatar ? <i className="k-avatar" aria-hidden="true">{initials(baslik)}</i> : null}
      {avatar
        ? <span className="k-kimlik-metin">{href ? <Link className="crm-row-link" href={href}>{metin}</Link> : metin}</span>
        : href ? <Link className="crm-row-link" href={href}><span className="crm-table-title" title={baslik}>{baslik}</span></Link> : <span className="crm-table-title" title={baslik}>{baslik}</span>}
      {!avatar && alt ? <span className="crm-table-sub">{alt}</span> : null}
    </td>
  );
}

/** Durum hücresi: panelin durum rozeti. */
export function KDurum({ etiket, ton, ek, baslik = "Durum" }: { etiket: string; ton: string; ek?: ReactNode; baslik?: string }) {
  return <td data-label={baslik}><span className="status-pill" data-tone={ton}>{etiket}</span>{ek}</td>;
}

/** Satırın sonundaki ok ve telefondaki tek görünüm. */
export function KSatirSonu({ mobil }: {
  mobil: { href?: string | null; baslik: string; durum?: { etiket: string; ton: string } | null; alt?: (string | null | undefined | false)[]; isaretler?: (MobilIsaret | null | undefined | false)[] };
}) {
  return <>
    <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
    <MobilSatir {...mobil} />
  </>;
}

/** Boş liste: panelin boş durum kutusu. */
export function KBos({ baslik, aciklama, eylem }: { baslik: string; aciklama?: string; eylem?: ReactNode }) {
  return (
    <div className="crm-empty-state talep-bos-kutu k-bos">
      <h2>{baslik}</h2>
      {aciklama ? <p>{aciklama}</p> : null}
      {eylem ? <div className="crm-empty-actions">{eylem}</div> : null}
    </div>
  );
}

/** Kartın içindeki uyarı satırı (banner yerine sade not). */
export function KNot({ ton = "bilgi", children }: { ton?: "bilgi" | "uyari" | "tehlike" | "basari"; children: ReactNode }) {
  return <p className="k-not" data-ton={ton}>{children}</p>;
}

/*
  iOS LİSTESİ (14.10.2026, kurum sahibinin tarifi: "iOS gibi olmalı").

  Çok sütunlu tablo konsolda dengesiz duruyordu: sütun başlıkları,
  ikiye kırılan kurum adları, satırın ortasında boşluklar. iOS'un liste
  dili tek satırda okunur: solda renkli simge, ortada başlık ve altında
  tek satır özet, sağda değer ve durum, en sağda ok. Sütun başlığı yok;
  ayraç metnin başından başlıyor.

  Kap .talep-tablo: liste sayfasında (liste-sayfa) kaydırma alanı o,
  kartın kenarına yaslanma da onun eksi kenar boşluğundan.
*/
export type KDurumTonu = "success" | "warning" | "danger" | "info" | "neutral";

/** İki harflik baş harf: çok sözcükte ilk ve son sözcüğün, tek sözcükte ilk iki harf. */
function basHarf(ad: string) {
  const parcalar = ad.trim().split(/\s+/).filter(Boolean);
  if (!parcalar.length) return "—";
  const harfler = parcalar.length > 1 ? parcalar[0][0] + parcalar[parcalar.length - 1][0] : parcalar[0].slice(0, 2);
  return harfler.toLocaleUpperCase("tr-TR");
}

/** Ada göre sabit renk: aynı kurum her ekranda aynı renkte. */
function renkSirasi(ad: string) {
  let toplam = 0;
  for (const harf of ad) toplam = (toplam * 31 + harf.charCodeAt(0)) >>> 0;
  return toplam % 6;
}

export function KListe({ children }: { children: ReactNode }) {
  return <div className="talep-tablo k-ios-kap"><ul className="k-ios">{children}</ul></div>;
}

export function KOge({ href, simge, baslik, alt, etiketler, durum, deger, degerAlt, sonu }: {
  href?: string | null;
  /** Verilirse solda baş harf simgesi (kurum ya da kişi adı). */
  simge?: string | null;
  baslik: string;
  alt?: ReactNode;
  /** Özetin altında küçük rozetler (ör. kullanılan ürünler, durum renginde). */
  etiketler?: { etiket: string; ton?: KDurumTonu | string }[];
  durum?: { etiket: string; ton: KDurumTonu | string } | null;
  deger?: ReactNode;
  degerAlt?: ReactNode;
  /** Sağ uçta ok yerine düğme / form (satırın kendi işi). */
  sonu?: ReactNode;
}) {
  const ic = <>
    {simge ? <span className="k-ios-simge" data-renk={renkSirasi(simge)} aria-hidden="true">{basHarf(simge)}</span> : null}
    <span className="k-ios-govde">
      <span className="k-ios-baslik" title={baslik}>{baslik}</span>
      {alt ? <span className="k-ios-alt">{alt}</span> : null}
      {etiketler?.length ? (
        <span className="k-ios-etiketler">
          {etiketler.map((e) => <span key={e.etiket} className="k-ios-etiket" data-ton={e.ton}>{e.etiket}</span>)}
        </span>
      ) : null}
    </span>
    {durum ? <span className="k-ios-durum" data-ton={durum.ton}>{durum.etiket}</span> : null}
    {deger !== undefined && deger !== null ? (
      <span className="k-ios-deger"><b>{deger}</b>{degerAlt ? <small>{degerAlt}</small> : null}</span>
    ) : null}
    {sonu ? <span className="k-ios-sonu">{sonu}</span> : (href ? <svg className="k-ios-ok" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg> : null)}
  </>;
  return (
    <li className="k-ios-oge">
      {href && !sonu ? <Link className="k-ios-ic" href={href}>{ic}</Link> : <div className="k-ios-ic">{ic}</div>}
    </li>
  );
}
