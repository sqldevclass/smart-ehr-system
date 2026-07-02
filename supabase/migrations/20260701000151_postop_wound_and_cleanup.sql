-- Migration 151: Add postop_wound to nurse_device_monitoring_records,
-- retire wound_monitoring_records (speculative, no approved source
-- document — confirmed replaceable).

-- ============================================================
-- 1. Widen form_type CHECK to include 'postop_wound'.
--    Constraint name discovered dynamically rather than assumed,
--    so this is safe regardless of how Postgres auto-named the
--    inline CHECK from migration 150.
-- ============================================================
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att
    ON att.attrelid = rel.oid
   AND att.attnum = ANY (con.conkey)
  WHERE rel.relname = 'nurse_device_monitoring_records'
    AND con.contype = 'c'
    AND att.attname = 'form_type'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.nurse_device_monitoring_records DROP CONSTRAINT %I',
      v_constraint_name
    );
  END IF;

  ALTER TABLE public.nurse_device_monitoring_records
    ADD CONSTRAINT nurse_device_monitoring_records_form_type_check
    CHECK (form_type IN (
      'cvc', 'tracheostomy', 'ventilator',
      'urinary_catheter', 'postop_wound'
    ));
END $$;

-- ============================================================
-- 2. Retire wound_monitoring_records — speculative table, no
--    approved source document, confirmed replaceable by
--    postop_wound inside nurse_device_monitoring_records.
--    CASCADE clears its RLS policies/indexes automatically.
-- ============================================================
DROP TABLE IF EXISTS public.wound_monitoring_records CASCADE;
