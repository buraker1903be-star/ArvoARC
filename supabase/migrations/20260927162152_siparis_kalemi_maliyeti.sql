-- SİPARİŞ KALEMİNE MALİYET.
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- Kâr sütunu (sipariş listesi, 27.09.2026) maliyeti varyantın BUGÜNKÜ
-- cost_price alanından okuyordu: tedarikçi fiyatı değişince geçmiş
-- siparişlerin kârı da değişmiş görünüyordu. Maliyet satışın bir
-- gerçeği; sipariş anında donmalı.
--
-- YAZMA İŞİ TETİKLEYİCİDE, uygulama kodunda değil. Sipariş kalemi üç
-- ayrı yoldan oluşuyor (vitrin siparişi, panelden manuel sipariş,
-- Shopify aktarımı) ve dördüncüsü yarın eklenebilir; tek tek yazmak
-- er geç birini atlar ve o siparişin kârı sessizce boş kalır.
--
-- GERİYE DÖNÜK DOLDURMA bugünkü maliyetle yapılıyor. Doğrusu bu değil
-- ama elimizdeki tek veri o ve ekranda zaten bu sayı görünüyordu;
-- doldurmamak bütün geçmiş siparişleri "—" yapardı. Bundan sonrası
-- donmuş olacak.

alter table public.arc_order_items
  add column if not exists cost_price bigint;

comment on column public.arc_order_items.cost_price is
  'Satış anındaki birim alış fiyatı (kuruş). Tetikleyici dolduruyor; sonradan değişmez.';

-- Geçmiş kalemler: varyantın bugünkü alış fiyatı.
update public.arc_order_items oi
   set cost_price = v.cost_price
  from public.arc_product_variants v
 where oi.variant_id = v.id
   and oi.cost_price is null
   and v.cost_price is not null;

/*
  Kalem eklenirken maliyet varyanttan alınıyor. Açıkça bir değer
  verilmişse ona dokunulmuyor: aktarım ya da düzeltme kendi maliyetini
  yazabilmeli.

  Varyantı olmayan kalem (eski Shopify aktarımı, elle yazılmış satır)
  null kalıyor — uydurma bir maliyet, kârı olduğundan yüksek gösterir.
*/
create or replace function private.arc_order_item_cost()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.cost_price is null and new.variant_id is not null then
    select v.cost_price into new.cost_price
      from public.arc_product_variants v
     where v.id = new.variant_id
       and v.organization_id = new.organization_id;
  end if;
  return new;
end
$function$;

revoke all on function private.arc_order_item_cost() from public, anon, authenticated;

drop trigger if exists arc_order_item_cost on public.arc_order_items;
create trigger arc_order_item_cost
  before insert on public.arc_order_items
  for each row execute function private.arc_order_item_cost();
