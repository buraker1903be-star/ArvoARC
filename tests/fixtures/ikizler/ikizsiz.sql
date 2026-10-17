-- Denetim fikstürü: çok kiracılı fonksiyonun ArvoCulture ikizi yok.
CREATE OR REPLACE FUNCTION public.arc_storefront_yeni_sey(p_host text)
 RETURNS TABLE(slug text)
 LANGUAGE sql
AS $function$
  select p.slug from public.arc_products p
  join public.organizations o on o.id = public.arc_storefront_org(p_host);
$function$
;
