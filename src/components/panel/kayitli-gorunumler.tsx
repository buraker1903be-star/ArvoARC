import Link from "next/link";
import { gorunumKaydet, gorunumSil } from "@/app/(panel)/gorunumler/actions";
import type { Gorunum } from "@/app/(panel)/gorunumler/oku";
import { gorunumOzeti, gorunumYolu, type GorunumListesi } from "@/lib/kayitli-gorunum";

/*
  KAYDEDİLMİŞ GÖRÜNÜM ŞERİDİ.

  EKRANDA YER KAPLAMAMA KURALI. Bu panelde bugün üç ayrı bant
  kaldırdık: her biri 56–114px'i sıfır göstermeye harcıyordu ve 900px
  ekranda listeden dört satır çalıyordu. Yeni bir kalıcı bant eklemek
  aynı hatayı tekrarlamak olurdu, o yüzden:

    - Hiç görünüm yoksa şerit ÇİZİLMİYOR.
    - "Görünümü kaydet" düğmesi yalnızca ekranda bir süzgeç VARKEN
      çıkıyor; süzgeçsiz listede görünmüyor.
    - Kaldır düğmesi yalnızca AÇIK OLAN görünümün çipinde. Hem şerit
      tek satır kalıyor hem de yanlışlıkla ekip arkadaşının görünümünü
      silmek için önce onu açmak gerekiyor.

  Form JavaScript'siz de çalışıyor: <details> yerel bir açılır,
  gönderim sunucu eylemine gidiyor.
*/

type Props = {
  liste: GorunumListesi;
  gorunumler: Gorunum[];
  /** Ekrandaki süzgecin kanonik hâli (lib/kayitli-gorunum.ts). */
  aktifSorgu: string;
  canManage: boolean;
};

export function KayitliGorunumler({ liste, gorunumler, aktifSorgu, canManage }: Props) {
  if (!gorunumler.length) return null;
  return (
    <nav className="ac-filter gorunum-serit" aria-label="Kaydedilmiş görünümler">
      <span className="gorunum-etiket">Görünümler</span>
      {gorunumler.map((gorunum) => {
        const acik = gorunum.sorgu === aktifSorgu;
        /* Açık çipin zemini kaldır düğmesini de kapsıyor. :has() yerine veri
           niteliği: işaret zaten burada biliniyor, tarayıcıya sordurmaya gerek yok. */
        return (
          <span className="gorunum-cip" data-acik={acik ? "true" : undefined} key={gorunum.id}>
            <Link
              prefetch={false}
              className="ac-btn"
              href={gorunumYolu(liste, gorunum.sorgu)}
              aria-current={acik ? "page" : undefined}
              title={gorunumOzeti(liste, gorunum.sorgu) || undefined}
            >
              {gorunum.ad}
            </Link>
            {acik && canManage ? (
              <form action={gorunumSil}>
                <input type="hidden" name="liste" value={liste} />
                <input type="hidden" name="id" value={gorunum.id} />
                <input type="hidden" name="sorgu" value={gorunum.sorgu} />
                <button className="gorunum-kaldir" type="submit" aria-label={`“${gorunum.ad}” görünümünü kaldır`} title="Görünümü kaldır">
                  ×
                </button>
              </form>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}

type KaydetProps = {
  liste: GorunumListesi;
  aktifSorgu: string;
  /** Aynı süzgeç zaten kayıtlıysa düğme çıkmıyor. */
  gorunumler: Gorunum[];
  canManage: boolean;
};

export function GorunumKaydet({ liste, aktifSorgu, gorunumler, canManage }: KaydetProps) {
  if (!canManage || !aktifSorgu) return null;
  if (gorunumler.some((gorunum) => gorunum.sorgu === aktifSorgu)) return null;
  const ozet = gorunumOzeti(liste, aktifSorgu);
  return (
    <details className="gorunum-kaydet">
      {/* Başta "+" YOK: globals.css her summary'ye +/− işareti koyuyor
          ve iki artı yan yana ("+ Görünümü kaydet +") saçmalıyordu. */}
      <summary className="ac-btn" title={ozet || undefined}>Görünümü kaydet</summary>
      <form action={gorunumKaydet} className="gorunum-kaydet-form">
        <input type="hidden" name="liste" value={liste} />
        <input type="hidden" name="sorgu" value={aktifSorgu} />
        {/*
          Önerilen ad süzgecin özeti: kullanıcıların çoğu adı düşünmek
          istemiyor, "Bekliyor · Son 7 gün" zaten aradıkları şey.
        */}
        <label>
          Görünüm adı
          <input name="ad" className="ac-input" required maxLength={40} defaultValue={ozet.slice(0, 40)} autoComplete="off" />
        </label>
        <p className="list-hint">Bu süzgeç salonun tüm ekibine görünür.</p>
        <button className="ac-btn ac-btn-primary" type="submit">Kaydet</button>
      </form>
    </details>
  );
}
