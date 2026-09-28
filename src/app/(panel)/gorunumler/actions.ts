"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/tenant";
import { bildirimliDonus } from "@/lib/panel-bildirim";
import {
  EN_FAZLA_GORUNUM,
  gorunumAdi,
  gorunumListesiMi,
  gorunumSorgusu,
  gorunumYolu,
} from "@/lib/kayitli-gorunum";
import { yetkiYok } from "@/lib/yetki-metni";

/*
  KAYDEDİLMİŞ GÖRÜNÜM EYLEMLERİ.

  İki liste (siparisler, urunler) aynı eylemleri kullanıyor; hangi
  listede olduğumuz formdan geliyor ve gorunumListesiMi ile
  denetleniyor. Ayrı ayrı yazılsaydı biri düzeltildiğinde öteki
  eskirdi — bu projede tam olarak o kusuru birkaç kez temizledik.

  Sonuç ÇEREZE yazılıp listeye dönülüyor (bildirimliDonus): görünüm
  kaydetmek gezinmeyi zaten gerektiriyor, yerinde güncellemeye gerek
  yok. Dönülen adres SUNUCUDA kuruluyor (gorunumYolu), istemciden
  gelen bir "geri dön" adresi kullanılmıyor.
*/

async function yetkiliKurum(liste: unknown) {
  const { supabase, organization, membership, user } = await requireTenant();
  if (!gorunumListesiMi(liste)) return { hata: "Görünüm listesi tanınmadı." } as const;
  if (!["owner", "admin", "manager"].includes(membership.role)) {
    return { hata: yetkiYok("görünüm kaydetme") } as const;
  }
  return { supabase, organizationId: organization.id, userId: user.id, liste } as const;
}

export async function gorunumKaydet(formData: FormData): Promise<never> {
  const kapi = await yetkiliKurum(formData.get("liste"));
  if ("hata" in kapi) return await bildirimliDonus("/siparisler", { hata: kapi.hata });
  const { supabase, organizationId, userId, liste } = kapi;

  /*
    Sorgu OLDUĞU GİBİ saklanmıyor: tanınan anahtar ve değerlerden
    yeniden kuruluyor. Aksi hâlde paylaşılan bir görünüme tuhaf bir
    parametre iliştirip ekip arkadaşına tıklatmak mümkün olurdu.
  */
  const sorgu = gorunumSorgusu(liste, String(formData.get("sorgu") ?? ""));
  const ad = gorunumAdi(formData.get("ad"));
  const donus = gorunumYolu(liste, sorgu);

  /*
    Süzgeçsiz görünüm kaydedilmiyor: "Tümü" çipi zaten var ve adı ne
    olursa olsun aynı listeyi açardı.
  */
  if (!sorgu) return await bildirimliDonus(donus, { hata: "Kaydedilecek bir süzgeç yok. Önce durum, dönem veya arama seçin." });
  if (!ad) return await bildirimliDonus(donus, { hata: "Görünüme bir ad verin." });

  /*
    Sayı sınırı ŞERİT İÇİN: çipler tek satırda okunabilir kalmalı.
    Sayım yazmadan önce yapılıyor; yarış hâlinde bir fazlası geçebilir,
    bu da kimseyi engellemediği için kilit gerekmiyor.
  */
  const { count, error: sayimHatasi } = await supabase
    .from("arc_saved_views")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("liste", liste);
  /* Sayım düşerse sınır VARSAYILMIYOR; hatayı yutup yazmak sessizce
     onuncu görünümü de eklerdi. */
  if (sayimHatasi) return await bildirimliDonus(donus, { hata: "Görünümler okunamadı: " + sayimHatasi.message });
  if ((count ?? 0) >= EN_FAZLA_GORUNUM) {
    return await bildirimliDonus(donus, { hata: `En fazla ${EN_FAZLA_GORUNUM} görünüm tutulabilir. Kullanmadığınız birini kaldırın.` });
  }

  const { error } = await supabase.from("arc_saved_views").insert({
    organization_id: organizationId,
    liste,
    ad,
    sorgu,
    sira: count ?? 0,
    created_by: userId,
  });
  /* 23505: aynı ad zaten var. Postgres'in metni yerine ne yapılacağını
     söyleyen bir cümle gösteriliyor. */
  if (error) {
    const mesaj = error.code === "23505" ? `“${ad}” adında bir görünüm zaten var.` : "Görünüm kaydedilemedi: " + error.message;
    return await bildirimliDonus(donus, { hata: mesaj });
  }

  revalidatePath(`/${liste}`);
  return await bildirimliDonus(donus, { basari: `“${ad}” görünümü kaydedildi.` });
}

export async function gorunumSil(formData: FormData): Promise<never> {
  const kapi = await yetkiliKurum(formData.get("liste"));
  if ("hata" in kapi) return await bildirimliDonus("/siparisler", { hata: kapi.hata });
  const { supabase, organizationId, liste } = kapi;

  const id = String(formData.get("id") ?? "").trim();
  /* Silinen görünümün süzgeci ekranda kalıyor: kullanıcı yanlışlıkla
     kaldırdıysa aynı süzgeçle hemen yeniden kaydedebilsin. */
  const donus = gorunumYolu(liste, gorunumSorgusu(liste, String(formData.get("sorgu") ?? "")));
  if (!id) return await bildirimliDonus(donus, { hata: "Kaldırılacak görünüm belirtilmedi." });

  /*
    Kurum kısıtı sorguda da var. RLS zaten engelliyor ama başka bir
    salonun kimliğiyle gelen istek o zaman "silindi" mesajı alırdı:
    hiçbir satıra dokunmamak sessiz başarı gibi görünür.
  */
  const { data, error } = await supabase
    .from("arc_saved_views")
    .delete()
    .eq("organization_id", organizationId)
    .eq("liste", liste)
    .eq("id", id)
    .select("ad");
  if (error) return await bildirimliDonus(donus, { hata: "Görünüm kaldırılamadı: " + error.message });
  if (!data?.length) return await bildirimliDonus(donus, { hata: "Görünüm bulunamadı; başka biri kaldırmış olabilir." });

  revalidatePath(`/${liste}`);
  return await bildirimliDonus(donus, { basari: `“${data[0].ad}” görünümü kaldırıldı.` });
}
