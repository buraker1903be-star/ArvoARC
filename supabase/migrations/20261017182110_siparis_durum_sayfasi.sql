-- siparis_durum_sayfasi
--
-- MÜŞTERİNİN GİRİŞ YAPMADAN SİPARİŞİNİ GÖRDÜĞÜ SAYFA.
--
-- NEDEN: WhatsApp bildirimi "siparişiniz hazırlanıyor" diyor ama ne
-- aldığını, ne ödediğini, kargonun nerede olduğunu söylemiyor. Meta
-- şablon parametrelerinde SATIR SONU yasak, yani ürünleri mesajın
-- içinde alt alta listelemek mümkün değil; her yeni bilgi için şablon
-- metnini değiştirip yeniden onaya sokmak da sürdürülebilir değil.
-- Çözüm: mesaj kısa kalsın, ayrıntı tek bir yerde dursun.
--
-- Vitrindeki mevcut sipariş detayı (/hesap/siparis/[numara]) oturum
-- arkasında (auth.uid()). Misafir olarak sipariş veren müşteri oraya
-- giremiyor, yani bildirime konacak bağlantı giriş duvarına çarpardı.
--
-- ANAHTAR SİPARİŞİN KENDİSİNDE. 16 bayt rastgele (128 bit); tahmin
-- edilemez. Sipariş numarası KULLANILMAZ: AC261017-0042 sıralı ve
-- okunabilir, bir müşteri komşusunun siparişini deneme yanılmayla
-- bulurdu.
--
-- NE GÖSTERİLİYOR, NE GÖSTERİLMİYOR: bağlantı WhatsApp'tan gidiyor ve
-- iletilebiliyor. Bu yüzden sayfa yalnızca "siparişim ne durumda"
-- sorusunu yanıtlayan alanları veriyor — kalemler, tutarlar, kargo.
-- ADRES, E-POSTA VE TELEFON DÖNDÜRÜLMÜYOR: teslimat takibi için
-- gerekli değiller ve bağlantıyı eline geçiren biri için kişisel veri
-- olurlar.

alter table public.arc_orders
  add column if not exists public_token text;

/*
  Mevcut siparişlere de anahtar: bildirim eski bir sipariş için de
  gidebilir (durum değişikliği her an olabiliyor) ve anahtarsız sipariş
  o mesajda bağlantısız kalırdı.
*/
update public.arc_orders
   set public_token = encode(gen_random_bytes(16), 'hex')
 where public_token is null;

alter table public.arc_orders
  alter column public_token set default encode(gen_random_bytes(16), 'hex'),
  alter column public_token set not null;

create unique index if not exists arc_orders_public_token_key
  on public.arc_orders (public_token);

/*
  Durum sayfasının okuması.

  TEK FONKSİYON, İKİZ YOK. Vitrin ailesinin öteki fonksiyonları alan
  adından mağazayı çözüyor (arc_storefront_org) ve ArvoCulture'a özel
  birer ikizleri var. Burada gerek yok: anahtar siparişi buluyor,
  sipariş de kendi mağazasını taşıyor. Alan adı sormak, aynı anahtarın
  yanlış mağazada denenmesi gibi bir senaryoyu engellemiyor — çünkü
  öyle bir senaryo yok, anahtar tek bir siparişe ait.

  security definer: anon'un arc_orders'ı okuma yetkisi yok ve olmamalı.
  Fonksiyon yalnızca anahtarla eşleşen TEK siparişi döndürüyor.
*/
create or replace function public.arc_storefront_order_status(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.arc_orders;
  v_items jsonb;
  v_shipments jsonb;
begin
  /*
    Biçim denetimi önce: 32 haneli onaltılık değilse veritabanına hiç
    sorulmuyor. Uç anon'a açık; her yanlış denemeyi sorguya çevirmek
    gereksiz yük.
  */
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return null;
  end if;

  select * into v_order
    from public.arc_orders
   where public_token = p_token;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'ad', i.product_name,
             'sku', i.sku,
             'adet', i.quantity,
             'birim', i.unit_price,
             'tutar', i.total
           ) order by i.product_name
         ), '[]'::jsonb)
    into v_items
    from public.arc_order_items i
   where i.order_id = v_order.id;

  /*
    Kargo kaydı birden çok olabiliyor (kısmi gönderim, yeniden
    gönderim). Hepsi veriliyor; sayfa sırayla gösteriyor.
    İptal edilenler dışarıda: müşteriye iptal edilmiş bir takip
    numarası göstermek "kargom kayıp" telefonu demek.
  */
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'firma', s.carrier_name,
             'takip_no', s.tracking_number,
             'takip_adresi', s.tracking_url,
             'durum', s.status,
             'cikis', s.shipped_at,
             'teslim', s.delivered_at
           ) order by s.created_at
         ), '[]'::jsonb)
    into v_shipments
    from public.arc_shipments s
   where s.order_id = v_order.id
     and s.status <> 'cancelled';

  return jsonb_build_object(
    'siparis_no', v_order.order_number,
    'tarih', v_order.created_at,
    'durum', v_order.status,
    'odeme_durumu', v_order.payment_status,
    'musteri', v_order.customer_name,
    'para_birimi', v_order.currency,
    'ara_toplam', v_order.subtotal,
    'kargo', v_order.shipping,
    'vergi', v_order.tax,
    'toplam', v_order.total,
    'kalemler', v_items,
    'gonderiler', v_shipments
  );
end;
$$;

/*
  Postgres yeni fonksiyonu PUBLIC'e açık oluşturuyor ve Supabase
  varsayılanı anon'a da EXECUTE veriyor; ikisini de kaldırıp yalnızca
  gerekeni veriyoruz. Vitrin bu çağrıyı tarayıcıya açık anon
  anahtarıyla yapıyor — fonksiyonun kendi denetimi (anahtar eşleşmesi)
  tek kapı, bu yüzden yukarıda yalnızca tek sipariş döndürülüyor.
*/
revoke all on function public.arc_storefront_order_status(text) from public, anon, authenticated;
grant execute on function public.arc_storefront_order_status(text) to anon, authenticated, service_role;

/*
  Kendini sınayan blok: şema boşsa (test düzeneği) sessizce geçiyor,
  doluysa anahtarın gerçekten üretildiğini ve fonksiyonun yanlış
  anahtara null döndüğünü doğruluyor.
*/
do $$
declare
  v_token text;
  v_sonuc jsonb;
begin
  select public_token into v_token from public.arc_orders limit 1;
  if v_token is null then
    raise notice 'arc_orders boş; doğrulama atlandı.';
    return;
  end if;

  if v_token !~ '^[0-9a-f]{32}$' then
    raise exception 'public_token beklenen biçimde değil: %', v_token;
  end if;

  v_sonuc := public.arc_storefront_order_status(v_token);
  if v_sonuc is null or v_sonuc->>'siparis_no' is null then
    raise exception 'Geçerli anahtarla sipariş okunamadı.';
  end if;

  if public.arc_storefront_order_status(repeat('0', 32)) is not null then
    raise exception 'Var olmayan anahtar null dönmedi.';
  end if;

  raise notice 'Sipariş durum sayfası hazır (örnek: %).', v_sonuc->>'siparis_no';
end;
$$;
