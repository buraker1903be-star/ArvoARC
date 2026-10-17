-- whatsapp_gonderim_kaydi
--
-- WHATSAPP GÖNDERİMLERİ KAYDA GEÇİYOR.
--
-- Meta Cloud API doğrudan kullanılıyor. Kurulum ikiye ayrıldı çünkü
-- gizlilik dereceleri farklı:
--
--   * WHATSAPP_ACCESS_TOKEN — ortam değişkeni, platforma ait, SIR.
--   * whatsapp_phone_number_id — mağaza ayarında, kiracı başına,
--     sır DEĞİL (bir kimlik, anahtar değil). Bu yüzden PayTR
--     anahtarları gibi şifreli sütuna gerek yok.
--
-- NEDEN GÜNLÜK TABLOSU: bugün ArvoARC'ta bulunan hataların çoğu
-- sessizdi — hata yok, eksik iş var. Bildirim gönderimi tam o
-- sınıftan: müşteriye mesaj gitmediğinde kimse fark etmez, sipariş
-- akışı da durmamalı. Her deneme (başarılı, başarısız,
-- yapılandırılmamış) buraya yazılıyor; panel ekranı buradan okuyor.
--
-- MÜŞTERİ ONAYI ZORUNLU. WhatsApp politikası işletmenin başlattığı
-- mesaj için onay istiyor; sipariş durumu bildirimi sözleşmenin
-- ifasına dönük olsa da onay kaydı olmadan gönderilmiyor. Onay
-- siparişin kendi kaydında (arc_orders.metadata->>'whatsapp_onay');
-- vitrindeki ödeme formu bu kutucuğu eklediğinde dolmaya başlayacak.

create table if not exists public.arc_whatsapp_messages (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  order_id uuid,
  template_key text not null,
  /* Gönderilen numara E.164, yalnızca rakam. Müşteri verisi: panelde
     yalnızca mağazanın kendi üyeleri görüyor (RLS). */
  phone text not null,
  status text not null,
  /* Meta'nın verdiği mesaj kimliği; teslim durumu web kancasıyla
     gelirse buradan eşleştirilecek. */
  provider_message_id text,
  error_message text,
  created_at timestamp with time zone not null default now()
);

alter table public.arc_whatsapp_messages drop constraint if exists arc_whatsapp_messages_pkey;
alter table public.arc_whatsapp_messages add constraint arc_whatsapp_messages_pkey primary key (id);

alter table public.arc_whatsapp_messages drop constraint if exists arc_whatsapp_messages_organization_id_fkey;
alter table public.arc_whatsapp_messages add constraint arc_whatsapp_messages_organization_id_fkey
  foreign key (organization_id) references public.organizations(id) on delete cascade;

/* Sipariş silinirse kayıt kalsın ama bağ kopsun: gönderim geçmişi
   siparişten bağımsız bir olgu. */
alter table public.arc_whatsapp_messages drop constraint if exists arc_whatsapp_messages_order_id_fkey;
alter table public.arc_whatsapp_messages add constraint arc_whatsapp_messages_order_id_fkey
  foreign key (order_id) references public.arc_orders(id) on delete set null;

alter table public.arc_whatsapp_messages drop constraint if exists arc_whatsapp_messages_status_check;
alter table public.arc_whatsapp_messages add constraint arc_whatsapp_messages_status_check
  check (status in ('gonderildi', 'basarisiz', 'yapilandirilmadi', 'onay_yok'));

alter table public.arc_whatsapp_messages enable row level security;

/*
  Okuma kurumun üyelerine. Gönderimi servis anahtarı yapıyor (RLS'i
  aşar) ama panel ekranı üyenin yetkisiyle okuyor; politikası olmayan
  tablo sessizce BOŞ dönerdi ve "mesaj gitti mi" sorusu
  yanıtlanamazdı (check:rls bu sınıfı arıyor).
*/
drop policy if exists arc_members_read_whatsapp_messages on public.arc_whatsapp_messages;
create policy arc_members_read_whatsapp_messages on public.arc_whatsapp_messages
  as permissive for select to authenticated
  using (
    exists (
      select 1 from public.organization_memberships m
      where m.organization_id = arc_whatsapp_messages.organization_id
        and m.user_id = auth.uid()
        and m.is_active
    )
  );

create index if not exists arc_whatsapp_messages_org_created_idx
  on public.arc_whatsapp_messages using btree (organization_id, created_at desc);
create index if not exists arc_whatsapp_messages_order_idx
  on public.arc_whatsapp_messages using btree (order_id);

revoke all on table public.arc_whatsapp_messages from public, anon;
grant select on table public.arc_whatsapp_messages to authenticated;
grant all on table public.arc_whatsapp_messages to service_role;

-- Mağaza başına gönderen numara kimliği.
alter table public.arc_store_settings
  add column if not exists whatsapp_phone_number_id text;
