-- Migration 059: Remove hospitalization_id from visits
-- visits and hospitalizations are separate entities linked
-- only through patient_id. visits does not need to reference
-- hospitalizations directly.

ALTER TABLE public.visits
  DROP COLUMN IF EXISTS hospitalization_id;