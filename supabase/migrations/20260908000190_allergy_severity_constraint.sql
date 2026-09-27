-- Migration 190: patient_allergies.severity CHECK constraint only
-- allowed mild/moderate/severe -- AllergyTab.tsx's severity dropdown
-- added a 4th option (life_threatening / anaphylaxis) without
-- checking this first. Widening the constraint rather than removing
-- the option, since anaphylaxis is a real, clinically distinct
-- severity from plain "severe."

ALTER TABLE public.patient_allergies DROP CONSTRAINT patient_allergies_severity_check;
ALTER TABLE public.patient_allergies ADD CONSTRAINT patient_allergies_severity_check
  CHECK (severity = ANY (ARRAY['mild', 'moderate', 'severe', 'life_threatening']::text[]));
