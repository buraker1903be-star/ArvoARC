/*
  KUR OTOMATİK GÜNCELLENİYOR (22.10.2026)

  20261018220531'in yorumu "KUR PANELDEN, CANLI DEĞİL" diyordu ve
  gerekçesi şuydu: dış bir servise bağlanmak, servis düştüğü gün
  fiyatın ne olacağı sorusunu doğuruyor. Soru hâlâ geçerli ama
  elle güncelleme kurum sahibi için sürdürülebilir değil — kur her
  gün oynuyor ve güncellenmeyen kur, kataloğu yanlış fiyatlıyor.
  Karar kurum sahibinin.

  SORUNUN YANITI: servis düştüğünde HİÇBİR ŞEY OLMUYOR. Son bilinen
  kur yerinde kalıyor (sıfırlanmıyor, tahmin edilmiyor) ve kurun
  TARİHİ kayda yazılıyor. Bayatlayan kur artık görünür bir şey:
  panel yaşını gösteriyor ve günlük öz denetim kurum sahibine
  bildiriyor. "Yanlış bilgi göstermek, hiç göstermemekten kötüdür"
  kuralının buradaki karşılığı bu — fiyat durmaya devam ediyor ama
  sessiz kalmıyor.

  ELLE KİP KORUNUYOR (`usd_rate_auto` varsayılan FALSE). Kurum sahibi
  kuru sabitlemek isteyebilir (kampanya, anlaşmalı fiyat) ve
  otomatiği zorunlu kılmak o kararı elinden almak olurdu. Varsayılan
  kapalı: bugün kurulu mağazaların davranışı değişmiyor, açmak
  bilinçli bir seçim.
*/

alter table public.arc_store_settings
  /* Açıkken zamanlanmış iş (api/cron/kur) yazıyor; kapalıyken yalnızca panel. */
  add column if not exists usd_rate_auto boolean not null default false,
  /* Kurun kaydedildiği an: panel yaşını gösteriyor, öz denetim bayatlığı
     buradan ölçüyor. Elle girilen kurda da yazılıyor. */
  add column if not exists usd_rate_updated_at timestamptz,
  /* "tcmb" ya da "manuel". Hangi kurla fiyatlandığı sonradan
     sorulabilir bir soru (muhasebe, itiraz). */
  add column if not exists usd_rate_source text;

comment on column public.arc_store_settings.usd_rate_auto is
  'Açıkken dolar kuru TCMB bülteninden günlük güncellenir; kapalıyken panelden elle.';
comment on column public.arc_store_settings.usd_rate_updated_at is
  'Dolar kurunun son kaydedildiği an; bayatlığı öz denetim buradan ölçüyor.';
comment on column public.arc_store_settings.usd_rate_source is
  'Kurun kaynağı: tcmb | manuel.';

/*
  BUGÜNKÜ KURUN TARİHİ GEÇMİŞE YAZILMIYOR.

  Elle girilmiş bir kur varsa `usd_rate_updated_at` boş kalıyor ve
  panel "bilinmiyor" diyor. `now()` yazmak, aslında bir hafta önce
  girilmiş bir kuru "bugün güncellendi" diye göstermek olurdu — öz
  denetim de o yüzden bayatlığı göremezdi. Boş değer dürüst olanı.
*/
