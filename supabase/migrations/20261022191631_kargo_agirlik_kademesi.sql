/*
  KARGODA AĞIRLIK KADEMESİ (22.10.2026)

  Düz tarife kürkte zarar ettiriyordu: 3–5 kg'lık bir kürk Avrupa'ya
  22 $'a gitmiyor. Taban ücret artık `base_kg` kadarını kapsıyor,
  aşan her kilo için `fee_per_kg_cents` ekleniyor.

  HESAP TEK YERE ALINDI (`arc_kargo_senti`) ve bu, kademenin kendisi
  kadar önemli. Önce bölge seçimi ve ücret hesabı sipariş
  fonksiyonunun içinde gömülüydü; vitrin aynı kuralı TypeScript'te
  İKİNCİ KEZ yazıyordu (lib/kargo-bolgesi). Ağırlık kademesi
  eklenirken o ikizin bedeli görünür oldu: vitrin sepetteki ürünlerin
  ağırlığını bilmiyor, yani taban ücreti gösterecek ve ArvoARC
  kademeli ücreti tahsil edecekti — müşteri 22 $ görüp 45 $
  ödeyecekti. Ekranla tahsilatın ayrılması bu depodaki en pahalı
  kusur; iki uygulama yerine tek uygulama.

  KİLOLAR YUKARI YUVARLANIYOR (ceil): kargo firmaları da öyle
  ücretlendiriyor ve 2,1 kg'ı 2 kg saymak her ağır siparişte zarar.

  AĞIRLIĞI GİRİLMEMİŞ ÜRÜN mağaza varsayılanını kullanıyor
  (`default_shipping_weight_grams`, öntanımlı 500 g). Kataloğun 3.400
  ürününe ağırlık girmek bir içerik işi; girilmeyeni sıfır saymak
  tarifeyi sessizce taban ücrete indirirdi. Kullanıcı yalnızca
  ağır ürünlere (kürk) gerçek ağırlığı yazıyor.

  BU MIGRATION TEK BAŞINA HİÇBİR FİYATI DEĞİŞTİRMİYOR:
  `fee_per_kg_cents` öntanımlı 0 ve sıfırken davranış eskisiyle
  birebir aynı (düz tarife).
*/

alter table public.arc_shipping_zones
  /* Taban ücretin kapsadığı ağırlık (kg). Aşanı kiloyla ücretlenir. */
  add column if not exists base_kg numeric(6, 2) not null default 2,
  /* Taban ağırlığı aşan her kilo için eklenecek ücret (USD sent).
     0 = kademe yok, düz tarife. */
  add column if not exists fee_per_kg_cents bigint not null default 0
    check (fee_per_kg_cents >= 0);

alter table public.arc_products
  /* Gönderi ağırlığı (gram). Boş = mağaza varsayılanı. */
  add column if not exists shipping_weight_grams integer
    check (shipping_weight_grams is null or shipping_weight_grams > 0);

alter table public.arc_store_settings
  /* Ağırlığı girilmemiş ürün için varsayılan (gram). */
  add column if not exists default_shipping_weight_grams integer not null default 500
    check (default_shipping_weight_grams > 0);

comment on column public.arc_shipping_zones.base_kg is
  'Taban ücretin kapsadığı ağırlık (kg); aşanı fee_per_kg_cents ile ücretlenir.';
comment on column public.arc_shipping_zones.fee_per_kg_cents is
  'Taban ağırlığı aşan her kilo için ek ücret (USD sent); 0 = düz tarife.';
comment on column public.arc_products.shipping_weight_grams is
  'Gönderi ağırlığı (gram); boşsa arc_store_settings.default_shipping_weight_grams.';

