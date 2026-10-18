/*
  HEDİYE ÇEKİNİN İADESİ (19.10.2026)

  Çekle ödenen sipariş iptal ya da iade edildiğinde bakiye
  müşteriye GERİ DÖNMÜYORDU. Para yolunun açık kalan tek
  parçası buydu: çek harcanıyor, sipariş geri alınıyor, bakiye
  buharlaşıyor.

  NE KADAR DÖNER? Sağlayıcıdan iade edilebilecek tavan zaten
  siparişin `total` alanı ve o alan ÇEK DÜŞÜLDÜKTEN SONRAKİ
  tutar (ödeme ucu öyle yazıyor). Yani:

    gerçek değer (kalemler + iade edilen kargo)  = raw
    sağlayıcıdan dönebilecek                      = min(raw, total)
    ÇEKE DÖNECEK                                  = raw - min(raw, total)

  Bu ayrım müşterinin lehine: önce GERÇEK PARA iade ediliyor,
  çek bakiyesi en sona kalıyor. Oransal dağıtım yapılmıyor —
  yuvarlama artığı üretirdi ve müşteriye açıklaması zor olurdu.

  İPTALDE TAMAMI DÖNER: ortada teslim edilmiş bir şey yok.

  KÜTÜK TEK KAYNAK. Ne kadar harcandığı ve ne kadar geri
  verildiği hareketlerden okunuyor (`order_id` o siparişe ait
  satırların toplamı); ayrı bir "iade edildi" bayrağı tutmak
  ikinci bir doğru kaynak yaratırdı ve ikisi ayrıldığı gün
  hangisinin doğru olduğu bilinemezdi.
*/

create or replace function public.arc_gift_card_refund(
  p_organization_id uuid,
  p_order_id uuid,
  p_amount bigint
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_cek_id uuid;
  v_net bigint;
  v_tutar bigint;
begin
  if p_organization_id is null or p_order_id is null then
    return 0;
  end if;

  /*
    Bu siparişte hangi çek kullanıldı? Kütükteki satırlar yalnızca
    bu siparişe ait; yükleme hareketi (order_id null) buraya
    girmiyor.
  */
  select u.gift_card_id, sum(u.amount)
    into v_cek_id, v_net
  from public.arc_gift_card_uses u
  join public.arc_gift_cards g on g.id = u.gift_card_id
  where u.order_id = p_order_id
    and g.organization_id = p_organization_id
  group by u.gift_card_id
  limit 1;

  if v_cek_id is null then return 0; end if;

  /* Net harcama: iade edilmiş kısım zaten düşülmüş durumda. */
  v_net := coalesce(v_net, 0);
  if v_net <= 0 then return 0; end if;

  /*
    p_amount null ise TAMAMI döner (iptal). Değilse istenen
    kadar, ama harcanandan fazlası değil — çek kendi bakiyesinden
    fazlasını geri alamaz.
  */
  v_tutar := least(v_net, greatest(coalesce(p_amount, v_net), 0));
  if v_tutar <= 0 then return 0; end if;

  /* Satır kilitleniyor: iki ekrandan aynı anda iade denenebilir. */
  perform 1 from public.arc_gift_cards where id = v_cek_id for update;

  update public.arc_gift_cards
     set balance = balance + v_tutar,
         updated_at = now()
   where id = v_cek_id;

  /*
    Harcama pozitif, iade NEGATİF. Çekin tanımlanması da negatif
    ama onun order_id'si yok; ikisi karışmıyor.
  */
  insert into public.arc_gift_card_uses (gift_card_id, order_id, amount, note)
  values (v_cek_id, p_order_id, -v_tutar, 'Siparişten iade edildi');

  return v_tutar;
end;
$function$;

revoke all on function public.arc_gift_card_refund(uuid, uuid, bigint)
  from public, anon, authenticated;
/* Para hareket ettiren çağrı: yalnızca sunucu. */
grant execute on function public.arc_gift_card_refund(uuid, uuid, bigint)
  to service_role;

/* --------------------------------------------------------------
   BAKİYE TAVANI KISITI

   `balance <= initial_amount` kısıtı iadeyi de sınırlıyordu:
   doğru, çünkü geri verilen tutar harcanandan fazla olamaz ve
   harcama da yüklemeyi aşamaz. Kısıt yerinde kalıyor; buraya
   yalnızca gerekçesi yazılıyor ki ileride "iade neden
   kısıtlanıyor" diye kaldırılmasın.
   -------------------------------------------------------------- */
comment on constraint arc_gift_cards_bakiye_tavani on public.arc_gift_cards is
  'Bakiye yüklenenden büyük olamaz; iade de bu tavana kadar geri verir.';
