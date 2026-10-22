-- Unified search (batch 1): generated, normalized search columns + trigram
-- indexes on every table searched server-side. Same pattern as
-- patients.search_norm (20261022120000): letters/digits only, lowercased,
-- fields separated by '|' so a search word never matches across two fields.
-- Mirrors normalizeSearch() in src/lib/search.ts.

-- ICD-10: code | name
alter table public.icd10_codes
  add column if not exists search_norm text
  generated always as (
    lower(
      regexp_replace(coalesce(code, ''), '[^[:alnum:]]', '', 'g') || '|' ||
      regexp_replace(coalesce(name_ru, ''), '[^[:alnum:]]', '', 'g')
    )
  ) stored;

-- Drug formulary: trade name | INN
alter table public.drug_formulary
  add column if not exists search_norm text
  generated always as (
    lower(
      regexp_replace(coalesce(trade_name, ''), '[^[:alnum:]]', '', 'g') || '|' ||
      regexp_replace(coalesce(inn, ''), '[^[:alnum:]]', '', 'g')
    )
  ) stored;

-- Products: name | INN | barcode
alter table public.products
  add column if not exists search_norm text
  generated always as (
    lower(
      regexp_replace(coalesce(name, ''), '[^[:alnum:]]', '', 'g') || '|' ||
      regexp_replace(coalesce(inn, ''), '[^[:alnum:]]', '', 'g') || '|' ||
      regexp_replace(coalesce(barcode, ''), '[^[:alnum:]]', '', 'g')
    )
  ) stored;

-- Services: name | code
alter table public.services
  add column if not exists search_norm text
  generated always as (
    lower(
      regexp_replace(coalesce(name, ''), '[^[:alnum:]]', '', 'g') || '|' ||
      regexp_replace(coalesce(code, ''), '[^[:alnum:]]', '', 'g')
    )
  ) stored;

-- Persons (staff): last+first+middle | first+last
alter table public.persons
  add column if not exists search_norm text
  generated always as (
    lower(
      regexp_replace(coalesce(last_name, '') || coalesce(first_name, '') || coalesce(middle_name, ''), '[^[:alnum:]]', '', 'g') || '|' ||
      regexp_replace(coalesce(first_name, '') || coalesce(last_name, ''), '[^[:alnum:]]', '', 'g')
    )
  ) stored;

create index if not exists icd10_codes_search_norm_trgm_idx    on public.icd10_codes    using gin (search_norm extensions.gin_trgm_ops);
create index if not exists drug_formulary_search_norm_trgm_idx on public.drug_formulary using gin (search_norm extensions.gin_trgm_ops);
create index if not exists products_search_norm_trgm_idx       on public.products       using gin (search_norm extensions.gin_trgm_ops);
create index if not exists services_search_norm_trgm_idx       on public.services       using gin (search_norm extensions.gin_trgm_ops);
create index if not exists persons_search_norm_trgm_idx        on public.persons        using gin (search_norm extensions.gin_trgm_ops);

comment on column public.icd10_codes.search_norm    is 'Normalized search (code | name_ru). Generated; see src/lib/search.ts.';
comment on column public.drug_formulary.search_norm is 'Normalized search (trade_name | inn). Generated; see src/lib/search.ts.';
comment on column public.products.search_norm       is 'Normalized search (name | inn | barcode). Generated; see src/lib/search.ts.';
comment on column public.services.search_norm       is 'Normalized search (name | code). Generated; see src/lib/search.ts.';
comment on column public.persons.search_norm        is 'Normalized search (last+first+middle | first+last). Generated; see src/lib/search.ts.';
