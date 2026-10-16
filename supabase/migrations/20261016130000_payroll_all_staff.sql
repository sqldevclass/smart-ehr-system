-- Extend payroll calculation to every active staff role, not just
-- physicians, so pay rates configured for any employee (via the now
-- broadened Pay Rates page) actually flow through to Payroll.
--
-- confirm_physician_payroll and get_physician_payroll already have no
-- role_type filter of their own -- they call calculate_physician_payroll,
-- so this single change is sufficient to cover both.

CREATE OR REPLACE FUNCTION public.calculate_physician_payroll(p_hospital_id uuid, p_year integer, p_month integer)
 RETURNS TABLE(staff_role_id uuid, full_name text, base_pay_amount numeric, own_service_amount numeric, referral_amount numeric, department_bucket_amount numeric, bonus_amount numeric, advance_amount numeric, total_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    COALESCE(bn.amount, 0) AS bonus_amount,
    COALESCE(adv.amount, 0) AS advance_amount,
    (
      COALESCE(bp.amount, 0)
      + COALESCE(os.amount, 0)
      + COALESCE(rf.amount, 0)
      + COALESCE(bk.amount, 0)
      + COALESCE(bn.amount, 0)
      - COALESCE(adv.amount, 0)
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
  LEFT JOIN LATERAL (
    SELECT SUM(pa.amount) AS amount
    FROM public.physician_payroll_adjustments pa
    WHERE pa.staff_role_id = sr.id AND pa.year = p_year AND pa.month = p_month AND pa.type = 'bonus'
  ) bn ON true
  LEFT JOIN LATERAL (
    SELECT SUM(pa.amount) AS amount
    FROM public.physician_payroll_adjustments pa
    WHERE pa.staff_role_id = sr.id AND pa.year = p_year AND pa.month = p_month AND pa.type = 'advance'
  ) adv ON true
  WHERE sr.hospital_id = p_hospital_id;
END;
$function$;
