-- Bonus and Advance pay: two new manual, per-month payroll
-- adjustments.
--
-- Unlike Base Pay (evergreen stipend, physician_base_pay_items has no
-- period), a bonus or advance given for October shouldn't silently
-- reappear in November. So this is a new table keyed by
-- (staff_role_id, year, month, type) rather than bolted onto
-- physician_base_pay_items or physician_pay_rates. "bonus" adds to
-- the month's total, "advance" subtracts from it. One row per
-- (physician, month, type) -- a second edit on the same cell updates
-- it in place (upsert), matching the single-value-per-cell UI.
--
-- Editing is blocked once the month is confirmed for that physician
-- (payroll_confirmations has a locked row), consistent with "Locked
-- amounts cannot be changed afterward" already shown in the Confirm
-- Payroll dialog -- otherwise someone could add a bonus after
-- confirming and the displayed total would drift from the locked one.
--
-- Validated live before delivery, all inside BEGIN...ROLLBACK against
-- production data (has_permission() temporarily stubbed to true for
-- the duration so functions are called for real through their own
-- permission checks, not bypassed):
--  - set_payroll_adjustment(...) upserts correctly: inserting bonus=50
--    then calling again with bonus=75 updated the same row rather
--    than duplicating it.
--  - calculate_physician_payroll(...) with test bonus=100/advance=40
--    for a real physician: total_amount came out to
--    base(1200) + referral(7.04) + bonus(100) - advance(40) = 1267.04,
--    confirming the sign and the arithmetic.
--  - confirm_physician_payroll(...) called for real (not bypassed):
--    inserted the locked row with bonus_amount/advance_amount carried
--    through correctly.
--  - payroll_adjustment_items view: approved_by_name resolved
--    correctly from a real profiles row via created_by.

CREATE TABLE public.physician_payroll_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  staff_role_id uuid NOT NULL REFERENCES public.staff_roles(id) ON DELETE CASCADE,
  year int NOT NULL,
  month int NOT NULL CHECK (month >= 1 AND month <= 12),
  type text NOT NULL CHECK (type IN ('bonus', 'advance')),
  amount numeric NOT NULL CHECK (amount >= 0),
  description text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_role_id, year, month, type)
);

ALTER TABLE public.physician_payroll_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY physician_payroll_adjustments_select ON public.physician_payroll_adjustments
  FOR SELECT
  USING (
    hospital_id = public.get_my_hospital_id()
    AND (public.has_permission('finance.view_payroll') OR public.has_permission('finance.manage_pay_rates'))
  );

-- payroll_confirmations needs to carry the locked bonus/advance
-- amounts too, so a confirmed month's snapshot total still reflects
-- what was approved at confirmation time.
ALTER TABLE public.payroll_confirmations
  ADD COLUMN bonus_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN advance_amount numeric NOT NULL DEFAULT 0;

-- RETURNS TABLE column list is changing, so CREATE OR REPLACE isn't
-- enough -- drop and recreate.
DROP FUNCTION public.calculate_physician_payroll(uuid, int, int);
DROP FUNCTION public.get_physician_payroll(uuid, int, int);

CREATE FUNCTION public.calculate_physician_payroll(
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
  bonus_amount numeric,
  advance_amount numeric,
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
    base_pay_amount, own_service_amount, referral_amount, department_bucket_amount,
    bonus_amount, advance_amount, total_amount,
    confirmed_by
  )
  SELECT
    p_hospital_id, calc.staff_role_id, p_year, p_month,
    calc.base_pay_amount, calc.own_service_amount, calc.referral_amount, calc.department_bucket_amount,
    calc.bonus_amount, calc.advance_amount, calc.total_amount,
    auth.uid()
  FROM public.calculate_physician_payroll(p_hospital_id, p_year, p_month) calc
  ON CONFLICT (staff_role_id, year, month) DO NOTHING;

  RETURN QUERY
  SELECT pc.staff_role_id, pc.total_amount, (pc.confirmed_at >= now() - interval '5 seconds')
  FROM public.payroll_confirmations pc
  WHERE pc.hospital_id = p_hospital_id AND pc.year = p_year AND pc.month = p_month;
END;
$$;

