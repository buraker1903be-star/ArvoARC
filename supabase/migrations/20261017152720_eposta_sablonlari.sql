-- eposta_sablonlari
--
-- MÜŞTERİ POSTALARININ METNİ KİRACININ OLSUN.
--
-- On müşteri postası mağazanın logosunu, rengini ve adını zaten
-- kullanıyor ama METİNLERİ kodda sabit. Çok kiracılı bir sistemde
-- bu yetmiyor: bir salon "Siparişiniz kargoya verildi" derken öteki
-- kendi ses tonunu kurmak istiyor ve bugün bunun için dağıtım
-- gerekiyor.
--
-- TASARIM: KİRACI METNİ DÜZENLER, HTML'İ DÜZENLEMEZ. Zarf (logo,
-- renk, altbilgi, buton) kodda kalıyor; burada yalnızca başlık ve
-- gövde metni duruyor ve ikisi de kaçırılarak basılıyor. Serbest
-- HTML bir yazım hatasıyla postayı bozar ve müşteriye giden bir
-- yüzeye kod enjekte etme kapısı açardı.
--
-- SATIR YOKSA BUGÜNKÜ METİN. Tablo boş olduğu sürece bütün
-- mağazaların postaları birebir aynı kalıyor (lib/eposta-sablonu.ts
-- sablonuCoz). Yeni kiracı hiçbir şey yazmadan çalışır.
--
-- Anahtar serbest metin DEĞİL, koddaki kayıtla eşleşmek zorunda;
-- kısıt onu sabitliyor. Yoksa panelde yazım hatasıyla kaydedilen bir
-- anahtar hiç kullanılmaz ve kiracı "neden değişmedi" diye sorar.

create table if not exists public.arc_email_templates (
  organization_id uuid not null,
  template_key text not null,
  subject text not null default '',
  body text not null default '',
  updated_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.arc_email_templates
  drop constraint if exists arc_email_templates_pkey;
alter table public.arc_email_templates
  add constraint arc_email_templates_pkey primary key (organization_id, template_key);

alter table public.arc_email_templates
  drop constraint if exists arc_email_templates_organization_id_fkey;
alter table public.arc_email_templates
  add constraint arc_email_templates_organization_id_fkey
  foreign key (organization_id) references public.organizations(id) on delete cascade;

alter table public.arc_email_templates
  drop constraint if exists arc_email_templates_key_check;
alter table public.arc_email_templates
  add constraint arc_email_templates_key_check
  check (template_key in ('processing', 'fulfilled', 'cancelled', 'cancelled_unpaid', 'refunded'));
/*
  'processing' listeye SONRADAN girdi: bu dosya yazıldığında
  "Hazırlanıyor" durumu e-posta göndermiyordu, aynı gün açıldı.
  Dosya o sırada henüz uygulanmamıştı, bu yüzden yeni bir migration
  yerine burası düzeltildi — uygulanmış bir migration'a dokunulmaz.

  ANAHTAR LİSTESİ KODDAKİ KAYITLA AYNI OLMAK ZORUNDA
  (lib/eposta-sablonu SABLON_KAYDI); birim testi ikisini
  karşılaştırıyor. Ayrışırsa iki yönde de kusur çıkar: listede olup
  kodda olmayan anahtar hiç kullanılmaz, kodda olup listede olmayan
  anahtar panelde kaydedilemez.
*/

/*
  Uzunluk sınırı: başlık bir e-posta konusu, gövde bir paragraf.
  Sınırsız metin hem postayı bozar hem de tabloyu depo gibi
  kullanmanın kapısını açar.
*/
alter table public.arc_email_templates
  drop constraint if exists arc_email_templates_length_check;
alter table public.arc_email_templates
  add constraint arc_email_templates_length_check
  check (char_length(subject) <= 200 and char_length(body) <= 2000);

alter table public.arc_email_templates enable row level security;

/*
  Okuma: kurumun üyeleri. Posta gönderimi servis anahtarıyla yapılıyor
  (RLS'i aşar) ama panel ekranı üyenin yetkisiyle okuyor — politikası
  olmayan tablo sessizce BOŞ dönerdi ve kiracı yazdığı metni
  göremezdi (check:rls bu sınıfı arıyor).
*/
drop policy if exists arc_members_read_email_templates on public.arc_email_templates;
create policy arc_members_read_email_templates on public.arc_email_templates
  as permissive for select to authenticated
  using (
    exists (
      select 1 from public.organization_memberships m
      where m.organization_id = arc_email_templates.organization_id
        and m.user_id = auth.uid()
        and m.is_active
    )
  );

/*
  Yazma: yalnızca mağaza yöneticisi. Metin müşteriye gidiyor; her
  üyenin değiştirebilmesi doğru değil. Rol listesi ArvoARC'ın kendi
  kalıbı (owner/admin/manager).
*/
drop policy if exists arc_managers_write_email_templates on public.arc_email_templates;
create policy arc_managers_write_email_templates on public.arc_email_templates
  as permissive for all to authenticated
  using (
    exists (
      select 1 from public.organization_memberships m
      where m.organization_id = arc_email_templates.organization_id
        and m.user_id = auth.uid()
        and m.is_active
        and m.role in ('owner', 'admin', 'manager')
    )
  )
  with check (
    exists (
      select 1 from public.organization_memberships m
      where m.organization_id = arc_email_templates.organization_id
        and m.user_id = auth.uid()
        and m.is_active
        and m.role in ('owner', 'admin', 'manager')
    )
  );

create index if not exists arc_email_templates_org_idx
  on public.arc_email_templates using btree (organization_id);

revoke all on table public.arc_email_templates from public;
grant select, insert, update, delete on table public.arc_email_templates to authenticated;
grant all on table public.arc_email_templates to service_role;
