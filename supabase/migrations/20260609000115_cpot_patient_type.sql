-- Migration 115: Add cpot_patient_type to hospitalizations
-- Persists CPOT patient type selection across sessions

ALTER TABLE public.hospitalizations
  ADD COLUMN IF NOT EXISTS cpot_patient_type text
    CHECK (cpot_patient_type IN ('intubated', 'non_intubated'));
