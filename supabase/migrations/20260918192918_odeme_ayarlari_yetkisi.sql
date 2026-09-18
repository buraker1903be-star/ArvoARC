-- ============================================================
-- Ödemenin gittiği hesabı yalnızca owner/admin değiştirir
--
-- arc_store_settings'e owner/admin/manager yazabiliyor ("arc managers
-- update store settings"). Aynı satırda mağazanın ödeme hedefi duruyor:
-- IBAN ve banka bilgisi (havale), PayTR mağaza numarası ve şifreli
-- anahtarları (kartla ödeme). Manager kendi PayTR anahtarlarını ya da
-- IBAN'ını yazarak bütün tahsilatı kendi hesabına yönlendirebilir, test
-- modunu açıp kart ödemelerinin tahsil edilmemesine yol açabilirdi.
--
-- Uygulama (src/app/(panel)/ayarlar/actions.ts updatePaymentSettings) bu
-- migration'la birlikte owner/admin'e daraltıldı; manager mağaza adı,
-- renkler, kargo ve alan adı ayarlarını değiştirmeye devam ediyor.
-- Burada aynı kural veritabanında: yalnızca ödeme sütunları korunuyor, diğer
-- sütunlara politika yine manager'a açık.
--
-- private.arvo_is_org_admin ArvoOS migration'ı 20260918171628 ile geldi
-- (ortak veritabanı). Servis anahtarı ve SQL Editor etkilenmez; fonksiyon
-- çağıranın rolüne baktığı için security INVOKER.
-- ============================================================

create or replace function private.arc_guard_payment_settings()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if private.arvo_is_org_admin(new.organization_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Satır yoksa manager'ın upsert'i satırı oluşturur; ödeme alanları
    -- varsayılanda (kapalı, boş) kalmalı.
    if new.bank_transfer_enabled or new.paytr_enabled
    or new.bank_iban is not null or new.bank_name is not null
    or new.bank_account_holder is not null
    or new.paytr_merchant_id is not null
    or new.paytr_merchant_key_enc is not null
    or new.paytr_merchant_salt_enc is not null then
      raise exception 'Ödeme hesaplarını yalnızca mağaza sahibi ve yöneticisi (admin) ayarlayabilir.'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if new.organization_id            is distinct from old.organization_id
  or new.bank_transfer_enabled      is distinct from old.bank_transfer_enabled
  or new.bank_name                  is distinct from old.bank_name
  or new.bank_account_holder        is distinct from old.bank_account_holder
  or new.bank_iban                  is distinct from old.bank_iban
  or new.bank_transfer_instructions is distinct from old.bank_transfer_instructions
  or new.paytr_enabled              is distinct from old.paytr_enabled
  or new.paytr_test_mode            is distinct from old.paytr_test_mode
  or new.paytr_merchant_id          is distinct from old.paytr_merchant_id
  or new.paytr_no_installment       is distinct from old.paytr_no_installment
  or new.paytr_max_installment      is distinct from old.paytr_max_installment
  or new.paytr_merchant_key_enc     is distinct from old.paytr_merchant_key_enc
  or new.paytr_merchant_salt_enc    is distinct from old.paytr_merchant_salt_enc
  then
    raise exception 'Ödeme hesaplarını yalnızca mağaza sahibi ve yöneticisi (admin) değiştirebilir.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end
$$;
revoke all on function private.arc_guard_payment_settings() from public, anon;

drop trigger if exists arc_guard_payment_settings on public.arc_store_settings;
create trigger arc_guard_payment_settings
  before insert or update on public.arc_store_settings
  for each row execute function private.arc_guard_payment_settings();

-- Geri almak için:
-- drop trigger if exists arc_guard_payment_settings on public.arc_store_settings;
-- drop function if exists private.arc_guard_payment_settings();
