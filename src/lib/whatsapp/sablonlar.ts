/*
  WHATSAPP ŞABLONLARI — META'DA ONAYLANAN METİNLERİN KAYDI.

  WhatsApp'ta işletmenin BAŞLATTIĞI mesaj serbest metin olamaz:
  Meta'da önceden onaylanmış bir şablon ve ona verilen sıralı
  parametrelerle gönderilir. Serbest metin yalnızca müşteri yazdıktan
  sonraki 24 saatlik pencerede mümkün.

  BURADAKİ KAYIT, META'DAKİ ŞABLONUN AYNASI. İki taraf ayrışırsa
  mesaj gitmez (şablon adı bulunamaz) ya da daha kötüsü PARAMETRELER
  KAYAR: Meta şablonu {{1}}, {{2}} diye konumsal tutuyor, yani
  sıranın değişmesi müşteriye "Siparişiniz AC261017-0042 kargoya
  verildi" yerine "Siparişiniz Ayşe Yılmaz kargoya verildi" yazdırır.
  Hata vermez, yanlış mesaj gider — bu dosyanın asıl sebebi bu.

  `govde` alanı Meta'ya YAZILACAK metnin birebir kendisi; şablonu
  oluştururken buradan kopyalanır. Kodun kullandığı değerler ise
  `parametreler` sırasına göre dizilir.

  Saf dosya; testi tests/whatsapp-sablonlari.test.ts.
*/

/** Şablonda kullanılabilen değerler. Adlar e-posta şablonlarıyla aynı. */
export type WaDegerleri = {
  magaza?: string;
  musteri?: string;
  siparis_no?: string;
  tutar?: string;
  kargo_firmasi?: string;
  takip_no?: string;
};

export type WaSablon = {
  /** Meta'daki şablon adı: küçük harf ve alt çizgi. */
  ad: string;
  /** Meta'da seçilen dil. */
  dil: "tr";
  /** Konumsal parametrelerin SIRASI; {{1}} ilk eleman. */
  parametreler: readonly (keyof WaDegerleri)[];
  /** Meta'ya yazılacak gövde metni (parametreler {{n}} olarak). */
  govde: string;
  /** Ne zaman gönderildiği — panel ekranı bunu yazıyor. */
  aciklama: string;
};

export const WA_SABLONLARI: Record<string, WaSablon> = {
  siparis_alindi: {
    ad: "siparis_alindi",
    dil: "tr",
    parametreler: ["musteri", "siparis_no", "tutar"],
    govde:
      "Merhaba {{1}}, {{2}} numaralı siparişiniz alındı. Tutar: {{3}}. Siparişiniz hazırlanmaya başladığında tekrar bilgilendirileceksiniz.",
    aciklama: "Sipariş oluştuğunda ve ödemesi alındığında.",
  },
  siparis_hazirlaniyor: {
    ad: "siparis_hazirlaniyor",
    dil: "tr",
    parametreler: ["musteri", "siparis_no"],
    govde:
      "Merhaba {{1}}, {{2}} numaralı siparişiniz hazırlanmaya başlandı. Kargoya verildiğinde tekrar bilgilendirileceksiniz.",
    aciklama: "Sipariş \"hazırlanıyor\" durumuna alındığında.",
  },
  /*
    Takip numarası OLMADAN kargoya verilen sipariş.

    Personel takip numarasını girmeden durumu "kargoya verildi"
    yapabiliyor ve o an e-posta gidiyordu ama WhatsApp gitmiyordu:
    tek şablon (siparis_kargoda) takip numarası istiyor, olmayan
    değerle de gönderilemiyor. Müşteri aynı olayı bir kanalda
    öğrenip ötekinde öğrenemiyordu. Takip numarası sonradan
    girildiğinde siparis_kargoda ayrıca gidiyor — bu mesaj onun
    yerine değil, ondan önce.
  */
  siparis_kargolandi: {
    ad: "siparis_kargolandi",
    dil: "tr",
    parametreler: ["musteri", "siparis_no"],
    govde:
      "Merhaba {{1}}, {{2}} numaralı siparişiniz kargoya verildi. Takip bilgileri kısa süre içinde sistemde görünür olacak.",
    aciklama: "Takip numarası girilmeden kargoya verildiğinde.",
  },
  siparis_kargoda: {
    ad: "siparis_kargoda",
    dil: "tr",
    parametreler: ["musteri", "siparis_no", "kargo_firmasi", "takip_no"],
    /*
      METİN DEĞİŞKENLE BİTEMEZ. İlk sürüm "… takip numarası: {{4}}"
      ile bitiyordu ve Meta şablonu reddetti (error_subcode 2388299:
      "Variables can't be at the start or end of the template").
      Aynı kural başlangıç için de geçerli.
    */
    govde:
      "Merhaba {{1}}, {{2}} numaralı siparişiniz {{3}} ile kargoya verildi. Takip numarası: {{4}}. Kargonuzu kargo firmasının sitesinden takip edebilirsiniz.",
    aciklama: "Takip numarası girildiğinde.",
  },
  siparis_iptal: {
    ad: "siparis_iptal",
    dil: "tr",
    parametreler: ["musteri", "siparis_no"],
    govde:
      "Merhaba {{1}}, {{2}} numaralı siparişiniz iptal edildi. Ödemeniz alınmışsa tutar en geç on dört gün içinde ödeme yaptığınız yönteme iade edilir.",
    aciklama: "Sipariş iptal edildiğinde.",
  },
  iade_tamamlandi: {
    ad: "iade_tamamlandi",
    dil: "tr",
    parametreler: ["musteri", "siparis_no"],
    govde:
      "Merhaba {{1}}, {{2}} numaralı siparişinizin iadesi tamamlandı. Tutarın kartınıza yansıma süresi bankanıza bağlıdır.",
    aciklama: "İade tamamlandığında.",
  },
};