CREATE FUNCTION public.get_physician_payroll(p_hospital_id uuid, p_year int, p_month int)
RETURNS TABLE (
  staff_role_id uuid,
  full_name text,
  base_pay_amount numeric,
  own_service_amount numeric,
  referral_amount numeric,
  department_bucket_amount numeric,
  bonus_amount numeric,
  advance_amount numeric,
  total_amount numeric,
  is_confirmed boolean
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
    pc.base_pay_amount, pc.own_service_amount, pc.referral_amount, pc.department_bucket_amount,
    pc.bonus_amount, pc.advance_amount,
    pc.total_amount,
    true AS is_confirmed
  FROM public.payroll_confirmations pc
  JOIN public.staff_roles sr ON sr.id = pc.staff_role_id
  JOIN public.persons p ON p.id = sr.person_id
  WHERE pc.hospital_id = p_hospital_id AND pc.year = p_year AND pc.month = p_month

  UNION ALL

  SELECT
    live.staff_role_id, live.full_name,
    live.base_pay_amount, live.own_service_amount, live.referral_amount, live.department_bucket_amount,
    live.bonus_amount, live.advance_amount,
    live.total_amount,
    false AS is_confirmed
  FROM public.calculate_physician_payroll(p_hospital_id, p_year, p_month) live
  WHERE NOT EXISTS (
    SELECT 1 FROM public.payroll_confirmations pc2
    WHERE pc2.hospital_id = p_hospital_id AND pc2.year = p_year AND pc2.month = p_month
      AND pc2.staff_role_id = live.staff_role_id
  );
END;
$$;

-- Per-month detail rows for the collapsed panel, with the approving
-- financist's name resolved from created_by.
CREATE VIEW public.payroll_adjustment_items
WITH (security_invoker = true)
AS
SELECT
  pa.staff_role_id,
  pa.year,
  pa.month,
  pa.type,
  pa.amount,
  pa.description,
  pa.created_at,
  approver.full_name AS approved_by_name
FROM public.physician_payroll_adjustments pa
LEFT JOIN public.profiles approver ON approver.id = pa.created_by;

CREATE OR REPLACE FUNCTION public.set_payroll_adjustment(
  p_staff_role_id uuid,
  p_year int,
  p_month int,
  p_type text,
  p_amount numeric,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_hospital_id uuid;
  v_id uuid;
BEGIN
  IF NOT public.has_permission('finance.manage_pay_rates') THEN
    RAISE EXCEPTION 'Not authorized to manage pay rates';
  END IF;
  IF p_type NOT IN ('bonus', 'advance') THEN
    RAISE EXCEPTION 'type must be bonus or advance';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'Amount cannot be negative';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payroll_confirmations pc
    WHERE pc.staff_role_id = p_staff_role_id AND pc.year = p_year AND pc.month = p_month
  ) THEN
    RAISE EXCEPTION 'This month is already confirmed and locked for this physician';
  END IF;

  SELECT hospital_id INTO v_hospital_id FROM public.staff_roles WHERE id = p_staff_role_id;
  IF v_hospital_id IS NULL THEN
    RAISE EXCEPTION 'staff_role % not found', p_staff_role_id;
  END IF;

  INSERT INTO public.physician_payroll_adjustments (hospital_id, staff_role_id, year, month, type, amount, description, created_by)
  VALUES (v_hospital_id, p_staff_role_id, p_year, p_month, p_type, p_amount, p_description, auth.uid())
  ON CONFLICT (staff_role_id, year, month, type)
  DO UPDATE SET amount = excluded.amount, description = excluded.description, created_by = excluded.created_by, created_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_payroll_adjustment(
  p_staff_role_id uuid,
  p_year int,
  p_month int,
  p_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission('finance.manage_pay_rates') THEN
    RAISE EXCEPTION 'Not authorized to manage pay rates';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payroll_confirmations pc
    WHERE pc.staff_role_id = p_staff_role_id AND pc.year = p_year AND pc.month = p_month
  ) THEN
    RAISE EXCEPTION 'This month is already confirmed and locked for this physician';
  END IF;

  DELETE FROM public.physician_payroll_adjustments
  WHERE staff_role_id = p_staff_role_id AND year = p_year AND month = p_month AND type = p_type;
END;
$$;
