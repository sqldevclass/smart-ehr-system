-- Migration 145: PRN max daily dose column + DB-level enforcement
--
-- Plan section 17.2 requires: "CONSTRAINT on medication_prescriptions:
-- if is_prn = true, then prn_condition IS NOT NULL and
-- prn_max_daily_dose IS NOT NULL — enforced at DB level."
--
-- Current state: drug_prescriptions has prn_condition but no
-- prn_max_daily_dose column at all. The frontend collects a max
-- daily dose value but concatenates it into the free-text notes
-- field instead of a structured column, and there is no DB
-- constraint enforcing either field when prescription_type = 'prn'.
--
-- This migration:
-- 1. Adds prn_max_daily_dose as a real column
-- 2. Backfills it by extracting "Макс. доза: X" from existing
--    notes text where prescription_type = 'prn' (best effort —
--    historical data, frontend will write the column directly
--    going forward)
-- 3. Adds a CHECK constraint enforcing both fields for new/updated
--    PRN rows. Existing rows are backfilled first so the constraint
--    does not fail on rollout.

-- ── 1. Add column ────────────────────────────────────────────
ALTER TABLE public.drug_prescriptions
  ADD COLUMN IF NOT EXISTS prn_max_daily_dose text;

-- ── 2. Backfill from notes for existing PRN rows ────────────
-- Extracts the value after "Макс. доза: " up to the next " | "
-- or end of string. Leaves prn_max_daily_dose NULL if no match
-- (those rows predate the max-dose field entirely).
UPDATE public.drug_prescriptions
SET prn_max_daily_dose = trim(
  substring(notes FROM 'Макс\. доза: ([^|]+)')
)
WHERE prescription_type = 'prn'
  AND prn_max_daily_dose IS NULL
  AND notes ~ 'Макс\. доза: ';

-- For any remaining PRN rows still missing prn_max_daily_dose
-- (no extractable value in notes), set a placeholder so the
-- constraint can be added without breaking historical data.
-- These should be reviewed manually — flagged via the placeholder.
UPDATE public.drug_prescriptions
SET prn_max_daily_dose = 'не указано (исторические данные)'
WHERE prescription_type = 'prn'
  AND prn_max_daily_dose IS NULL;

-- Same treatment for prn_condition — should already be populated,
-- but defensively backfill any historical gaps so the constraint
-- doesn't fail on rollout.
UPDATE public.drug_prescriptions
SET prn_condition = 'не указано (исторические данные)'
WHERE prescription_type = 'prn'
  AND (prn_condition IS NULL OR trim(prn_condition) = '');

-- ── 3. Enforce at DB level going forward ────────────────────
ALTER TABLE public.drug_prescriptions
  ADD CONSTRAINT prn_requires_condition_and_max_dose
  CHECK (
    prescription_type <> 'prn'
    OR (
      prn_condition IS NOT NULL
      AND trim(prn_condition) <> ''
      AND prn_max_daily_dose IS NOT NULL
      AND trim(prn_max_daily_dose) <> ''
    )
  );
