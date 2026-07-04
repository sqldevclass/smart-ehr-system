-- Migration 153: Support per-occurrence cancellation for Уход
-- (care) order occurrences. Mirrors drug_administration_slots'
-- three-state pattern (scheduled/administered/skipped) — adds
-- 'cancelled' alongside the existing pending/done, plus
-- cancelled_at/cancelled_by, same convention as the parent
-- hospitalization_orders table already uses.

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
  WHERE rel.relname = 'hospitalization_order_occurrences'
    AND con.contype = 'c'
    AND att.attname = 'status'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.hospitalization_order_occurrences DROP CONSTRAINT %I',
      v_constraint_name
    );
  END IF;

  ALTER TABLE public.hospitalization_order_occurrences
    ADD CONSTRAINT hospitalization_order_occurrences_status_check
    CHECK (status IN ('pending', 'done', 'cancelled'));
END $$;

ALTER TABLE public.hospitalization_order_occurrences
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancelled_by uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL;
