"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { paletAra } from "@/app/(panel)/ara/actions";
import type { AramaCiktisi, AramaSonucu } from "@/lib/panel-arama";
/* Türkçe İ/ı tuzağı sınavlı bir modülde: lib/tr-arama.ts. */
import { aramaIcinSadelestir } from "@/lib/tr-arama";
import { homeItem, navSections } from "./nav-config";
import { Icon, type IconName } from "./icons";

/*
  KOMUT PALETİ (⌘K).

  ⌘K daha önce yalnızca üst çubuktaki arama kutusuna odaklanıyordu:
  yazıp Enter'a basmak /ara sayfasına GİDİYORDU, yani en sık yapılan
  iş (bir sayfaya geçmek) bile tam bir gezinme artı bir ara ekran
  gerektiriyordu.

  Palet iki katmanlı:

    SAYFALAR VE EYLEMLER  anında, sunucuya gitmeden. Kaynağı
                          nav-config.ts — menü ile paletin ayrışmaması
                          için ikinci bir liste tutulmuyor.
    KAYITLAR              sunucu eylemiyle (paletAra), yazmayı
                          bıraktıktan sonra. Sorgular /ara sayfasıyla
                          PAYLAŞILIYOR (lib/panel-arama.ts).

  Üst çubuktaki form DURUYOR: JavaScript yüklenmeden de arama çalışıyor
  ve "Enter ile tam sonuç sayfasına git" yolu paletin içinde de var.

  Klavye: ⌘K / Ctrl+K açar, "/" de açar (başka bir alana yazılmıyorken),
  Esc kapatır, ↑ ↓ gezinir, Enter açar.
*/

type Komut = { anahtar: string; baslik: string; detay: string; yol: string; ikon: IconName };

/* Sayfa listesi menüden türüyor; eylemler panelin ana "yeni kayıt" yolları. */
const EYLEMLER: Komut[] = [
  { anahtar: "eylem:yeni-urun", baslik: "Yeni ürün ekle", detay: "Ürünler", yol: "/urunler?yeni=1#yeni-urun", ikon: "tag" },
  { anahtar: "eylem:yeni-koleksiyon", baslik: "Yeni koleksiyon oluştur", detay: "Koleksiyonlar", yol: "/koleksiyonlar#yeni-koleksiyon", ikon: "layers" },
  { anahtar: "eylem:yeni-indirim", baslik: "Yeni indirim paketi", detay: "İndirimler", yol: "/indirimler#yeni-indirim", ikon: "percent" },
  { anahtar: "eylem:lr-fiyat", baslik: "LR fiyatlarını aktar", detay: "Veri Aktarımı", yol: "/veri-aktarimi", ikon: "swap" },
  { anahtar: "eylem:magaza-tasarimi", baslik: "Mağaza tasarımı", detay: "Menüde yok, adresten açılır", yol: "/tema", ikon: "gear" },
];

const SAYFALAR: Komut[] = [
  { anahtar: `sayfa:${homeItem.href}`, baslik: homeItem.label, detay: "Sayfa", yol: homeItem.href, ikon: homeItem.icon },
  ...navSections.flatMap((bolum) =>
    bolum.items.map((oge) => ({
      anahtar: `sayfa:${oge.href}`,
      baslik: oge.label,
      detay: bolum.title,
      yol: oge.href,
      ikon: oge.icon,
    })),
  ),
  { anahtar: "sayfa:/siparisler/iadeler", baslik: "İade Talepleri", detay: "SATIŞ", yol: "/siparisler/iadeler", ikon: "box" },
];

const TUR_BASLIK: Record<AramaSonucu["tur"], string> = {
  siparis: "Siparişler",
  musteri: "Müşteriler",
  urun: "Ürünler",
  koleksiyon: "Koleksiyonlar",
};

const TUR_IKON: Record<AramaSonucu["tur"], IconName> = {
  siparis: "box",
  musteri: "users",
  urun: "tag",
  koleksiyon: "layers",
};

