/*
  GÜNLÜK ÖZ DENETİM — saf karar.

  NEDEN VAR: bu depoda bulunan kusurların çoğu SESSİZDİ. Site haritası
  bir saatten uzun süre eski listeyi verdi, koleksiyon rafları boş
  kaldı, tedarikçi stoğu akmadı, bildirim gitmedi — hiçbiri hata
  üretmedi, hepsi birinin gözüne çarpana kadar sürdü. Sistemin kendi
  kendini her gün sınayıp sapmayı SÖYLEMESİ, insanın fark etmesini
  beklemekten sağlam.

  ÖLÇÜM AYRI, KARAR AYRI. Ölçümleri rota topluyor (ağ istekleri,
  veritabanı sayımları); burada yalnızca "bu ölçüm sorun mu" kararı
  var. Böylece karar test edilebiliyor ve eşikleri değiştirmek bir
  ağ isteği gerektirmiyor.

  EŞİKLER NEDEN BÖYLE: her biri MÜŞTERİNİN GÖRECEĞİ bir kusura
  bağlanıyor. "Güzel olurdu" ölçütleri bilerek yok — her sabah
  okunmayan bir rapor, hiç olmayan rapordan kötüdür.
*/

export type MagazaOlcumu = {
  magazaId: string;
  magazaAdi: string;
  /** Mağaza vitrini açık mı; kapalı mağaza denetlenmiyor. */
  vitrinAcik: boolean;
  /** En az bir ödeme yöntemi etkin mi. */
  odemeYontemiVar: boolean;
  /** Tedarikçisi var mı (yoksa tarama beklenmiyor). */
  tedarikciVar: boolean;
  /** Son başarılı tedarikçi içe aktarımı (ISO) — yoksa null. */
  sonTedarikciTaramasi: string | null;
  /** Vitrin ana sayfasının HTTP kodu; null = denenemedi. */
  vitrinDurumu: number | null;
  /** Site haritasındaki ürün adresi sayısı; null = okunamadı. */
  siteHaritasiUrun: number | null;
  /** Site haritasından seçilen bir ürün sayfasının HTTP kodu; null = denenemedi. */
  ornekUrunDurumu: number | null;
};

export type Bulgu = {
  magazaId: string;
  magaza: string;
  kod: string;
  baslik: string;
  metin: string;
};

/*
  TEDARİKÇİ TARAMASI BEŞ DAKİKADA BİR koşuyor (vercel.json). Altı
  saat, art arda yetmiş turun kaçması demek — geçici bir ağ hatası
  değil, durmuş bir iş. Daha dar bir eşik, OTO ya da tedarikçi
  tarafındaki kısa kesintilerde her gün uyarı üretirdi.
*/
export const TEDARIKCI_SESSIZLIK_SAATI = 6;

export function magazaBulgulari(olcum: MagazaOlcumu, simdi: Date): Bulgu[] {
  /* Vitrini kapalı mağaza denetlenmiyor: kapalı olması zaten karar. */
  if (!olcum.vitrinAcik) return [];

  const bulgular: Bulgu[] = [];
  const ekle = (kod: string, baslik: string, metin: string) =>
    bulgular.push({ magazaId: olcum.magazaId, magaza: olcum.magazaAdi, kod, baslik, metin });

  /*
    ÖDEME YÖNTEMİ YOKSA MAĞAZA SATIŞ YAPAMAZ. Müşteri sepete kadar
    geliyor ve ödeme adımında hiçbir seçenek bulamıyor; bu, ekranda
    hata vermeyen ama satışı tamamen durduran bir yapılandırma.
  */
  if (!olcum.odemeYontemiVar) {
    ekle("odeme_yok", "Ödeme yöntemi yok", "Hiçbir ödeme yöntemi etkin değil; müşteri ödeme adımını tamamlayamaz.");
  }

  if (olcum.vitrinDurumu !== null && olcum.vitrinDurumu !== 200) {
    ekle("vitrin_kapali", "Vitrin açılmıyor", `Ana sayfa ${olcum.vitrinDurumu} döndü.`);
  }

  /*
    SİTE HARİTASI BOŞSA arama motoru hiçbir ürünü görmüyor. Sayının
    AZALMASI da sorun olabilir ama eşiği burada tutmuyoruz: katalog
    gerçekten küçülmüş olabilir ve her küçülmede uyarı üretmek,
    uyarıyı okunmaz yapardı. Boşluk tartışmasız.
  */
  if (olcum.siteHaritasiUrun === 0) {
    ekle("site_haritasi_bos", "Site haritasında ürün yok", "Arama motorları hiçbir ürün adresi görmüyor.");
  }

  /*
    SİTE HARİTASI "BU ADRESİ İNDEKSLE" DİYOR. Oradaki bir adres
    açılmıyorsa ikisi çelişiyor ve müşteri arama sonucundan kırık
    sayfaya düşüyor — 17.10.2026'da bütün ürün sayfaları 500
    verirken site haritası 3.407 adres saymaya devam ediyordu.
  */
  if (olcum.ornekUrunDurumu !== null && olcum.ornekUrunDurumu !== 200) {
    ekle("urun_sayfasi_kapali", "Ürün sayfası açılmıyor", `Site haritasındaki bir ürün adresi ${olcum.ornekUrunDurumu} döndü.`);
  }

  if (olcum.tedarikciVar) {
    const son = olcum.sonTedarikciTaramasi ? new Date(olcum.sonTedarikciTaramasi) : null;
    const gecenSaat = son ? (simdi.getTime() - son.getTime()) / 3_600_000 : null;
    if (gecenSaat === null) {
      ekle("tedarikci_hic_taranmadi", "Tedarikçi taraması hiç koşmadı", "Tedarikçi tanımlı ama hiç içe aktarım kaydı yok; stok ve fiyat akmıyor.");
    } else if (gecenSaat > TEDARIKCI_SESSIZLIK_SAATI) {
      ekle(
        "tedarikci_durdu",
        "Tedarikçi taraması durdu",
        `Son içe aktarım ${Math.floor(gecenSaat)} saat önce. Stok ve fiyat güncellenmiyor; tükenen ürün satışta kalabilir.`,
      );
    }
  }

  return bulgular;
}

export function tumBulgular(olcumler: MagazaOlcumu[], simdi: Date): Bulgu[] {
  return olcumler.flatMap((olcum) => magazaBulgulari(olcum, simdi));
}

/*
  Bildirim metni. Bir mağazanın birden çok bulgusu tek bildirimde
  toplanıyor: üç ayrı satır, aynı sabah üç ayrı bildirim demekti ve
  çekmeceyi dolduran bildirim okunmaz olur.
*/
export function bildirimMetni(bulgular: Bulgu[]): { baslik: string; metin: string } | null {
  if (!bulgular.length) return null;
  const baslik = bulgular.length === 1 ? bulgular[0].baslik : `${bulgular.length} sorun bulundu`;
  const metin = bulgular.map((b) => `${b.baslik}: ${b.metin}`).join(" · ");
  /* Bildirim gövdesi kapıda 400 karaktere kırpılıyor; burada da kırpıp
     cümlenin ortasında kesilmesini engelliyoruz. */
  return { baslik, metin: metin.length > 380 ? `${metin.slice(0, 379).trimEnd()}…` : metin };
}
