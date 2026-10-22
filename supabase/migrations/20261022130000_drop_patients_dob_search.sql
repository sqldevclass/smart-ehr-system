-- Contract phase: patients.dob_search was replaced by patients.search_norm
-- (20261022120000). The frontend no longer references it; no views or
-- functions depend on it.

alter table public.patients drop column if exists dob_search;
