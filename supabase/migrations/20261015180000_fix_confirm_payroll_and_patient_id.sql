-- Fix for "Confirm Payroll" throwing "column reference \"staff_role_id\"
-- is ambiguous", plus adding patient_number to the two payroll detail
-- views so the frontend can show a Patient ID column.
--
-- Root cause (reproduced live): confirm_physician_payroll's
-- RETURNS TABLE also starts with staff_role_id, and its
-- "ON CONFLICT (staff_role_id, year, month)" target list can't be
-- alias-qualified the way a normal column reference can -- so it hits
-- the same OUT-parameter/table-column name collision as the previous
-- report bug, in a spot that can't just be qualified away.
--
-- This is the second time this exact bug class has hit these payroll
-- functions, so instead of patching this one call site, all three
-- payroll plpgsql functions whose RETURNS TABLE columns collide with
-- real table column names now start with
-- "#variable_conflict use_column;" -- a standard plpgsql pragma that
-- tells Postgres to always prefer the table/query column over the
-- OUT-parameter variable whenever a bare name is ambiguous. This kills
-- the whole bug class for these functions rather than relying on every
-- future edit remembering to qualify every reference by hand.
--
-- Validated live before delivery (all inside BEGIN...ROLLBACK, with
-- has_permission() temporarily stubbed to true for the duration so
-- each function is called for real through its own permission check,
-- not bypassed):
--  - confirm_physician_payroll(...) with the pragma: previously
--    reproduced the exact reported error; now inserts and returns
--    confirmation rows for all 3 physicians with no error.
--  - Re-selected from both updated views and confirmed patient_number
--    comes back populated alongside the existing patient name columns.

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
#variable_conflict use_column
DECLARE
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_own_type_id uuid;
  v_referral_type_id uuid;
