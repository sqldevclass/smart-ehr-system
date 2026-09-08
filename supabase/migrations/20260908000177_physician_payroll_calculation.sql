-- Migration 177: physician payroll calculation + confirmation lock.
--
-- calculate_physician_payroll is a live query -- it reads directly
-- from visit_services/physician_pay_rates every call, for whichever
-- month is asked about. No log table to populate, no backfill step.
-- Nothing exists for a physician/period until a rate was actually
-- in effect (option 1, as decided): no matching rate = 0 for that
-- component, never a retroactive fallback.
--
-- Rate resolution timing differs by type, both using the *same*
-- effective-dating columns from migration 176:
--   - own_service / referral: resolved at each service's own
--     completed_at (per-service, strictly forward from when the
--     rate was saved).
--   - base_pay / department_bucket: resolved at the *start* of the
--     payroll period being calculated. A change saved mid-month
--     doesn't move period_start, so it naturally only shows up
--     starting the following month's calculation -- no separate
--     "effective 1st of next month" logic needed.
--
-- department_bucket revenue uses each physician's CURRENT
-- department (staff_roles.department_id) -- no department history,
-- per instruction.

-- ============================================================
-- 1. Rate resolution helpers
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_effective_flat_rate(
  p_staff_role_id uuid,
  p_pay_rate_type_id uuid,
  p_at timestamptz
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT value
  FROM public.physician_pay_rates
  WHERE staff_role_id = p_staff_role_id
    AND pay_rate_type_id = p_pay_rate_type_id
    AND service_type_id IS NULL
    AND service_id IS NULL
    AND valid_from <= p_at
    AND (valid_to IS NULL OR valid_to > p_at)
  LIMIT 1;
$$;

-- Specificity order: exact service match > service-type match >
-- scope-less default. All three optional -- returns NULL (caller
-- COALESCEs to 0) if nothing was ever configured for this physician.
CREATE OR REPLACE FUNCTION public.get_effective_scoped_rate(
  p_staff_role_id uuid,
  p_pay_rate_type_id uuid,
  p_service_type_id uuid,
  p_service_id uuid,
  p_at timestamptz
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT value
  FROM public.physician_pay_rates
  WHERE staff_role_id = p_staff_role_id
    AND pay_rate_type_id = p_pay_rate_type_id
    AND valid_from <= p_at
    AND (valid_to IS NULL OR valid_to > p_at)
    AND (
      service_id = p_service_id
      OR (service_id IS NULL AND service_type_id = p_service_type_id)
      OR (service_id IS NULL AND service_type_id IS NULL)
    )
  ORDER BY
    CASE
      WHEN service_id = p_service_id THEN 1
      WHEN service_type_id = p_service_type_id THEN 2
      ELSE 3
    END
  LIMIT 1;
$$;

-- ============================================================
-- 2. calculate_physician_payroll -- live calculation, one row
--    per physician in the hospital, for a given calendar month.
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_physician_payroll(
  p_hospital_id uuid,
  p_year int,
  p_month int
)
RETURNS TABLE (
  staff_role_id uuid,
  full_name text,
  base_pay_amount numeric,
  own_service_amount numeric,
  referral_amount numeric,
  department_bucket_amount numeric,
  total_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_base_type_id uuid;
  v_own_type_id uuid;
  v_referral_type_id uuid;
  v_bucket_type_id uuid;
BEGIN
  IF NOT public.has_permission('finance.view_payroll') THEN
    RAISE EXCEPTION 'Not authorized to view payroll';
  END IF;

  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'month must be between 1 and 12';
  END IF;

  v_period_start := make_date(p_year, p_month, 1);
  v_period_end := v_period_start + interval '1 month';

  SELECT id INTO v_base_type_id FROM public.pay_rate_types WHERE code = 'base_pay';
  SELECT id INTO v_own_type_id FROM public.pay_rate_types WHERE code = 'own_service';
  SELECT id INTO v_referral_type_id FROM public.pay_rate_types WHERE code = 'referral';
  SELECT id INTO v_bucket_type_id FROM public.pay_rate_types WHERE code = 'department_bucket';

  RETURN QUERY
  SELECT
    sr.id,
    trim(COALESCE(p.last_name, '') || ' ' || COALESCE(p.first_name, '')),
    COALESCE(public.get_effective_flat_rate(sr.id, v_base_type_id, v_period_start), 0) AS base_pay_amount,
    COALESCE(os.amount, 0) AS own_service_amount,
    COALESCE(rf.amount, 0) AS referral_amount,
    (
      COALESCE(dept_rev.total, 0)
      * COALESCE(public.get_effective_flat_rate(sr.id, v_bucket_type_id, v_period_start), 0)
      / 100
    ) AS department_bucket_amount,
    (
      COALESCE(public.get_effective_flat_rate(sr.id, v_base_type_id, v_period_start), 0)
      + COALESCE(os.amount, 0)
      + COALESCE(rf.amount, 0)
      + (
          COALESCE(dept_rev.total, 0)
          * COALESCE(public.get_effective_flat_rate(sr.id, v_bucket_type_id, v_period_start), 0)
          / 100
        )
    ) AS total_amount
  FROM public.staff_roles sr
  JOIN public.persons p ON p.id = sr.person_id
  LEFT JOIN LATERAL (
    SELECT SUM(
      vs.cost_at_time
      * COALESCE(public.get_effective_scoped_rate(sr.id, v_own_type_id, s.service_type_id, vs.service_id, vs.completed_at), 0)
      / 100
    ) AS amount
    FROM public.visit_services vs
    JOIN public.service_statuses ss ON ss.id = vs.status_id
    JOIN public.services s ON s.id = vs.service_id
    WHERE vs.assigned_staff_role_id = sr.id
      AND ss.code = 'completed'
      AND vs.completed_at >= v_period_start
      AND vs.completed_at < v_period_end
  ) os ON true
  LEFT JOIN LATERAL (
    SELECT SUM(
      vs.cost_at_time
      * COALESCE(public.get_effective_scoped_rate(origin.assigned_staff_role_id, v_referral_type_id, s.service_type_id, vs.service_id, vs.completed_at), 0)
      / 100
    ) AS amount
    FROM public.visit_services vs
    JOIN public.service_statuses ss ON ss.id = vs.status_id
    JOIN public.services s ON s.id = vs.service_id
    JOIN public.visit_services origin ON origin.id = vs.ordered_from_visit_service_id
    WHERE ss.code = 'completed'
      AND vs.completed_at >= v_period_start
      AND vs.completed_at < v_period_end
      AND origin.assigned_staff_role_id = sr.id
  ) rf ON true
  LEFT JOIN LATERAL (
    SELECT SUM(vs2.cost_at_time) AS total
    FROM public.visit_services vs2
    JOIN public.service_statuses ss2 ON ss2.id = vs2.status_id
    JOIN public.staff_roles sr2 ON sr2.id = vs2.assigned_staff_role_id
    WHERE ss2.code = 'completed'
      AND vs2.completed_at >= v_period_start
      AND vs2.completed_at < v_period_end
      AND sr.department_id IS NOT NULL
      AND sr2.department_id = sr.department_id
  ) dept_rev ON true
  WHERE sr.hospital_id = p_hospital_id
    AND sr.role_type = 'physician';
END;
$$;

-- ============================================================
-- 3. Confirmation lock table -- append-only, one row per
--    physician per month. Never updated: once a row exists for
--    a (staff_role_id, year, month), that number is permanent.
-- ============================================================

CREATE TABLE public.payroll_confirmations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id              uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  staff_role_id            uuid NOT NULL REFERENCES public.staff_roles(id) ON DELETE CASCADE,
  year                     int NOT NULL,
  month                    int NOT NULL CHECK (month BETWEEN 1 AND 12),
  base_pay_amount          numeric NOT NULL,
  own_service_amount       numeric NOT NULL,
  referral_amount          numeric NOT NULL,
  department_bucket_amount numeric NOT NULL,
  total_amount             numeric NOT NULL,
  confirmed_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_at             timestamptz NOT NULL DEFAULT now(),

  UNIQUE (staff_role_id, year, month)
);

ALTER TABLE public.payroll_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_confirmations_select" ON public.payroll_confirmations
  FOR SELECT TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('finance.view_payroll')
      OR public.has_permission('finance.manage_pay_rates')
    )
  );
