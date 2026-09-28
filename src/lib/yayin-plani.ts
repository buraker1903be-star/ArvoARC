/*
  ZAMANLANMIŞ YAYIN — ürünün kendiliğinden yayına girip çıkması.

  Kampanya saatinde birinin panele girip ürünü "Aktif" yapması
  gerekiyordu. Gece yarısı başlayan indirimde bu, ya birinin gece
  beklemesi ya kampanyanın saatinde başlamaması demekti; bitişte de
  aynısı, süresi dolmuş kampanya ürünü mağazada kalıyordu.

  İKİ ALAN: publish_at (taslaktan yayına) ve unpublish_at (yayından
  taslağa). Zamanı gelen kayıtları zamanlanmış görev işliyor
  (api/cron/yayin-zamani).

  BU DOSYA ÇELİŞKİLERİ ÇÖZÜYOR. Kullanıcı durumu elle değiştirebiliyor
  ve plan bir anda anlamsızlaşabiliyor: yayına alınmış bir ürünün
  "yayına gir" zamanı, arşivlenmiş ürünün planı, hiç yayınlanmayacak
  bir taslağın "yayından çık" zamanı. Bunlar SESSİZCE bırakılırsa
  zamanlanmış görev sonradan beklenmedik bir şey yapar — arşivlediğiniz
  ürün ertesi sabah mağazada belirir.

  Saf dosya; testi tests/yayin-plani.test.ts.
*/

export type UrunDurumu = "active" | "draft" | "archived";

export type YayinGirdisi = {
  durum: UrunDurumu;
  /** ISO an ya da null. */
  publishAt: string | null;
  unpublishAt: string | null;
  /** Karşılaştırma anı (ISO); testte sabitlenebilsin diye dışarıdan. */
  simdi: string;
};

export type YayinSonucu = {
  durum: UrunDurumu;
  publishAt: string | null;
  unpublishAt: string | null;
  /** Doluysa kaydedilmiyor; kullanıcıya gösteriliyor. */
  hata?: string;
  /** Plan sessizce değişmedi, nedeni söyleniyor. */
  not?: string;
};

export function yayinPlani({ durum, publishAt, unpublishAt, simdi }: YayinGirdisi): YayinSonucu {
  const yayin = publishAt || null;
  const bitis = unpublishAt || null;

  /*
    Aralık ters ise KAYDEDİLMİYOR. Veritabanındaki kısıt da reddediyor
    ama oradan gelen mesaj kullanıcıya bir şey anlatmazdı.
  */
  if (yayin && bitis && bitis <= yayin) {
    return { durum, publishAt: yayin, unpublishAt: bitis, hata: "Yayından çıkma zamanı, yayına girme zamanından sonra olmalı." };
  }

  /*
    ARŞİV PLANI TAŞIMAZ. Arşivlenen ürün kataloğdan çekilmiş demek;
    planı bırakmak, onu ertesi sabah mağazada geri getirirdi.
  */
  if (durum === "archived") {
    return {
      durum,
      publishAt: null,
      unpublishAt: null,
      not: yayin || bitis ? "Ürün arşivlendiği için yayın zamanlaması kaldırıldı." : undefined,
    };
  }

  /*
    GEÇMİŞ ZAMAN HEMEN UYGULANIYOR. Zamanlanmış görevi beklemek,
    kullanıcıya "kaydettim ama hâlâ taslak" dakikaları yaşatırdı.
  */
  if (durum === "draft" && yayin && yayin <= simdi) {
    return { durum: "active", publishAt: null, unpublishAt: bitis, not: "Yayın zamanı geçmişte olduğu için ürün hemen yayına alındı." };
  }
  if (durum === "active" && bitis && bitis <= simdi) {
    return { durum: "draft", publishAt: null, unpublishAt: null, not: "Yayından çıkma zamanı geçmişte olduğu için ürün taslağa alındı." };
  }

  /* Yayındaki ürünün "yayına gir" zamanı anlamsız: zaten yayında. */
  if (durum === "active" && yayin) {
    return { durum, publishAt: null, unpublishAt: bitis, not: "Ürün yayında olduğu için yayına girme zamanı kaldırıldı." };
  }

  /*
    Hiç yayınlanmayacak bir taslağın "yayından çık" zamanı da anlamsız.
    Bırakılsaydı kullanıcı kampanyanın biteceğini sanır, oysa hiç
    başlamayacaktı.
  */
  if (durum === "draft" && bitis && !yayin) {
    return { durum, publishAt: null, unpublishAt: null, not: "Yayına girme zamanı verilmediği için yayından çıkma zamanı kaldırıldı." };
  }

  return { durum, publishAt: yayin, unpublishAt: bitis };
}

/** Listede ve özet şeridinde okunan kısa metin. */
export function yayinOzeti(publishAt: string | null, unpublishAt: string | null): string {
  const bicim = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
  const yaz = (iso: string) => bicim.format(new Date(iso));
  if (publishAt && unpublishAt) return `${yaz(publishAt)} – ${yaz(unpublishAt)} arası yayında`;
  if (publishAt) return `${yaz(publishAt)} tarihinde yayına girecek`;
  if (unpublishAt) return `${yaz(unpublishAt)} tarihinde yayından çıkacak`;
  return "";
}