BEGIN
  IF NOT public.has_permission('finance.view_payroll') THEN
    RAISE EXCEPTION 'Not authorized to view payroll';
  END IF;

  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'month must be between 1 and 12';
  END IF;

  v_period_start := make_date(p_year, p_month, 1);
  v_period_end := v_period_start + interval '1 month';

  SELECT id INTO v_own_type_id FROM public.pay_rate_types WHERE code = 'own_service';
  SELECT id INTO v_referral_type_id FROM public.pay_rate_types WHERE code = 'referral';

  RETURN QUERY
  SELECT
    sr.id,
    trim(COALESCE(p.last_name, '') || ' ' || COALESCE(p.first_name, '')),
    COALESCE(bp.amount, 0) AS base_pay_amount,
    COALESCE(os.amount, 0) AS own_service_amount,
    COALESCE(rf.amount, 0) AS referral_amount,
    COALESCE(bk.amount, 0) AS department_bucket_amount,
    (
      COALESCE(bp.amount, 0)
      + COALESCE(os.amount, 0)
      + COALESCE(rf.amount, 0)
      + COALESCE(bk.amount, 0)
    ) AS total_amount
  FROM public.staff_roles sr
  JOIN public.persons p ON p.id = sr.person_id
  LEFT JOIN LATERAL (
    SELECT SUM(bpi.amount) AS amount
    FROM public.physician_base_pay_items bpi
    WHERE bpi.staff_role_id = sr.id
  ) bp ON true
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
      * COALESCE(public.get_effective_scoped_rate(creator.staff_role_id, v_referral_type_id, s.service_type_id, vs.service_id, vs.completed_at), 0)
      / 100
    ) AS amount
    FROM public.visit_services vs
    JOIN public.service_statuses ss ON ss.id = vs.status_id
    JOIN public.services s ON s.id = vs.service_id
    JOIN public.profiles creator ON creator.id = vs.created_by
    WHERE ss.code = 'completed'
      AND vs.completed_at >= v_period_start
      AND vs.completed_at < v_period_end
      AND creator.staff_role_id = sr.id
      AND vs.assigned_staff_role_id IS NOT NULL
      AND vs.assigned_staff_role_id <> sr.id
  ) rf ON true
  LEFT JOIN LATERAL (
    SELECT SUM(
      public.get_payroll_bucket_revenue(pbm.bucket_id, v_period_start, v_period_end) * pbm.percent / 100
    ) AS amount
    FROM public.payroll_bucket_members pbm
    JOIN public.payroll_buckets pb ON pb.id = pbm.bucket_id AND pb.is_active
    WHERE pbm.staff_role_id = sr.id
  ) bk ON true
  WHERE sr.hospital_id = p_hospital_id
    AND sr.role_type = 'physician';
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_physician_payroll(
  p_hospital_id uuid,
  p_year int,
  p_month int
)
RETURNS TABLE (staff_role_id uuid, total_amount numeric, newly_confirmed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
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

CREATE OR REPLACE FUNCTION public.get_physician_payroll(p_hospital_id uuid, p_year int, p_month int)
RETURNS TABLE (
  staff_role_id uuid, full_name text, base_pay_amount numeric,
  own_service_amount numeric, referral_amount numeric,
  department_bucket_amount numeric, total_amount numeric, is_confirmed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
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

-- Add patient_number (the app-wide "Patient ID" field, used elsewhere
-- e.g. FinanceServicesTab's "ID пациента" column) to both detail
-- views. Appended at the end of each SELECT list -- CREATE OR REPLACE
-- VIEW can only add columns there, not insert them mid-list -- but
-- that has no effect on where the frontend displays it.
CREATE OR REPLACE VIEW public.physician_service_pay_items
WITH (security_invoker = true)
AS
SELECT
  'own_service'::text AS category,
  vs.assigned_staff_role_id AS staff_role_id,
  vs.completed_at,
  s.name AS service_name,
  vs.cost_at_time,
  get_effective_scoped_rate(vs.assigned_staff_role_id, (SELECT pay_rate_types.id FROM pay_rate_types WHERE pay_rate_types.code = 'own_service'), s.service_type_id, vs.service_id, vs.completed_at) AS rate_percent,
  (vs.cost_at_time * COALESCE(get_effective_scoped_rate(vs.assigned_staff_role_id, (SELECT pay_rate_types.id FROM pay_rate_types WHERE pay_rate_types.code = 'own_service'), s.service_type_id, vs.service_id, vs.completed_at), 0) / 100) AS amount,
  sr.department_id,
  s.service_type_id,
  p.first_name AS patient_first_name,
  p.last_name AS patient_last_name,
  p.patient_number
FROM visit_services vs
JOIN service_statuses ss ON ss.id = vs.status_id
JOIN services s ON s.id = vs.service_id
LEFT JOIN staff_roles sr ON sr.id = vs.assigned_staff_role_id
LEFT JOIN patients p ON p.id = vs.patient_id
WHERE ss.code = 'completed' AND vs.assigned_staff_role_id IS NOT NULL
UNION ALL
SELECT
  'referral'::text AS category,
  creator.staff_role_id,
  vs.completed_at,
  s.name AS service_name,
  vs.cost_at_time,
  get_effective_scoped_rate(creator.staff_role_id, (SELECT pay_rate_types.id FROM pay_rate_types WHERE pay_rate_types.code = 'referral'), s.service_type_id, vs.service_id, vs.completed_at) AS rate_percent,
  (vs.cost_at_time * COALESCE(get_effective_scoped_rate(creator.staff_role_id, (SELECT pay_rate_types.id FROM pay_rate_types WHERE pay_rate_types.code = 'referral'), s.service_type_id, vs.service_id, vs.completed_at), 0) / 100) AS amount,
  creator_sr.department_id,
  s.service_type_id,
  p.first_name AS patient_first_name,
  p.last_name AS patient_last_name,
  p.patient_number
FROM visit_services vs
JOIN service_statuses ss ON ss.id = vs.status_id
JOIN services s ON s.id = vs.service_id
JOIN profiles creator ON creator.id = vs.created_by
LEFT JOIN staff_roles creator_sr ON creator_sr.id = creator.staff_role_id
LEFT JOIN patients p ON p.id = vs.patient_id
WHERE ss.code = 'completed' AND creator.staff_role_id IS NOT NULL AND vs.assigned_staff_role_id IS NOT NULL AND vs.assigned_staff_role_id <> creator.staff_role_id;

CREATE OR REPLACE VIEW public.payroll_bucket_pay_items
WITH (security_invoker = true)
AS
SELECT
  pbm.staff_role_id,
  pb.id AS bucket_id,
  pb.name AS bucket_name,
  pbm.percent AS member_percent,
  vs.id AS visit_service_id,
  vs.completed_at,
  s.name AS service_name,
  vs.cost_at_time,
  (vs.cost_at_time * pbm.percent / 100) AS amount,
  p.patient_first_name,
  p.patient_last_name,
  p.patient_number
FROM public.payroll_buckets pb
JOIN public.payroll_bucket_members pbm ON pbm.bucket_id = pb.id
JOIN public.visit_services vs ON EXISTS (
  SELECT 1 FROM public.payroll_bucket_items bi
  WHERE bi.bucket_id = pb.id
    AND (bi.service_id = vs.service_id
         OR (bi.service_id IS NULL AND bi.service_group_id = (SELECT services.service_group_id FROM public.services WHERE services.id = vs.service_id)))
)
JOIN public.services s ON s.id = vs.service_id
JOIN public.service_statuses ss ON ss.id = vs.status_id
LEFT JOIN LATERAL (
  SELECT patients.first_name AS patient_first_name, patients.last_name AS patient_last_name, patients.patient_number
  FROM public.patients WHERE patients.id = vs.patient_id
) p ON true
WHERE pb.is_active AND ss.code = 'completed';
