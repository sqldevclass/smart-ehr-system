-- Progressive DOB search ("19" -> "19.03" -> "19.03.1988").
-- A date column can't be prefix-matched, so expose the DOB as dd.mm.yyyy text.
-- Generated + stored: Postgres keeps it in sync; no app code writes it.
-- Built from immutable functions only (to_char is not allowed in generated columns).

alter table public.patients
  add column if not exists dob_search text
  generated always as (
    lpad(extract(day   from date_of_birth)::int::text, 2, '0') || '.' ||
    lpad(extract(month from date_of_birth)::int::text, 2, '0') || '.' ||
    extract(year from date_of_birth)::int::text
  ) stored;

comment on column public.patients.dob_search is
  'date_of_birth as dd.mm.yyyy text for prefix search (patientSearch.ts). Generated; do not write.';