export const WA_ANAHTARLARI = Object.keys(WA_SABLONLARI);

/*
  TELEFONU E.164'E ÇEVİRME.

  Cloud API numarayı ülke koduyla ve yalnızca rakamla istiyor
  ("905551112233"). Sipariş kaydındaki numara müşterinin yazdığı
  biçimde duruyor: "+90 555 111 22 33", "0555 111 22 33",
  "5551112233" hepsi olabiliyor.

  Yanlış biçim sessiz bir hata değil — Cloud API reddediyor — ama
  reddi her seferinde görmek yerine burada normalleştiriyoruz.
  Türkiye dışı numara için ülke kodu ZORUNLU: başında 0 olan on bir
  haneli bir numarayı Türkiye sayıyoruz, ondan kısasını ya da
  tanımadığımız bir biçimi reddediyoruz (uydurup yanlış kişiye mesaj
  göndermektense göndermemek doğru).
*/
export function numarayiDuzelt(ham: string | null | undefined): string | null {
  const rakamlar = String(ham ?? "").replace(/\D/g, "");
  if (!rakamlar) return null;
  /* 90 ile başlayan 12 hane: zaten ülke kodlu. */
  if (rakamlar.length === 12 && rakamlar.startsWith("90")) return rakamlar;
  /* 0 ile başlayan 11 hane: Türkiye, baştaki sıfır atılıp 90 ekleniyor. */
  if (rakamlar.length === 11 && rakamlar.startsWith("0")) return `90${rakamlar.slice(1)}`;
  /* 5 ile başlayan 10 hane: Türkiye cep numarası, kodsuz yazılmış. */
  if (rakamlar.length === 10 && rakamlar.startsWith("5")) return `90${rakamlar}`;
  /* Ülke kodlu ve makul uzunlukta başka bir numara. */
  if (rakamlar.length >= 11 && rakamlar.length <= 15) return rakamlar;
  return null;
}

/** Şablon gövdesindeki {{1}}, {{2}}… yerine değerleri koyar. */
function govdeyiDoldur(sablon: WaSablon, sirali: string[]): string {
  return sablon.govde.replace(/\{\{(\d+)\}\}/g, (tam, sira) => sirali[Number(sira) - 1] ?? tam);
}

/** ArvoOS'un WhatsApp kapısına gönderilecek tek mesaj. */
export type KapiMesaji = {
  /** E.164, yalnızca rakam. */
  to: string;
  /** Meta'daki onaylı şablonun adı. */
  template: string;
  /** Konumsal parametreler; {{1}} ilk eleman. */
  params: string[];
  language: string;
  /**
   * Müşterinin GÖRECEĞİ metin, parametreler yerleştirilmiş hâlde.
   *
   * Kapı bunu mesaj kaydına yazıyor ve ArvoOS'un gelen kutusu
   * ekranı buradan okuyor. Yazılmazsa personel konuşmada yalnızca
   * şablon adını görür ("siparis_kargoda"), müşteriye ne yazdığımızı
   * göremez.
   */
  body: string;
};

/**
 * Şablonu kapının beklediği mesaja çevirir.
 *
 * ÖNCEDEN BURADA CLOUD API GÖVDESİ KURULUYORDU ve mesaj doğrudan
 * graph.facebook.com'a gidiyordu. Yanlıştı: ArvoOS'ta dört ürünün
 * ortak WhatsApp kapısı var (lib/whatsapp-gateway.ts) ve oranın
 * değişmezi "ürünler Meta'ya değil kapıya çağırır" diyor — tek
 * yerde erişim anahtarı, tek yerde mesaj kaydı, tek yerde hata
 * haritası. Doğrudan çağrı ayrıca numarayı mağaza ayarından
 * okuyordu; oysa numara KURUMA bağlı ve ArvoOS'ta duruyor.
 *
 * Eksik parametre SESSİZCE boş gönderilmiyor: Meta eksik parametreyi
 * reddediyor ve mesaj hiç gitmiyor, ama hangi değerin eksik olduğunu
 * söylemiyor. Burada adını veriyoruz.
 */
export function kapiMesaji(
  anahtar: string,
  numara: string,
  degerler: WaDegerleri,
): { mesaj: KapiMesaji } | { hata: string } {
  const sablon = WA_SABLONLARI[anahtar];
  if (!sablon) return { hata: `Tanınmayan şablon: ${anahtar}` };

  /*
    Numara burada E.164'e çevriliyor ama kapı KENDİ denetimini de
    yapıyor ve yalnızca Türkiye cep numarasını kabul ediyor
    (lib/whatsapp-send: /^5\d{9}$/). Yurt dışı numaralı bir sipariş
    buradan geçer, kapıdan "numara geçersiz" diye döner — sessiz
    değil, sonucu çağırana yazılı olarak ulaşır.
  */
  const duzgun = numarayiDuzelt(numara);
  if (!duzgun) return { hata: `Telefon numarası WhatsApp için uygun değil: ${numara || "(boş)"}` };

  const eksik = sablon.parametreler.filter((ad) => !String(degerler[ad] ?? "").trim());
  if (eksik.length) return { hata: `Şablon parametresi eksik (${anahtar}): ${eksik.join(", ")}` };

  const sirali = sablon.parametreler.map((ad) => String(degerler[ad]).trim());
  return {
    mesaj: {
      to: duzgun,
      template: sablon.ad,
      params: sirali,
      language: sablon.dil,
      body: govdeyiDoldur(sablon, sirali),
    },
  };
}