/* --------------------------------------------------------------
   KARGO ÜCRETİ — TEK KAYNAK

   Bölge seçimi, ağırlık kademesi ve ücretsiz eşiği burada.
   Sipariş fonksiyonu ve vitrinin ödeme adımı aynı işlevi çağırıyor,
   yani ekranda görünen ile tahsil edilen AYNI hesaptan çıkıyor.

   BÖLGE YOKSA `null` DÖNÜYOR, sıfır değil: sıfır "ücretsiz kargo"
   demek olurdu ve tarifesi tanımlanmamış bir ülkeye bedava kargo
   sözü vermek, o siparişin bütün maliyetini üstlenmek.
   -------------------------------------------------------------- */

drop function if exists public.arc_kargo_senti(uuid, text, bigint, bigint);

create or replace function public.arc_kargo_senti(
  p_organization_id uuid,
  p_country text,
  p_agirlik_gram bigint,
  p_usd_ara_toplam_sent bigint
)
returns bigint
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_ulke text;
  v_bolge record;
  v_senti bigint;
  v_fazla_kg numeric;
begin
  v_ulke := upper(trim(coalesce(p_country, '')));
  if v_ulke = '' then return null; end if;

  /*
    SIRA ÖNEMLİ: önce ülkeyi AÇIKÇA sayan bölge, sonra "öteki her
    yer" (boş ülke listesi). Ters sırada olsaydı genel bölge, kendi
    tarifesi olan ülkeyi de yutardı.
  */
  select z.fee_cents, z.free_over_cents, z.base_kg, z.fee_per_kg_cents
    into v_bolge
  from public.arc_shipping_zones z
  where z.organization_id = p_organization_id
    and exists (
      select 1 from unnest(z.countries) k where upper(trim(k)) = v_ulke
    )
  order by z.sira
  limit 1;

  if not found then
    select z.fee_cents, z.free_over_cents, z.base_kg, z.fee_per_kg_cents
      into v_bolge
    from public.arc_shipping_zones z
    where z.organization_id = p_organization_id
      and coalesce(cardinality(z.countries), 0) = 0
    order by z.sira
    limit 1;
  end if;

  if not found then return null; end if;

  v_senti := v_bolge.fee_cents;

  if coalesce(v_bolge.fee_per_kg_cents, 0) > 0 then
    v_fazla_kg := ceil(
      greatest(0, coalesce(p_agirlik_gram, 0)::numeric / 1000 - coalesce(v_bolge.base_kg, 0))
    );
    v_senti := v_senti + (v_fazla_kg * v_bolge.fee_per_kg_cents)::bigint;
  end if;

  /*
    EŞİK BÜTÜN ÜCRETİ SİLİYOR, kademeyi ayırmıyor: "Ücretsiz kargo"
    yazıp 40 $ tahsil etmek müşteriye açıklanamaz. Bedeli şu: ağır
    ürün satılan bir bölgede eşiği düşük tutmak o siparişin
    kargosunu üstlenmek demek — panelde yazıyor.
  */
  if coalesce(v_bolge.free_over_cents, 0) > 0
     and coalesce(p_usd_ara_toplam_sent, 0) >= v_bolge.free_over_cents then
    return 0;
  end if;

  return v_senti;
end;
$function$;

