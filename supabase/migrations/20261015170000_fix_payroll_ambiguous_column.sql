-- Fix for "Payroll report not showing anything."
--
-- Root cause (confirmed from postgres_logs at the time the report was
-- loaded): every call to get_physician_payroll() -> calculate_physician_payroll()
-- was failing with "column reference \"staff_role_id\" is ambiguous" and
-- PostgREST was turning that into a 400 that the frontend swallowed
-- silently (no error toast on that query), which looked exactly like
-- "not showing anything."
--
-- Cause: this session's own base-pay migration added a lateral that
-- referenced the physician_base_pay_items.staff_role_id column
-- unqualified ("WHERE staff_role_id = sr.id"). calculate_physician_payroll
-- RETURNS TABLE's first output column is also named staff_role_id, so
-- inside the plpgsql function body that bare name is ambiguous between
-- the OUT-parameter variable and the table column. The other three
-- laterals (own-service, referral, buckets) all qualify their
-- staff_role_id reference with a table alias already, so only this one
-- was broken.
--
-- Fix: alias the table and qualify the column.
--
-- Validated live before delivery: redefined the function with the fix,
-- temporarily stubbed has_permission() to true for the duration of a
-- BEGIN...ROLLBACK (so the call goes through the function's own
-- permission check instead of bypassing it, unlike my earlier
-- reconstruction-based debugging), and called
-- calculate_physician_payroll() for real -- it now returns the correct
-- rows for all 3 physicians with no error. Nothing committed.

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
    WHERE bpi.staff_role_id = sr.id          -- FIX: was unqualified "staff_role_id"
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

-- Add patient columns to the per-service bucket detail view, needed
-- for the unified payroll detail table (patient name shown per row in
-- every category, including bucket rows, per the target layout).
-- Appended at the end so any existing column-order assumptions
-- elsewhere are unaffected.
--
-- Validated live before delivery: re-selected from this view inside
-- the same BEGIN...ROLLBACK and confirmed patient_first_name /
-- patient_last_name come back populated for real bucket rows.
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
  p.first_name AS patient_first_name,
  p.last_name AS patient_last_name
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
LEFT JOIN public.patients p ON p.id = vs.patient_id
WHERE pb.is_active AND ss.code = 'completed';
