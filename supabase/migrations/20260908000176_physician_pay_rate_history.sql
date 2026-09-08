-- Migration 176: effective-dated physician pay rates.
--
-- Root problem: physician_pay_rates was overwrite-in-place. A rate
-- change destroyed the old value, so payroll calculated after the
-- fact for a prior period would apply today's rate to that period's
-- completed services -- wrong, and then permanently frozen wrong
-- once locked (migration 177). Rates now change strictly forward
-- from the moment they're saved (old row closed, new row opened),
-- so a point-in-time lookup by a service's completed_at always
-- finds the rate that was actually in effect.
--
-- All writes move from raw INSERT/UPDATE/DELETE to two atomic
-- SECURITY DEFINER RPCs, since "close old row + open new row" is
-- exactly the kind of multi-step transition the project's standards
-- say must not live as separate frontend calls.

-- ============================================================
-- 1. Add effective-dating columns
-- ============================================================

ALTER TABLE public.physician_pay_rates
  ADD COLUMN valid_from timestamptz,
  ADD COLUMN valid_to timestamptz;

-- Backfill existing rows: they've been in effect since creation.
UPDATE public.physician_pay_rates
SET valid_from = created_at
WHERE valid_from IS NULL;

ALTER TABLE public.physician_pay_rates
  ALTER COLUMN valid_from SET NOT NULL,
  ALTER COLUMN valid_from SET DEFAULT now(),
  ADD CONSTRAINT physician_pay_rates_valid_range CHECK (valid_to IS NULL OR valid_to > valid_from);

-- ============================================================
-- 2. Replace the scope-uniqueness index: uniqueness now only
--    applies among currently-active rows (valid_to IS NULL).
--    History can have any number of closed-out rows per scope.
-- ============================================================

DROP INDEX IF EXISTS public.physician_pay_rates_scope_unique;

CREATE UNIQUE INDEX physician_pay_rates_active_scope_unique
  ON public.physician_pay_rates (
    staff_role_id,
    pay_rate_type_id,
    COALESCE(service_type_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(service_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE (valid_to IS NULL);

CREATE INDEX physician_pay_rates_lookup_idx
  ON public.physician_pay_rates (staff_role_id, pay_rate_type_id, valid_from, valid_to);

-- ============================================================
-- 3. Lock down direct writes -- all changes now go through the
--    RPCs below. SELECT policy is unchanged.
-- ============================================================

DROP POLICY IF EXISTS "physician_pay_rates_insert" ON public.physician_pay_rates;
DROP POLICY IF EXISTS "physician_pay_rates_update" ON public.physician_pay_rates;
DROP POLICY IF EXISTS "physician_pay_rates_delete" ON public.physician_pay_rates;

-- ============================================================
-- 4. set_physician_pay_rate: create or forward-change a rate.
--    Closes any currently-active row for the same scope, then
--    opens a new one effective now(). Atomic: both steps happen
--    in one transaction, so a reader never sees zero active rows
--    for a scope that's mid-change, nor two.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_physician_pay_rate(
  p_staff_role_id uuid,
  p_pay_rate_type_id uuid,
  p_value numeric,
  p_service_type_id uuid DEFAULT NULL,
  p_service_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hospital_id uuid;
  v_new_id uuid;
BEGIN
  IF NOT public.has_permission('finance.manage_pay_rates') THEN
    RAISE EXCEPTION 'Not authorized to manage pay rates';
  END IF;

  IF p_value < 0 THEN
    RAISE EXCEPTION 'Rate value cannot be negative';
  END IF;

  SELECT hospital_id INTO v_hospital_id
  FROM public.staff_roles
  WHERE id = p_staff_role_id;

  IF v_hospital_id IS NULL THEN
    RAISE EXCEPTION 'staff_role % not found', p_staff_role_id;
  END IF;

  UPDATE public.physician_pay_rates
  SET valid_to = now()
  WHERE staff_role_id = p_staff_role_id
    AND pay_rate_type_id = p_pay_rate_type_id
    AND service_type_id IS NOT DISTINCT FROM p_service_type_id
    AND service_id IS NOT DISTINCT FROM p_service_id
    AND valid_to IS NULL;

  INSERT INTO public.physician_pay_rates (
    hospital_id, staff_role_id, pay_rate_type_id,
    service_type_id, service_id, value,
    valid_from, valid_to, created_by
  ) VALUES (
    v_hospital_id, p_staff_role_id, p_pay_rate_type_id,
    p_service_type_id, p_service_id, p_value,
    now(), NULL, auth.uid()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- ============================================================
-- 5. end_physician_pay_rate: close a rate with no replacement
--    (e.g. removing a scoped own-service/referral rate entirely).
--    Never a hard delete -- the closed row stays as history so
--    past completed services still resolve to the rate that was
--    actually in effect for them.
-- ============================================================

CREATE OR REPLACE FUNCTION public.end_physician_pay_rate(
  p_rate_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_permission('finance.manage_pay_rates') THEN
    RAISE EXCEPTION 'Not authorized to manage pay rates';
  END IF;

  UPDATE public.physician_pay_rates
  SET valid_to = now()
  WHERE id = p_rate_id
    AND valid_to IS NULL
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Rate % not found or already ended', p_rate_id;
  END IF;

  RETURN v_id;
END;
$$;