revoke all on function public.arc_kargo_senti(uuid, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.arc_kargo_senti(uuid, text, bigint, bigint) to service_role;

CREATE OR REPLACE FUNCTION public.arc_create_storefront_order(p_organization_id uuid, p_email text, p_name text, p_phone text, p_address jsonb, p_items jsonb, p_coupon_code text DEFAULT NULL::text)
 RETURNS TABLE(order_id uuid, order_number text, total bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order_id uuid;
  v_order_number text;
  v_prefix text;
  v_shipping_fee bigint;
  v_free_threshold bigint;
  v_subtotal bigint := 0;
  v_shipping bigint := 0;
  v_discount bigint := 0;
  v_total bigint := 0;
  v_item jsonb;
  v_key text;
  v_qty integer;
  v_variant record;
  v_count integer := 0;
  v_addr jsonb;
  /* Teslimat ülkesi: yurtdışına gönderilemeyen ürün denetimi
     buna bakıyor. Boş adreste 'TR' varsayılıyor (aşağıda). */
  v_ulke text;
  v_free_shipping_coupon boolean := false;
  -- Kupona TABİ ara toplam: indirimli satırlar bunun dışında.
  v_kuponlanabilir bigint := 0;
  -- Kuponun uygulanacağı taban (birleşebilir mi sorusuna göre).
  v_kupon_tabani bigint := 0;
  /* Yurtdışı: mod, kur, kâr payı ve bölge tarifesi. */
  v_international boolean;
  v_usd_rate numeric;
  v_usd_margin numeric;
  /* Sepetin MÜŞTERİYE GÖSTERİLEN dolar karşılığı (sent). */
  v_usd_ara_toplam_sent bigint := 0;
  v_kargo_senti bigint := 0;
  /* Siparişe yazılan birim fiyat: yurtdışında kâr payı dahil. */
  v_birim bigint;
  /* Sepetin toplam gönderi ağırlığı (gram). */
  v_agirlik bigint := 0;
  /* Ağırlığı girilmemiş ürün için mağaza varsayılanı (gram). */
  v_varsayilan_agirlik integer;
begin
  if p_organization_id is null then
    raise exception 'Mağaza belirtilmedi';
  end if;

  select coalesce(s.order_prefix, 'AC'),
         coalesce(s.shipping_fee, 12000),
         coalesce(s.free_shipping_threshold, 200000),
         coalesce(s.international_enabled, false),
         s.usd_rate,
         coalesce(s.usd_margin_percent, 0),
         coalesce(s.default_shipping_weight_grams, 500)
    into v_prefix, v_shipping_fee, v_free_threshold,
         v_international, v_usd_rate, v_usd_margin,
         v_varsayilan_agirlik
  from public.arc_store_settings s
  where s.organization_id = p_organization_id;

  v_varsayilan_agirlik := coalesce(v_varsayilan_agirlik, 500);
  v_prefix := coalesce(v_prefix, 'AC');
  v_shipping_fee := coalesce(v_shipping_fee, 12000);
  v_free_threshold := coalesce(v_free_threshold, 200000);

  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'Geçersiz e-posta';
  end if;

  if p_name is null or char_length(trim(p_name)) < 2 then
    raise exception 'Geçersiz ad soyad';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Sepet boş';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'Sepette çok fazla kalem var';
  end if;

  v_addr := jsonb_build_object(
    'name', trim(p_name),
    'phone', nullif(trim(coalesce(p_phone, '')), ''),
    'address1', nullif(trim(coalesce(p_address ->> 'line', '')), ''),
    'address2', null,
    'city', nullif(trim(coalesce(p_address ->> 'city', '')), ''),
    'province', nullif(trim(coalesce(p_address ->> 'district', '')), ''),
    'zip', nullif(trim(coalesce(p_address ->> 'postal', '')), ''),
    'country', coalesce(nullif(trim(coalesce(p_address ->> 'country', '')), ''), 'TR')
  );

  /*
    ÜLKE KODU TEK BİÇİMDE. Adres alanı serbest metin: "TR", "tr",
    "Türkiye", "Turkey" hepsi gelebiliyor. Denetim bunların
    hepsini Türkiye saymak zorunda, yoksa "Türkiye" yazan müşteri
    yurtdışı sayılıp LR ürünü alamazdı.
  */
  v_ulke := upper(trim(coalesce(v_addr ->> 'country', 'TR')));
  if v_ulke in ('TURKIYE', 'TÜRKIYE', 'TÜRKİYE', 'TURKEY', 'TURKIYE CUMHURIYETI') then
    v_ulke := 'TR';
  end if;

  v_order_number := v_prefix || to_char(now() at time zone 'Europe/Istanbul', 'YYMMDD') || '-' ||
                    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.arc_orders (
    organization_id, order_number, source, status, payment_status,
    customer_email, customer_name, currency, metadata
  )
  values (
    p_organization_id, v_order_number, 'native', 'pending', 'pending',
    lower(trim(p_email)), trim(p_name), 'TRY',
    jsonb_build_object(
      'phone', p_phone,
      'shipping_address', v_addr,
      'billing', v_addr,
      'address', p_address,
      'coupon_code', p_coupon_code,
      'channel', 'storefront'
    )
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_key := v_item ->> 'sku';
    v_qty := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_key is null or v_qty < 1 or v_qty > 20 then
      raise exception 'Geçersiz sepet kalemi';
    end if;

    select v.id, v.price, v.stock, v.allow_backorder, v.supplier,
           v.compare_at_price, p.name, p.international_blocked,
           p.shipping_weight_grams
      into v_variant
    from public.arc_product_variants v
    join public.arc_products p
      on p.id = v.product_id
     and p.organization_id = v.organization_id
    where v.organization_id = p_organization_id
      and p.status = 'active'
      and (v.sku = v_key or p.slug = v_key)
    order by
      (v.sku = v_key) desc,
      (v.stock > 0) desc,
      v.price asc
    limit 1;

    if not found then
      raise exception 'Ürün bulunamadı: %', v_key;
    end if;

    /*
      MİKTAR DENETİMİ TEDARİKÇİ ÜRÜNÜNDE allow_backorder'A BAKMIYOR
      (17.10.2026).

      Eski kural yalnızca "stok yetmiyor VE stoksuz satış kapalı"
      diyordu. Tedarikçi varyantında bu koşul HİÇ sağlanmıyor:
      arc_product_variants.allow_backorder sütununun varsayılanı true
      ve tedarikçi içe aktarımı o alanı hiç yazmıyor. Sonuç: stoğu 10
      olan tedarikçi varyantına 20 adet sipariş geçiyor ve stok
      -10'a iniyordu. Tedarikçi o adedi gönderemez; farkı mağaza
      karşılar.
      (Kalem başına üst sınır zaten 20; yani 10 stoklu üründen 20
      adet istemek yukarıdaki denetimden geçiyordu.)

      Üstelik satılabilirlik kuralı da o alana bakmıyor:
      arc_variant_available tedarikçi ürününde yalnızca tampona
      bakıyor. Yani miktar denetimi, satılabilirlik denetiminden
      daha gevşekti.

      KENDİ ÜRÜNÜMÜZDE KURAL DEĞİŞMEDİ: stoksuz satış açıkken
      stoktan fazlası satılabilir — bu mağazanın bilinçli tercihi.
      Değişen yalnızca tedarikçi ürünü, çünkü orada o alan bir
      tercih değil, yazılmamış bir varsayılan.
    */
    /*
      YURTDIŞINA GÖNDERİLEMEYEN ÜRÜN.

      Kural DİLDE ya da para biriminde değil, TESLİMAT ÜLKESİNDE:
      müşteri siteyi Türkçe de gezse, adresi yurtdışıysa o ürün
      gönderilemiyor. Dil seçimine bağlasaydık İngilizce vitrine
      hiç uğramadan yurtdışı adresi yazan müşteri engele
      takılmazdı.

      Denetim BURADA, yani siparişin yazıldığı tek yerde. Vitrin
      listeyi süzüyor olsa da süzgeç bir gün atlarsa sipariş yine
      geçmemeli: görünürlük kolaylık, bu satır kural.

      Ülke bilinmiyorsa engellenmiyor: adres alanı boş gelen eski
      akışlarda bütün siparişleri reddetmek, çalışan satışı
      durdurmak olurdu.
    */
    if coalesce(v_variant.international_blocked, false)
       and v_ulke is not null
       and v_ulke <> 'TR' then
      raise exception 'Bu ürün yurtdışına gönderilemiyor: %', v_variant.name;
    end if;

    if v_variant.stock < v_qty
       and (
         v_variant.supplier is not null
         or not coalesce(v_variant.allow_backorder, false)
       ) then
      raise exception 'Yetersiz stok: %', v_variant.name;
    end if;

    /*
      YURTDIŞI FİYATI KÂR PAYINI İÇERİYOR (22.10.2026).

      Kâr payı yalnızca VİTRİNİN GÖSTERİMİNE uygulanıyordu: ekranda
      1.000 TL'lik ürün 27,71 $ yazıyor, müşterinin kartından 1.000 TL
      (= 20,53 $) çekiliyordu. Yani kâr payı hiçbir şey kazandırmıyor,
      yalnızca siteyi %35 pahalı gösteriyordu — ve ekranla tahsilat
      ayrışıyordu, bu depoda "en pahalı kusur" diye yazılı olan şeyin
      ta kendisi (17 Eylül 2026).

      KÂR PAYI KALEMİN BİRİM FİYATINA İŞLİYOR, ara toplama sonradan
      eklenmiyor: eklenseydi kalemler toplamı ara toplamı tutmazdı ve
      sipariş detayı yine "rakamlar toplanmıyor" derdi (AC261017-F93525
      olayı tam buydu). Şimdi müşterinin gördüğü her satır kendi
      içinde doğru.

      KURAL BÖYLECE SADELEŞİYOR: dolar tutarı = tahsil edilen TL ÷ kur.
      Çevrimde kâr payı YOK; kâr payı yurtdışı FİYATININ içinde.

      Yurt içinde hiçbir şey değişmiyor.
    */
    v_birim := case
      when v_ulke = 'TR' then v_variant.price
      else round(v_variant.price * (1 + v_usd_margin / 100))
    end;

    insert into public.arc_order_items (
      organization_id, order_id, variant_id,
      product_name, sku, quantity, unit_price, total
    )
    values (
      p_organization_id, v_order_id, v_variant.id,
      v_variant.name, v_key, v_qty,
      v_birim, v_birim * v_qty
    );

    v_subtotal := v_subtotal + (v_birim * v_qty);

    /*
      GÖNDERİ AĞIRLIĞI TOPLANIYOR (22.10.2026).

      Düz tarife kürkte zarar ettiriyordu: 3–5 kg'lık bir kürk
      Avrupa'ya 22 $'a gitmiyor. Ağırlığı GİRİLMEMİŞ ürün mağaza
      varsayılanını kullanıyor (ayarlardan, öntanımlı 500 g) —
      kataloğun 3.400 ürününe ağırlık girmek bir içerik işi ve
      girilmeyen her ürünü sıfır saymak, tarifeyi sessizce taban
      ücrete indirirdi.
    */
    v_agirlik := v_agirlik + coalesce(v_variant.shipping_weight_grams, v_varsayilan_agirlik)::bigint * v_qty;

    /*
      Satır indirimliyse kupona girmiyor. Ölçüt ürün kartındaki
      üstü çizili fiyatla AYNI: compare_at_price > price.
    */
    /*
      İNDİRİMLİ Mİ sorusu HAM fiyatla yanıtlanıyor (compare_at_price >
      price): bir satırın indirimli olup olmaması katalog gerçeği ve
      kâr payı onu değiştirmiyor. Kupona giren TUTAR ise kâr paylı
      birim — müşterinin ödediği tutar o.
    */
    if coalesce(v_variant.compare_at_price, 0) <= v_variant.price then
      v_kuponlanabilir := v_kuponlanabilir + (v_birim * v_qty);
    end if;

    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'Sepet boş';
  end if;

  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    /*
      TABAN: birleşebilir kuponda sepetin tamamı, değilse yalnızca
      indirimsiz satırlar.

      Asgari sepet tutarı (minimum_subtotal) SEPETİN TAMAMIYLA
      karşılaştırılmaya devam ediyor: "500 TL ve üzeri sepetlerde
      geçerli" cümlesi sepetin büyüklüğü hakkında, kuponun tabanı
      hakkında değil.

      Taban ayrı bir sorguyla okunuyor; aşağıdaki seçim kuponun
      bütün geçerlilik koşullarını (tarih, kullanım sınırı, asgari
      tutar) da sınıyor ve taban o koşullardan bağımsız. Kupon
      geçersizse v_discount zaten sıfır kalıyor.
    */
    select case
             when coalesce(d.combinable, false) then v_subtotal
             else v_kuponlanabilir
           end
      into v_kupon_tabani
    from public.arc_discounts d
    where d.organization_id = p_organization_id
      and upper(d.code) = upper(trim(p_coupon_code))
      and d.status = 'active'
    limit 1;

    v_kupon_tabani := coalesce(v_kupon_tabani, 0);

    select case
             when d.discount_type = 'percentage'
               then (v_kupon_tabani * d.value) / 100
             when d.discount_type = 'fixed_amount'
               then least(d.value, v_kupon_tabani)
             else 0
           end,
           d.discount_type = 'free_shipping'
      into v_discount, v_free_shipping_coupon
    from public.arc_discounts d
    where d.organization_id = p_organization_id
      and upper(d.code) = upper(trim(p_coupon_code))
      and d.status = 'active'
      and (d.starts_at is null or d.starts_at <= now())
      and (d.ends_at is null or d.ends_at > now())
      and (d.usage_limit is null or d.usage_count < d.usage_limit)
      and v_subtotal >= coalesce(d.minimum_subtotal, 0)
    limit 1;

    v_discount := coalesce(v_discount, 0);
    v_free_shipping_coupon := coalesce(v_free_shipping_coupon, false);
  end if;

  /*
    KARGO: YURT İÇİ TARİFE İLE YURTDIŞI TARİFESİ AYRI HESAPLANIR.

    Önceden tek yol vardı — yurt içi ücreti ve TL eşiği. Teslimat
    ülkesi yurtdışı olsa da sipariş 120 TL kargoyla geçiyordu;
    gerçek maliyet bunun on katı. Yurtdışına satış kapalı olduğu
    için canlıda zarar doğmadı ama açıldığı gün doğacaktı.

    TL EŞİĞİ YURTDIŞINDA GEÇMEZ. "2.000 TL üzeri ücretsiz kargo"
    yurt içi kargo maliyetine göre konmuş bir söz; aynı eşiği
    yurtdışında uygulamak hemen her siparişte kargoyu bedava
    yapardı. Yurtdışında eşik BÖLGENİN kendi eşiği
    (`free_over_cents`, dolar) ve bölge başına ayrı konabiliyor.

    ÜCRETSİZ KARGO KUPONU DA YURTDIŞINDA GEÇMEZ. Mevcut kuponlar
    yurt içi ücretine göre tanımlandı; biri yurtdışı siparişinde
    çalışırsa mağaza bir sipariş için yüzlerce lirayı üstlenir ve
    bunu hiçbir ekran söylemez. Kupon tanımına "yalnızca yurt içi"
    diye bir alan eklemek de aynı kararı mağazaya bırakmak olurdu;
    oysa karar teknik: tutarlar farklı büyüklükte.
  */
  if v_ulke = 'TR' then
    if v_free_shipping_coupon or v_subtotal >= v_free_threshold then
      v_shipping := 0;
    else
      v_shipping := v_shipping_fee;
    end if;
  else
    /*
      MOD KAPALIYSA YURTDIŞI SİPARİŞİ HİÇ GEÇMEZ. Vitrin yurtdışı
      adresini sormuyorken bile bu uç doğrudan çağrılabilir; kararın
      tek yeri burası.
    */
    if not coalesce(v_international, false) then
      raise exception 'Yurtdışına satış kapalı';
    end if;

    /*
      KUR YOKSA SİPARİŞ GEÇMEZ. Kur olmadan bölge tarifesi (dolar)
      liraya çevrilemiyor; uydurma bir kurla çevirmek müşteriye
      gösterilenden farklı tutar tahsil etmek olurdu.
    */
    if v_usd_rate is null or v_usd_rate <= 0 then
      raise exception 'Dolar kuru tanımlı değil';
    end if;

    /*
      EŞİK, MÜŞTERİNİN GÖRDÜĞÜ DOLAR TUTARIYLA karşılaştırılıyor.

      ÇEVRİMDE ARTIK KÂR PAYI YOK ve bu bir düzeltme: kâr payı
      yukarıda kalemin birim fiyatına işliyor, yani `v_subtotal` onu
      ZATEN içeriyor. Eskisi gibi burada bir kez daha çarpmak kâr
      payını İKİ KEZ uygulamak olurdu ve eşik, müşterinin gördüğünden
      daha erken aşılırdı.

      Kural tek cümleye indi: dolar tutarı = TL ÷ kur.
    */
    v_usd_ara_toplam_sent := ceil((v_subtotal::numeric / 100 / v_usd_rate) * 100);

    /*
      KARGO HESABI TEK YERDE: `arc_kargo_senti`. Bölge seçimi, ağırlık
      kademesi ve ücretsiz eşiği orada; vitrin de ÖDEME ADIMINDA aynı
      işlevi çağırıyor (arc_storefront_shipping_quote).

      Önce bu blok burada gömülüydü ve vitrin kuralı TypeScript'te
      ikinci kez yazıyordu. Ağırlık kademesi eklenirken o ikizin
      bedeli görünür oldu: vitrin ürünlerin ağırlığını bilmediği için
      taban ücreti gösterecek, ArvoARC kademeli ücreti tahsil
      edecekti — müşteri 22 $ görüp 45 $ ödeyecekti. İki uygulama
      yerine tek uygulama, ikizin hiç olmaması.
    */
    v_kargo_senti := public.arc_kargo_senti(
      p_organization_id, v_ulke, v_agirlik, v_usd_ara_toplam_sent
    );

    /*
      BÖLGE YOKSA SATIŞ YOK — ücretsiz kargo DEĞİL. Tarifesi
      tanımlanmamış bir ülkeye sıfır kargoyla satmak, o siparişin
      bütün maliyetini üstlenmek demek; işlev o yüzden `null`
      döndürüyor, sıfır değil.
    */
    if v_kargo_senti is null then
      raise exception 'Bu ülkeye gönderim yapılmıyor: %', v_ulke;
    end if;

    /*
      TAHSİLAT LİRA. Sipariş TRY cinsinden yazılıyor ve ödeme
      sağlayıcısı da lira tahsil ediyor; dolar yalnızca GÖSTERİM.
      Sipariş para birimini USD yapmak, sağlayıcının lira çektiği
      bir siparişi dolar olarak kaydetmek olurdu — tutarın iki
      yerde ayrılması.

      Sent × kur = kuruş: (USD×100) × (TL/USD) = TL×100.
    */
    v_shipping := round(v_kargo_senti * v_usd_rate);
  end if;

  v_total := greatest(v_subtotal - v_discount, 0) + v_shipping;

  update public.arc_orders
     set subtotal = v_subtotal,
         shipping = v_shipping,
         total = v_total,
         /*
           YURTDIŞI İZİ KAYITTA KALIYOR: hangi kurla, hangi kâr
           payıyla ve kaç sentlik tarifeyle hesaplandığı sonradan
           sorulabilir bir soru (iade, muhasebe, itiraz). Kur
           panelden değişiyor; siparişin kendi kuru kayıtta
           olmasaydı eski bir sipariş bugünkü kurla yeniden
           hesaplanırdı.
         */
         metadata = metadata || jsonb_build_object('discount', v_discount)
           || case when v_ulke = 'TR' then '{}'::jsonb else jsonb_build_object(
                'international', true,
                'shipping_country', v_ulke,
                'usd_rate', v_usd_rate,
                'usd_margin_percent', v_usd_margin,
                'shipping_usd_cents', v_kargo_senti,
                'shipping_weight_grams', v_agirlik,
                'subtotal_usd_cents', v_usd_ara_toplam_sent
              ) end,
         updated_at = now()
   where id = v_order_id;

  return query select v_order_id, v_order_number, v_total;
end;
$function$;

revoke all on function public.arc_create_storefront_order(uuid, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.arc_create_storefront_order(uuid, text, text, text, jsonb, jsonb, text) to service_role;
