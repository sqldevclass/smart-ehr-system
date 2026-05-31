-- Migration 079: Add pain_character and pain_location
-- to pain_scale_readings

ALTER TABLE public.pain_scale_readings
  ADD COLUMN IF NOT EXISTS pain_character
    text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pain_location
    text;