export function KomutPaleti() {
  const [acik, setAcik] = useState(false);
  const [terim, setTerim] = useState("");
  const [imlec, setImlec] = useState(0);
  /*
    Kayıtlar HANGİ TERİME ait olduğuyla birlikte tutuluyor. Yalnızca
    çıktıyı saklamak, terim değişince eski listenin bir an ekranda
    kalmasına yol açıyordu; ayrıca "terim kısaldı" diye efekt içinde
    sıfırlamak gerekiyordu. Eşleşme okuma anında kontrol ediliyor.
  */
  const [kayitlar, setKayitlar] = useState<{ terim: string; cikti: AramaCiktisi } | null>(null);
  const [araniyor, basla] = useTransition();
  const girdiRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  /*
    Açılış SIFIRLAMASI burada, efektte değil: efekt içinde setState
    çağırmak React'in uyardığı zincirleme çizime yol açıyor ve
    sıfırlama zaten bir olayın sonucu.
  */
  const ac = () => {
    setTerim("");
    setKayitlar(null);
    setImlec(0);
    setAcik(true);
  };

  /* ⌘K / Ctrl+K ve "/" açıyor; Esc kapatıyor. */
  useEffect(() => {
    function tus(olay: KeyboardEvent) {
      const hedef = olay.target as HTMLElement | null;
      const yaziyor = Boolean(hedef && (["INPUT", "TEXTAREA", "SELECT"].includes(hedef.tagName) || hedef.isContentEditable));
      const acTus = (olay.key.toLowerCase() === "k" && (olay.metaKey || olay.ctrlKey)) || (olay.key === "/" && !yaziyor);
      if (acTus) {
        olay.preventDefault();
        ac();
        return;
      }
      if (olay.key === "Escape") setAcik(false);
    }
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, []);

  useEffect(() => {
    if (!acik) return;
    /* Odak bir kare sonra: pencere henüz çizilmemişken odak kayboluyor. */
    const zamanlayici = window.setTimeout(() => girdiRef.current?.focus(), 0);
    return () => window.clearTimeout(zamanlayici);
  }, [acik]);

  /*
    Kayıt araması GECİKMELİ (220ms) ve iki karakterden önce hiç
    çalışmıyor: her tuşta sunucuya gitmek paleti yavaşlatır ve sayfa
    listesi zaten anında geliyor. Sonuç ESKİMİŞSE atılıyor — hızlı
    yazarken erken bir isteğin geç dönüp yeni terimin sonucunu
    ezmesi, yanlış listeyi göstermek olurdu.
  */
  useEffect(() => {
    if (!acik) return;
    const aranan = terim.trim();
    /* Kısa terimde istek atılmıyor; eski sonuç okunurken zaten eleniyor. */
    if (aranan.length < 2) return;
    let iptal = false;
    const zamanlayici = window.setTimeout(() => {
      basla(async () => {
        const cevap = await paletAra(aranan);
        if (!iptal) setKayitlar({ terim: aranan, cikti: cevap });
      });
    }, 220);
    return () => {
      iptal = true;
      window.clearTimeout(zamanlayici);
    };
  }, [acik, terim]);

  const komutlar = useMemo(() => {
    const aranan = aramaIcinSadelestir(terim.trim());
    const hepsi = [...SAYFALAR, ...EYLEMLER];
    if (!aranan) return hepsi;
    return hepsi.filter((komut) => aramaIcinSadelestir(`${komut.baslik} ${komut.detay}`).includes(aranan));
  }, [terim]);

  /* Yalnızca GÜNCEL terimin sonucu gösteriliyor: eskisi bir an ekranda
     kalırsa kullanıcı yazdığının karşılığını gördüğünü sanır. */
  const guncelKayit = kayitlar && kayitlar.terim === terim.trim() ? kayitlar.cikti : null;
  const kayitListesi = useMemo(() => {
    if (!guncelKayit) return [] as AramaSonucu[];
    return [...guncelKayit.siparisler, ...guncelKayit.musteriler, ...guncelKayit.urunler, ...guncelKayit.koleksiyonlar];
  }, [guncelKayit]);

  /*
    Gezinilebilir tek liste: komutlar, kayıtlar ve en sonda "tüm
    sonuçlar". Tek dizi tutmak ↑ ↓ ve Enter'ın bölümler arasında
    kesintisiz çalışmasını sağlıyor.
  */
  const tumSatirlar = useMemo(() => {
    const satirlar: { anahtar: string; yol: string }[] = [
      ...komutlar.map((komut) => ({ anahtar: komut.anahtar, yol: komut.yol })),
      ...kayitListesi.map((kayit) => ({ anahtar: `${kayit.tur}:${kayit.anahtar}`, yol: kayit.yol })),
    ];
    if (terim.trim().length >= 2) {
      satirlar.push({ anahtar: "tum-sonuclar", yol: `/ara?q=${encodeURIComponent(terim.trim())}` });
    }
    return satirlar;
  }, [komutlar, kayitListesi, terim]);

  /* Liste kısalınca imleç TAŞMASIN — okuma anında kırpılıyor; efektte
     düzeltmek fazladan bir çizim turu demekti. */
  const aktifImlec = tumSatirlar.length ? Math.min(imlec, tumSatirlar.length - 1) : 0;

  const git = (yol: string) => {
    setAcik(false);
    router.push(yol);
  };

  if (!acik) return null;

  const secili = (anahtar: string) => tumSatirlar[aktifImlec]?.anahtar === anahtar;
  const kayitBolumleri = (["siparis", "musteri", "urun", "koleksiyon"] as const)
    .map((tur) => ({ tur, satirlar: kayitListesi.filter((kayit) => kayit.tur === tur) }))
    .filter((bolum) => bolum.satirlar.length > 0);

  return (
    /*
      Zemine tıklamak kapatıyor. role="dialog" ve aria-modal: ekran
      okuyucu arkadaki listeyi okumaya devam etmesin.
    */
    <div className="palet-zemin" onMouseDown={() => setAcik(false)}>
      <div
        className="palet"
        role="dialog"
        aria-modal="true"
        aria-label="Komut paleti"
        onMouseDown={(olay) => olay.stopPropagation()}
      >
        <div className="palet-girdi">
          <Icon name="search" size={16} />
          <input
            ref={girdiRef}
            value={terim}
            onChange={(olay) => {
              setTerim(olay.target.value);
              setImlec(0);
            }}
            onKeyDown={(olay) => {
              /* Hareket KIRPILMIŞ imleçten başlıyor: ham imleç liste
                 kısaldığında aralığın dışında kalabiliyor ve bir tuş
                 boşa gidiyordu. */
              if (olay.key === "ArrowDown") {
                olay.preventDefault();
                setImlec(tumSatirlar.length ? (aktifImlec + 1) % tumSatirlar.length : 0);
              } else if (olay.key === "ArrowUp") {
                olay.preventDefault();
                setImlec(tumSatirlar.length ? (aktifImlec - 1 + tumSatirlar.length) % tumSatirlar.length : 0);
              } else if (olay.key === "Enter") {
                olay.preventDefault();
                const hedef = tumSatirlar[aktifImlec];
                if (hedef) git(hedef.yol);
              }
            }}
            placeholder="Sayfa, ürün, sipariş, müşteri ara ya da bir işlem yaz"
            aria-label="Komut paletinde ara"
            autoComplete="off"
            maxLength={80}
          />
          <kbd aria-hidden="true">Esc</kbd>
        </div>

        <div className="palet-liste">
          {komutlar.length ? (
            <>
              <p className="palet-bolum">Sayfalar ve işlemler</p>
              {komutlar.map((komut) => (
                <button
                  key={komut.anahtar}
                  type="button"
                  className="palet-satir"
                  data-secili={secili(komut.anahtar) ? "" : undefined}
                  onMouseEnter={() => setImlec(tumSatirlar.findIndex((satir) => satir.anahtar === komut.anahtar))}
                  onClick={() => git(komut.yol)}
                >
                  <span className="palet-ikon"><Icon name={komut.ikon} size={16} /></span>
                  <span className="palet-metin"><b>{komut.baslik}</b><small>{komut.detay}</small></span>
                </button>
              ))}
            </>
          ) : null}

          {kayitBolumleri.map((bolum) => (
            <div key={bolum.tur}>
              <p className="palet-bolum">{TUR_BASLIK[bolum.tur]}</p>
              {bolum.satirlar.map((kayit) => {
                const anahtar = `${kayit.tur}:${kayit.anahtar}`;
                return (
                  <button
                    key={anahtar}
                    type="button"
                    className="palet-satir"
                    data-secili={secili(anahtar) ? "" : undefined}
                    onMouseEnter={() => setImlec(tumSatirlar.findIndex((satir) => satir.anahtar === anahtar))}
                    onClick={() => git(kayit.yol)}
                  >
                    <span className="palet-ikon"><Icon name={TUR_IKON[kayit.tur]} size={16} /></span>
                    <span className="palet-metin"><b title={kayit.baslik}>{kayit.baslik}</b><small title={kayit.detay}>{kayit.detay}</small></span>
                    {kayit.yan ? <span className="palet-yan">{kayit.yan}</span> : null}
                    {kayit.rozet ? <em className="ac-tag" data-tone={kayit.rozet.ton}>{kayit.rozet.metin}</em> : null}
                  </button>
                );
              })}
            </div>
          ))}

          {/*
            Aranıyor bilgisi ve "sonuç yok" AYRI: ikisini birleştirmek,
            sunucu yanıtı gelmeden "kayıt bulunamadı" demek olurdu.
          */}
          {terim.trim().length >= 2 && araniyor && !guncelKayit ? <p className="palet-durum">Kayıtlar aranıyor…</p> : null}
          {terim.trim().length >= 2 && guncelKayit && kayitListesi.length === 0 ? (
            <p className="palet-durum">Bu aramayla eşleşen kayıt yok.</p>
          ) : null}
          {terim.trim().length < 2 && !komutlar.length ? <p className="palet-durum">En az iki harf yazın.</p> : null}

          {terim.trim().length >= 2 ? (
            <button
              type="button"
              className="palet-satir palet-tumu"
              data-secili={secili("tum-sonuclar") ? "" : undefined}
              onMouseEnter={() => setImlec(tumSatirlar.findIndex((satir) => satir.anahtar === "tum-sonuclar"))}
              onClick={() => git(`/ara?q=${encodeURIComponent(terim.trim())}`)}
            >
              <span className="palet-ikon"><Icon name="search" size={16} /></span>
              <span className="palet-metin"><b>“{terim.trim()}” için tüm sonuçlar</b><small>Arama sayfasında aç</small></span>
            </button>
          ) : null}
        </div>

        <p className="palet-ipucu">
          <kbd>↑</kbd><kbd>↓</kbd> gezin · <kbd>Enter</kbd> aç · <kbd>Esc</kbd> kapat
        </p>
      </div>
    </div>
  );
}
