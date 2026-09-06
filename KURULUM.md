# Müşteri hesapları — ARC tarafı (düzeltilmiş)

## HANGİ REPO: C:\ArvoARC

`supabase/migrations/20260907000000_add_customer_accounts.sql`
dosyasının **içeriğini** Supabase SQL Editor'e yapıştırıp Run
deyin. Dosyayı ayrıca repoya da koyun.

## Düzeltme

Önceki sürüm `arc_order_items.created_at` sütununa göre sıralama
yapıyordu; o tabloda böyle bir sütun yok. Sıralama kalem kimliğine
(`i.id`) çevrildi — eklenme sırasını korur.

## Çalıştıktan sonra doğrulayın

```sql
select proname from pg_proc
where proname in ('claim_arvoculture_orders', 'get_arvoculture_my_orders');
```

**İki satır** dönmeli.

## Supabase panelinde

**Authentication → Providers → Email:** açık, "Confirm email"
işaretli. Doğrulama olmadan misafir siparişlerinin hesaba
bağlanması çalışmaz.

**Authentication → URL Configuration:**
- Site URL: `https://arvoculture.com`
- Redirect URLs: `https://arvoculture.com/hesap` ekleyin

**Authentication → Email Templates:** şablonlar İngilizce gelir,
Türkçeleştirin.
