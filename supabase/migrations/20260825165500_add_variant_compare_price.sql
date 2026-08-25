alter table public.arc_product_variants
  add column if not exists compare_at_price bigint null;

alter table public.arc_product_variants
  drop constraint if exists arc_product_variants_compare_at_price_check;

alter table public.arc_product_variants
  add constraint arc_product_variants_compare_at_price_check
  check (compare_at_price is null or compare_at_price >= 0);

comment on column public.arc_product_variants.compare_at_price is
  'Original list price in minor currency units; a discount is active when greater than price.';
