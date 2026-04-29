-- Migration 021: Add timezone to hospital_settings
-- Stores the clinic's local timezone for correct time display and conversion
-- Default: Asia/Tashkent (UTC+5)

ALTER TABLE public.hospital_settings
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Asia/Tashkent';

UPDATE public.hospital_settings
SET timezone = 'Asia/Tashkent'
WHERE timezone IS NULL;