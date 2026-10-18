/*
  YURTDIŞI KARGO TARİFESİ SİPARİŞE BAĞLANIYOR (19.10.2026)

  Bölge tablosu (`arc_shipping_zones`) 20261018220531'de açıldı ama
  siparişi hesaplayan fonksiyon onu hiç okumuyordu: teslimat ülkesi
  neresi olursa olsun yurt içi tarifesi uygulanıyordu. Yurtdışına
  satış kapalı olduğu için canlıda zarar doğmadı; açıldığı gün her
  yurtdışı siparişi 120 TL kargoyla geçecekti.

  TUTARI ARVOARC HESAPLAR, VİTRİN AYNALAR. Bu yüzden kural burada;
  vitrindeki karşılığı (`lib/kargo-bolgesi` ikizi ve
  `lib/order-quote`) aynı gün güncelleniyor. 17 Eylül 2026'da bu iki
  taraf ayrıldı ve müşteri ödemede ArvoARC'ın tahsil ettiğinden farklı
  tutar gördü.

  DOLAR GÖSTERİM, LİRA TAHSİLAT. Sipariş TRY cinsinden yazılmaya devam
  ediyor: ödeme sağlayıcısı lira çekiyor ve siparişi USD kaydetmek
  tutarı iki yerde ayırırdı. Dolar fiyatı vitrinde hesaplanıyor
  (`lib/dolar`), bölge tarifesi de dolar girilip kurla liraya
  çevriliyor.

  KÂR PAYI TARİFEYE DE İŞLİYOR. Bölge ücreti dolar TABANI; müşteriye
  gösterilirken öteki tutarlar gibi kâr payıyla çevriliyor. Kargoyu
  ayrı bir yoldan, kâr payı eklenmeden göstermek sepette iki farklı
  çevrim kuralı demekti — ve iki kuralın ayrışması bu depodaki en
  pahalı kusurların kalıbı.

  Vitrinin bölgeleri okuyabilmesi için üçlü de aşağıda:
  `arc_vitrin_kargo_bolgeleri` (çekirdek) ve iki sarmalayıcı.
*/

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
  v_bolge record;
  /* Sepetin MÜŞTERİYE GÖSTERİLEN dolar karşılığı (sent). */
  v_usd_ara_toplam_sent bigint := 0;
  v_kargo_senti bigint := 0;
begin
  if p_organization_id is null then
    raise exception 'Mağaza belirtilmedi';
  end if;

  select coalesce(s.order_prefix, 'AC'),
         coalesce(s.shipping_fee, 12000),
         coalesce(s.free_shipping_threshold, 200000),
         coalesce(s.international_enabled, false),
         s.usd_rate,
         coalesce(s.usd_margin_percent, 0)
    into v_prefix, v_shipping_fee, v_free_threshold,
         v_international, v_usd_rate, v_usd_margin
  from public.arc_store_settings s
  where s.organization_id = p_organization_id;

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
           v.compare_at_price, p.name, p.international_blocked
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

    insert into public.arc_order_items (
      organization_id, order_id, variant_id,
      product_name, sku, quantity, unit_price, total
    )
    values (
      p_organization_id, v_order_id, v_variant.id,
      v_variant.name, v_key, v_qty,
      v_variant.price, v_variant.price * v_qty
    );

    v_subtotal := v_subtotal + (v_variant.price * v_qty);

    /*
      Satır indirimliyse kupona girmiyor. Ölçüt ürün kartındaki
      üstü çizili fiyatla AYNI: compare_at_price > price.
    */
    if coalesce(v_variant.compare_at_price, 0) <= v_variant.price then
      v_kuponlanabilir := v_kuponlanabilir + (v_variant.price * v_qty);
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
      EŞİK, MÜŞTERİNİN GÖRDÜĞÜ DOLAR TUTARIYLA karşılaştırılıyor —
      yani kâr payı dahil. Ham karşılıkla karşılaştırsaydık sepette
      "205 $" yazan müşteri eşiği 200 $ olan bölgede kargo ücreti
      görürdü: ekranla tahsilatın ayrıldığı, bu depoda bir kez
      yaşanmış kusur.
    */
    v_usd_ara_toplam_sent := ceil(
      (v_subtotal::numeric / 100 / v_usd_rate) * (1 + v_usd_margin / 100) * 100
    );

    /*
      BÖLGE SEÇİMİ: önce ülkeyi AÇIKÇA sayan bölge, sonra "öteki her
      yer" (boş ülke listesi). Ters sırada olsaydı genel bölge, kendi
      tarifesi olan ülkeyi de yutardı. Aynı sıra lib/kargo-bolgesi.ts
      içinde ve vitrinin ikizinde de var.
    */
    select z.fee_cents, z.free_over_cents
      into v_bolge
    from public.arc_shipping_zones z
    where z.organization_id = p_organization_id
      and exists (
        select 1 from unnest(z.countries) k
        where upper(trim(k)) = v_ulke
      )
    order by z.sira
    limit 1;

    if not found then
      select z.fee_cents, z.free_over_cents
        into v_bolge
      from public.arc_shipping_zones z
      where z.organization_id = p_organization_id
        and coalesce(cardinality(z.countries), 0) = 0
      order by z.sira
      limit 1;
    end if;

    /*
      BÖLGE YOKSA SATIŞ YOK — ücretsiz kargo DEĞİL. Tarifesi
      tanımlanmamış bir ülkeye sıfır kargoyla satmak, o siparişin
      bütün maliyetini üstlenmek demek (lib/kargo-bolgesi.ts'te de
      `null` dönüyor, sıfır değil).
    */
    if not found then
      raise exception 'Bu ülkeye gönderim yapılmıyor: %', v_ulke;
    end if;

    if v_bolge.free_over_cents > 0
       and v_usd_ara_toplam_sent >= v_bolge.free_over_cents then
      v_kargo_senti := 0;
    else
      v_kargo_senti := v_bolge.fee_cents;
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
                'subtotal_usd_cents', v_usd_ara_toplam_sent
              ) end,
         updated_at = now()
   where id = v_order_id;

  return query select v_order_id, v_order_number, v_total;
