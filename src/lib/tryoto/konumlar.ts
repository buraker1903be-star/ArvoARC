/*
  tryOTO gönderici konumları (getPickupLocationList).
  Saf modül; testi tests/tryoto-konumlar.test.ts.

  Neden panelde listeleniyor: createOrder'da gönderici adresi ya tek tek
  yazılıyor ya da OTO'da tanımlı bir konumun KODU gönderiliyor. Kodu OTO
  panelinde aramak ve ayar ekranına elle kopyalamak gereksiz bir adım;
  üstelik yanlış yazılan kod ancak ilk gönderi denemesinde hata veriyor.

  YANIT DÜZ BİR LİSTE. Önce warehouses[] ve branches[] diye iki ayrı dizi
  aranıyordu ve hiçbir zaman eşleşmedi: gerçek yanıtta tek liste var ve
  depo/şube ayrımı satırdaki `type` alanında (27.09.2026 — kullanıcının
  OTO panelinde dört konum görünürken ayar ekranı "konum tanımlı değil"
  diyordu, bu yüzden gönderiler kayıtlı konum olmadan oluşturulup
  etiketsiz kaldı). Eski şekil yine okunuyor: OTO sürümleri arasında
  değişirse ekran boşalmasın.
*/

export interface GondericiKonumu {
  kod: string;
  ad: string;
  sehir: string | null;
  /** warehouse | branch — ekranda ayrımı görünüyor. */
  tur: "depo" | "sube";
  /*
    Pasif konum listede KALIYOR ama işaretli. Gizlemek, kullanıcının
    panelde gördüğü konumu burada bulamamasına yol açıyordu; pasif bir
    konumu seçtiğinde ise sebebini bilerek seçiyor.
  */
  aktif: boolean;
}

const metin = (kayit: Record<string, unknown>, ad: string): string | null => {
  const deger = kayit[ad];
  if (typeof deger === "string" && deger.trim()) return deger.trim();
  if (typeof deger === "number") return String(deger);
  return null;
};

/** Satırdaki `type` alanından depo/şube; tanınmazsa depo sayılıyor. */
function turuCoz(kayit: Record<string, unknown>, varsayilan: GondericiKonumu["tur"]): GondericiKonumu["tur"] {
  const tur = metin(kayit, "type")?.toLocaleLowerCase("en-US");
  if (!tur) return varsayilan;
  if (tur.includes("branch")) return "sube";
  if (tur.includes("warehouse")) return "depo";
  return varsayilan;
}

function diziyiOku(deger: unknown, varsayilanTur: GondericiKonumu["tur"]): GondericiKonumu[] {
  if (!Array.isArray(deger)) return [];
  const konumlar: GondericiKonumu[] = [];
  for (const satir of deger) {
    if (!satir || typeof satir !== "object") continue;
    const kayit = satir as Record<string, unknown>;
    const kod = metin(kayit, "code");
    // Kodu olmayan konum işe yaramaz: createOrder'a verilecek değer o.
    if (!kod) continue;
    const durum = metin(kayit, "status")?.toLocaleLowerCase("en-US");
    konumlar.push({
      kod,
      ad: metin(kayit, "name") ?? kod,
      sehir: metin(kayit, "city"),
      tur: turuCoz(kayit, varsayilanTur),
      // Durum bildirilmemişse aktif sayılıyor: listede olması yeterli.
      aktif: durum ? durum === "active" : true,
    });
  }
  return konumlar;
}

export function konumlariCozumle(govde: unknown): GondericiKonumu[] {
  if (!govde) return [];
  // Yanıtın kendisi dizi olabiliyor; sarmalayıcı adı sürümden sürüme değişiyor.
  if (Array.isArray(govde)) return sirala(diziyiOku(govde, "depo"));
  if (typeof govde !== "object") return [];
  const kayit = govde as Record<string, unknown>;

  const duz = [kayit.pickupLocations, kayit.pickupLocationList, kayit.locations, kayit.data, kayit.result]
    .find((deger) => Array.isArray(deger));
  if (duz) return sirala(diziyiOku(duz, "depo"));

  // Eski (varsayılan) şekil: ayrı diziler. Artık yalnızca yedek.
  return sirala([...diziyiOku(kayit.warehouses, "depo"), ...diziyiOku(kayit.branches, "sube")]);
}

/** Aktif olanlar önce, sonra ada göre; seçilecek konum listenin başında olsun. */
function sirala(konumlar: GondericiKonumu[]): GondericiKonumu[] {
  return konumlar.sort((a, b) =>
    a.aktif === b.aktif ? a.ad.localeCompare(b.ad, "tr") : a.aktif ? -1 : 1,
  );
}
