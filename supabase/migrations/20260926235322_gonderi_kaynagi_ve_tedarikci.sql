-- GÖNDERİNİN KAYNAĞI ve TEDARİKÇİSİ.
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- Her gönderi tryOTO'dan çıkmıyor. İki ayrı çalışma biçimi var ve ilk
-- model yalnızca birincisini taşıyordu:
--
--   1. Etiketi BİZ üretiyoruz (Tarzyeri): tryOTO'da sipariş ve gönderi
--      açılıyor, etiket tedarikçiye gidiyor, o bizim adımıza kargoluyor.
--      oto_order_id, delivery_option_id ve awb_url dolu.
--
--   2. Tedarikçi KENDİ gönderiyor (LR Health and Beauty): bize yalnızca
--      kargo takip numarası veriyor. tryOTO hiç devreye girmiyor; takip
--      numarası elle giriliyor ve OTO alanlarının hepsi boş kalıyor.
--
-- Kaynak ayrımı olmadan ikisi aynı görünüyordu ve "bu gönderinin etiketi
-- neden yok" sorusunun cevabı ekranda yoktu. Ayrım ayrıca davranışı
-- belirliyor: elle girilen gönderi OTO'ya sorulamaz, durumu webhook ile
-- güncellenmez, iptali OTO'da iptal anlamına gelmez.

alter table public.arc_shipments
  add column if not exists source text not null default 'oto',
  -- Hangi tedarikçiden çıkıyor (arc_product_variants.supplier ile aynı değer).
  -- Bir siparişin kalemleri farklı tedarikçilerdeyse gönderi de ona göre
  -- bölünüyor: paketler ayrı depolardan çıkıyor, tek gönderi olamaz.
  add column if not exists supplier text,
  -- Gönderi başına gönderici konumu: her tedarikçinin deposu ayrı, mağaza
  -- ayarındaki tek kod hepsine yetmiyor. Boşsa mağaza ayarındaki kullanılır.
  add column if not exists pickup_location_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'arc_shipments_source_check'
  ) then
    alter table public.arc_shipments
      add constraint arc_shipments_source_check check (source in ('oto', 'manual'));
  end if;
end $$;

/*
  ELLE GİRİLEN GÖNDERİ TAKİP NUMARASIZ OLAMAZ.

  Kaynağı "manual" olan bir gönderinin tek işe yarar bilgisi takip
  numarasıdır: etiketi yok, OTO kaydı yok, sorgulanamaz. Numarasız
  kaydedilirse müşteriye söylenecek hiçbir şey olmadan sipariş "kargolandı"
  görünür. OTO gönderisinde ise numara sonradan geliyor (önce taslak
  açılıyor, firma seçilince numara düşüyor), o yüzden kural yalnızca elle
  girilenler için.
*/
create or replace function private.arvo_arc_shipment_source_guard()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  if new.source = 'manual' and coalesce(trim(new.tracking_number), '') = '' then
    raise exception 'Tedarikçinin kendi gönderdiği kayıtta kargo takip numarası zorunludur.';
  end if;
  return new;
end;
$$;

drop trigger if exists arvo_arc_shipment_source_guard on public.arc_shipments;
create trigger arvo_arc_shipment_source_guard
before insert or update on public.arc_shipments
for each row execute function private.arvo_arc_shipment_source_guard();

revoke all on function private.arvo_arc_shipment_source_guard() from public, anon, authenticated;

create index if not exists arc_shipments_supplier_idx
  on public.arc_shipments (organization_id, supplier)
  where supplier is not null;
