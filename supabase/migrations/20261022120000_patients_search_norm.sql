-- Unified patient search: one normalized, generated column covering name (both
-- orders), phone, patient number and DOB (ddmmyyyy + yyyymmdd). Everything except
-- letters/digits is stripped and lowercased; fields are separated by '|' so a
-- search word can never match across two fields. Mirrors normalizeSearch() in
-- src/lib/patientSearch.ts.
--
-- Expand phase: patients.dob_search is kept until the frontend has switched to
-- search_norm; it is dropped in a follow-up migration.

create extension if not exists pg_trgm with schema extensions;

alter table public.patients
  add column if not exists search_norm text
  generated always as (
    lower(
      regexp_replace(coalesce(last_name, '') || coalesce(first_name, '') || coalesce(middle_name, ''), '[^[:alnum:]]', '', 'g') || '|' ||
      regexp_replace(coalesce(first_name, '') || coalesce(last_name, ''), '[^[:alnum:]]', '', 'g') || '|' ||
      regexp_replace(coalesce(phone, ''), '[^[:alnum:]]', '', 'g') || '|' ||
      regexp_replace(coalesce(patient_number, ''), '[^[:alnum:]]', '', 'g') || '|' ||
      coalesce(
        lpad(extract(day from date_of_birth)::int::text, 2, '0') ||
        lpad(extract(month from date_of_birth)::int::text, 2, '0') ||
        extract(year from date_of_birth)::int::text, '') || '|' ||
      coalesce(
        extract(year from date_of_birth)::int::text ||
        lpad(extract(month from date_of_birth)::int::text, 2, '0') ||
        lpad(extract(day from date_of_birth)::int::text, 2, '0'), '')
    )
  ) stored;

comment on column public.patients.search_norm is
  'Normalized search blob (name both orders | phone | patient_number | ddmmyyyy | yyyymmdd). Generated; do not write. See src/lib/patientSearch.ts.';

-- Trigram index: serves ILIKE '%term%' substring search as patient count grows.
create index if not exists patients_search_norm_trgm_idx
  on public.patients using gin (search_norm extensions.gin_trgm_ops);
