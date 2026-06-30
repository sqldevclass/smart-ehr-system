-- Migration 148: Medication administration reminder config
--
-- Phase 9 gap closure (final item). The plan calls for a blinking
-- reminder N minutes before a scheduled medication dose is due.
-- hospital_settings.queue_reminder_minutes already exists but is
-- unrelated — it is for the outpatient queue display feature and
-- has zero medication-related usage anywhere in the codebase.
-- Reusing it would silently couple two unrelated features.
--
-- This adds a dedicated column for medication dose reminders.

ALTER TABLE public.hospital_settings
  ADD COLUMN IF NOT EXISTS medication_reminder_minutes int DEFAULT 10;
