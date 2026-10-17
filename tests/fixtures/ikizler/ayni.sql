-- Denetim fikstürü: ikizler aynı; yalnızca kiracı çözümü ve yorum farklı.
CREATE OR REPLACE FUNCTION public.arc_storefront_ornek(p_host text, p_slug text)
 RETURNS TABLE(slug text)
 LANGUAGE sql
AS $function$
  select p.slug from public.arc_products p
  join public.organizations o on o.id = public.arc_storefront_org(p_host)
  where p.slug = p_slug
  limit 200;
$function$
;

CREATE OR REPLACE FUNCTION public.get_arvoculture_storefront_ornek(p_slug text)
 RETURNS TABLE(slug text)
 LANGUAGE sql
AS $function$
  /* Bu ikizde olayın tarihçesi yazılı; davranış aynı. */
  select p.slug from public.arc_products p
  join public.organizations o on o.slug = 'arvoculture'
  where p.slug = p_slug
  limit 200;
$function$
;
