-- Migration 092: Add mix_dose to drug_prescriptions
-- Stores the dose for the mix drug (mix_with_drug_id)

ALTER TABLE public.drug_prescriptions
  ADD COLUMN IF NOT EXISTS mix_dose text;
