-- Migration 083: Add reaction column to patient_allergies
-- Stores the clinical reaction description
-- e.g. анафилаксия, крапивница, отёк Квинке

ALTER TABLE public.patient_allergies
  ADD COLUMN IF NOT EXISTS reaction text;
