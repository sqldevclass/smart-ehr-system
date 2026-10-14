-- Fix referral pay calculation: it was keyed off
-- visit_services.ordered_from_visit_service_id, a column that is never
-- actually set anywhere in the app. Neither ordering RPC
-- (physician_order_services / inpatient_order_service) is ever called
-- with a source/origin service id from the frontend -- grepped every
-- caller, confirmed. So referral_amount has always resolved to 0.
--
-- What actually happens when Physician A orders a service that
-- Physician B completes is captured on the SAME visit_services row:
--   - created_by      = the ordering physician's profile (always set
--                        by both ordering RPCs)
--   - assigned_staff_role_id = the physician who completes it
--
-- Referral now = the ordering physician (profiles.staff_role_id where
-- profiles.id = vs.created_by) earns a cut, but ONLY when a different
-- physician actually completed the service (ss.code = 'completed')
-- and someone was in fact assigned (assigned_staff_role_id IS NOT
-- NULL AND <> the ordering physician -- same-physician orders are
-- already paid via Own-Service, not double-counted as a referral).
-- Rate resolution itself (get_effective_scoped_rate, specificity
-- order, as-of-completion-date timing) is unchanged.
--
-- Validated directly against live data before delivery: Babajonov
-- Bunyod (creator of a Urology Consultation completed by Babajanov
-- Brian on 2026-10-13) now correctly shows a non-zero referral amount
-- for October 2026.

-- ============================================================
-- 1. calculate_physician_payroll -- referral lateral rewritten.
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
    -- Referral: the ordering physician (vs.created_by -> profiles.staff_role_id)
    -- earns a cut when a DIFFERENT physician actually completed the service.
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
-- 2. physician_service_pay_items -- referral branch rewritten to
--    match (same column list/order/types as before -- append-safe).
-- ============================================================

CREATE OR REPLACE VIEW public.physician_service_pay_items
WITH (security_invoker = true)
AS
SELECT
  'own_service'::text AS category,
  vs.assigned_staff_role_id AS staff_role_id,
  vs.completed_at,
  s.name AS service_name,
  vs.cost_at_time,
  public.get_effective_scoped_rate(
    vs.assigned_staff_role_id,
    (SELECT id FROM public.pay_rate_types WHERE code = 'own_service'),
    s.service_type_id, vs.service_id, vs.completed_at
  ) AS rate_percent,
  vs.cost_at_time * COALESCE(
    public.get_effective_scoped_rate(
      vs.assigned_staff_role_id,
      (SELECT id FROM public.pay_rate_types WHERE code = 'own_service'),
      s.service_type_id, vs.service_id, vs.completed_at
    ), 0
  ) / 100 AS amount,
  sr.department_id,
  s.service_type_id,
  p.first_name AS patient_first_name,
  p.last_name AS patient_last_name
FROM public.visit_services vs
JOIN public.service_statuses ss ON ss.id = vs.status_id
JOIN public.services s ON s.id = vs.service_id
LEFT JOIN public.staff_roles sr ON sr.id = vs.assigned_staff_role_id
LEFT JOIN public.patients p ON p.id = vs.patient_id
WHERE ss.code = 'completed'
  AND vs.assigned_staff_role_id IS NOT NULL

UNION ALL

SELECT
  'referral'::text AS category,
  creator.staff_role_id AS staff_role_id,
  vs.completed_at,
  s.name AS service_name,
  vs.cost_at_time,
  public.get_effective_scoped_rate(
    creator.staff_role_id,
    (SELECT id FROM public.pay_rate_types WHERE code = 'referral'),
    s.service_type_id, vs.service_id, vs.completed_at
  ) AS rate_percent,
  vs.cost_at_time * COALESCE(
    public.get_effective_scoped_rate(
      creator.staff_role_id,
      (SELECT id FROM public.pay_rate_types WHERE code = 'referral'),
      s.service_type_id, vs.service_id, vs.completed_at
    ), 0
  ) / 100 AS amount,
  creator_sr.department_id,
  s.service_type_id,
  p.first_name AS patient_first_name,
  p.last_name AS patient_last_name
FROM public.visit_services vs
JOIN public.service_statuses ss ON ss.id = vs.status_id
JOIN public.services s ON s.id = vs.service_id
JOIN public.profiles creator ON creator.id = vs.created_by
LEFT JOIN public.staff_roles creator_sr ON creator_sr.id = creator.staff_role_id
LEFT JOIN public.patients p ON p.id = vs.patient_id
WHERE ss.code = 'completed'
  AND creator.staff_role_id IS NOT NULL
  AND vs.assigned_staff_role_id IS NOT NULL
  AND vs.assigned_staff_role_id <> creator.staff_role_id;
