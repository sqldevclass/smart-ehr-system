-- Fix for 20261022180000_hospitalization_department_history.sql backfill.
-- Bug: greatest(coalesce(next_at, discharged_at), entered_at) ignores NULLs in
-- Postgres, so the CURRENT stay of every not-discharged hospitalization was
-- backfilled with left_at = entered_at instead of staying open (left_at NULL).
-- Re-open exactly those rows: the latest stay of a hospitalization that has not
-- been discharged and whose left_at equals its entered_at.

update public.hospitalization_department_history x
   set left_at = null
  from public.hospitalizations h
 where h.id = x.hospitalization_id
   and h.discharged_at is null
   and x.left_at = x.entered_at
   and x.entered_at = (
     select max(y.entered_at)
       from public.hospitalization_department_history y
      where y.hospitalization_id = x.hospitalization_id
   )
   and not exists (
     select 1 from public.hospitalization_department_history o
      where o.hospitalization_id = x.hospitalization_id and o.left_at is null
   );