end;
$function$;

revoke all on function public.arc_create_storefront_order(uuid, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.arc_create_storefront_order(uuid, text, text, text, jsonb, jsonb, text) to service_role;

/* --------------------------------------------------------------
   BÖLGELERİ VİTRİNE AÇAN ÜÇLÜ

   Vitrin kargoyu KENDİ hesaplamıyor, aynalıyor: müşteri ülkesini
   seçtiği anda ücreti görmek zorunda ve her tuş vuruşunda sunucuya
   sormak gerekmemeli. Tarife listesi bu yüzden okunuyor, hesap
   `lib/kargo-bolgesi` ikizinde yapılıyor.

   ÜCRET DOLAR SENTİ OLARAK VERİLİYOR, liraya çevrilmiş hâliyle
   değil: çevrimi vitrin de aynı kuralla yapıyor ve kuru zaten
   ayar fonksiyonundan alıyor. Burada çevirmek, aynı kuralın
   ikinci bir kopyasını SQL'de tutmak olurdu.
   -------------------------------------------------------------- */

drop function if exists public.arc_vitrin_kargo_bolgeleri(uuid);

create or replace function public.arc_vitrin_kargo_bolgeleri(p_organization_id uuid)
returns table (
  label text,
  countries text[],
  fee_cents bigint,
  free_over_cents bigint,
  sira integer
)
language sql
stable
security definer
set search_path to ''
as $function$
  select z.label, z.countries, z.fee_cents, z.free_over_cents, z.sira
  from public.arc_shipping_zones z
  where z.organization_id = p_organization_id
  order by z.sira, z.label;
$function$;

revoke all on function public.arc_vitrin_kargo_bolgeleri(uuid) from public, anon, authenticated;
grant execute on function public.arc_vitrin_kargo_bolgeleri(uuid) to service_role;

drop function if exists public.arc_storefront_shipping_zones(text);

create or replace function public.arc_storefront_shipping_zones(p_host text)
returns table (
  label text,
  countries text[],
  fee_cents bigint,
  free_over_cents bigint,
  sira integer
)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from public.arc_vitrin_kargo_bolgeleri(public.arc_storefront_org(p_host));
$function$;

revoke all on function public.arc_storefront_shipping_zones(text) from public;
grant execute on function public.arc_storefront_shipping_zones(text) to anon, authenticated, service_role;

drop function if exists public.get_arvoculture_storefront_shipping_zones();

create or replace function public.get_arvoculture_storefront_shipping_zones()
returns table (
  label text,
  countries text[],
  fee_cents bigint,
  free_over_cents bigint,
  sira integer
)
language sql
stable
security definer
set search_path to ''
as $function$
  select * from public.arc_vitrin_kargo_bolgeleri(
    (select id from public.organizations where slug = 'arvoculture' limit 1));
$function$;

revoke all on function public.get_arvoculture_storefront_shipping_zones() from public;
grant execute on function public.get_arvoculture_storefront_shipping_zones() to anon, authenticated, service_role;
