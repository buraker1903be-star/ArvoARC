alter table public.arc_store_settings
  add column if not exists bank_transfer_enabled boolean not null default false,
  add column if not exists bank_name text,
  add column if not exists bank_account_holder text,
  add column if not exists bank_iban text,
  add column if not exists bank_transfer_instructions text,
  add column if not exists paytr_enabled boolean not null default false,
  add column if not exists paytr_test_mode boolean not null default true,
  add column if not exists paytr_merchant_id text,
  add column if not exists paytr_no_installment boolean not null default false,
  add column if not exists paytr_max_installment integer not null default 0;

alter table public.arc_store_settings drop constraint if exists arc_store_settings_bank_iban_check;
alter table public.arc_store_settings add constraint arc_store_settings_bank_iban_check
  check (bank_iban is null or bank_iban ~ '^TR[0-9]{24}$');

alter table public.arc_store_settings drop constraint if exists arc_store_settings_paytr_installment_check;
alter table public.arc_store_settings add constraint arc_store_settings_paytr_installment_check
  check (paytr_max_installment between 0 and 12);

comment on column public.arc_store_settings.paytr_merchant_id is 'Public tenant-specific PayTR merchant identifier. Merchant key and salt must only exist as server environment secrets.';
