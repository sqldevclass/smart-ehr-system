-- Base Pay: replace the single flat amount with multiple named line
-- items (amount + free-text description) that sum to the
-- physician's total base pay.
--
-- physician_pay_rates enforces exactly one active row per scope per
-- physician (physician_pay_rates_active_scope_unique), so it cannot
-- hold several simultaneous base-pay values without abusing the
-- service-scope columns as a fake item id. A dedicated table is the
-- right shape for "a list of named stipends", same reasoning as why
-- Buckets got its own tables rather than overloading
-- physician_pay_rates. Current-state only (no effective-dating),
-- matching the Buckets precedent: items are added/edited/removed
-- directly, and an already-confirmed month's locked amount
-- (payroll_confirmations) is unaffected by later edits.
--
-- Existing flat base_pay values are backfilled as a single "Base
-- Pay" item per physician so no one's payroll drops to zero on
-- deploy. The old physician_pay_rates base_pay rows are left in
-- place as harmless history; nothing reads them anymore after this
-- migration.
--
-- Validated live before delivery: backfilled both real physicians
-- with existing base pay (1200, 1000) into the new table correctly,
-- then added a second scratch item (300) to one of them and
-- confirmed the summed base_pay_amount came out to 1500 -- all
-- inside BEGIN...ROLLBACK, nothing committed.

CREATE TABLE public.physician_base_pay_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id),
  staff_role_id uuid NOT NULL REFERENCES public.staff_roles(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount >= 0),
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.physician_base_pay_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY physician_base_pay_items_select ON public.physician_base_pay_items
  FOR SELECT
  USING (
    hospital_id = public.get_my_hospital_id()
    AND (public.has_permission('finance.view_payroll') OR public.has_permission('finance.manage_pay_rates'))
  );

CREATE OR REPLACE FUNCTION public.add_base_pay_item(p_staff_role_id uuid, p_amount numeric, p_description text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hospital_id uuid;
  v_id uuid;
BEGIN
  IF NOT public.has_permission('finance.manage_pay_rates') THEN
    RAISE EXCEPTION 'Not authorized to manage pay rates';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'Amount cannot be negative';
  END IF;

  SELECT hospital_id INTO v_hospital_id FROM public.staff_roles WHERE id = p_staff_role_id;
  IF v_hospital_id IS NULL THEN
    RAISE EXCEPTION 'staff_role % not found', p_staff_role_id;
  END IF;

  INSERT INTO public.physician_base_pay_items (hospital_id, staff_role_id, amount, description, created_by)
  VALUES (v_hospital_id, p_staff_role_id, p_amount, p_description, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_base_pay_item(p_item_id uuid, p_amount numeric, p_description text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission('finance.manage_pay_rates') THEN
    RAISE EXCEPTION 'Not authorized to manage pay rates';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'Amount cannot be negative';
  END IF;

  UPDATE public.physician_base_pay_items
  SET amount = p_amount, description = p_description
  WHERE id = p_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_base_pay_item(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission('finance.manage_pay_rates') THEN
    RAISE EXCEPTION 'Not authorized to manage pay rates';
  END IF;

  DELETE FROM public.physician_base_pay_items WHERE id = p_item_id;
END;
$$;

-- Backfill: one item per physician's existing flat base_pay value.
INSERT INTO public.physician_base_pay_items (hospital_id, staff_role_id, amount, description)
SELECT pr.hospital_id, pr.staff_role_id, pr.value, 'Base Pay'
FROM public.physician_pay_rates pr
JOIN public.pay_rate_types prt ON prt.id = pr.pay_rate_type_id
WHERE prt.code = 'base_pay' AND pr.valid_to IS NULL;

-- calculate_physician_payroll: base_pay_amount now sums
-- physician_base_pay_items instead of the old flat-rate lookup.
-- Own-Service, Referral and Bucket laterals are unchanged.
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
    SELECT SUM(amount) AS amount
    FROM public.physician_base_pay_items
    WHERE staff_role_id = sr.id
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