-- No INSERT/UPDATE/DELETE policy -- only confirm_physician_payroll
-- (SECURITY DEFINER, below) can write here, and it only inserts,
-- never updates.

-- ============================================================
-- 4. confirm_physician_payroll -- snapshots the live calculation
--    for a month. ON CONFLICT DO NOTHING: an already-confirmed
--    physician/month is left exactly as it was, no overwrite,
--    ever -- matching "no silent changes."
-- ============================================================

CREATE OR REPLACE FUNCTION public.confirm_physician_payroll(
  p_hospital_id uuid,
  p_year int,
  p_month int
)
RETURNS TABLE (
  staff_role_id uuid,
  total_amount numeric,
  newly_confirmed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission('finance.confirm_payroll') THEN
    RAISE EXCEPTION 'Not authorized to confirm payroll';
  END IF;

  INSERT INTO public.payroll_confirmations (
    hospital_id, staff_role_id, year, month,
    base_pay_amount, own_service_amount, referral_amount, department_bucket_amount, total_amount,
    confirmed_by
  )
  SELECT
    p_hospital_id, calc.staff_role_id, p_year, p_month,
    calc.base_pay_amount, calc.own_service_amount, calc.referral_amount, calc.department_bucket_amount, calc.total_amount,
    auth.uid()
  FROM public.calculate_physician_payroll(p_hospital_id, p_year, p_month) calc
  ON CONFLICT (staff_role_id, year, month) DO NOTHING;

  RETURN QUERY
  SELECT pc.staff_role_id, pc.total_amount, (pc.confirmed_at >= now() - interval '5 seconds')
  FROM public.payroll_confirmations pc
  WHERE pc.hospital_id = p_hospital_id AND pc.year = p_year AND pc.month = p_month;
END;
$$;

-- ============================================================
-- 5. get_physician_payroll -- what the dashboard should actually
--    call for display: confirmed number if locked, live
--    calculation otherwise. This is what guarantees a locked
--    month's number can never silently change later.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_physician_payroll(
  p_hospital_id uuid,
  p_year int,
  p_month int
)
RETURNS TABLE (
  staff_role_id uuid,
  full_name text,
  base_pay_amount numeric,
  own_service_amount numeric,
  referral_amount numeric,
  department_bucket_amount numeric,
  total_amount numeric,
  is_confirmed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission('finance.view_payroll') THEN
    RAISE EXCEPTION 'Not authorized to view payroll';
  END IF;

  RETURN QUERY
  SELECT
    pc.staff_role_id,
    trim(COALESCE(p.last_name, '') || ' ' || COALESCE(p.first_name, '')),
    pc.base_pay_amount, pc.own_service_amount, pc.referral_amount, pc.department_bucket_amount, pc.total_amount,
    true AS is_confirmed
  FROM public.payroll_confirmations pc
  JOIN public.staff_roles sr ON sr.id = pc.staff_role_id
  JOIN public.persons p ON p.id = sr.person_id
  WHERE pc.hospital_id = p_hospital_id AND pc.year = p_year AND pc.month = p_month

  UNION ALL

  SELECT
    live.staff_role_id, live.full_name,
    live.base_pay_amount, live.own_service_amount, live.referral_amount, live.department_bucket_amount, live.total_amount,
    false AS is_confirmed
  FROM public.calculate_physician_payroll(p_hospital_id, p_year, p_month) live
  WHERE NOT EXISTS (
    SELECT 1 FROM public.payroll_confirmations pc2
    WHERE pc2.hospital_id = p_hospital_id AND pc2.year = p_year AND pc2.month = p_month
      AND pc2.staff_role_id = live.staff_role_id
  );
END;
$$;
