-- Stage 1 of 4 (Buckets feature): schema + calc engine.
--
-- Replaces the old flat "Department Bucket (%)" model (one % per
-- physician, applied to his whole department's revenue) with a
-- standalone Bucket entity:
--   - a bucket has a name, an overall target %, a list of
--     services/service-groups that define its revenue pool, and a
--     roster of member doctors each with their own % (the sum of
--     members' % may not exceed the bucket's %)
--   - bucket revenue for a period = sum of cost_at_time for every
--     completed service matching the bucket's service/group list
--   - each member's payout = bucket revenue (for the period) x the
--     member's OWN % (not a share of the bucket's %)
--   - current-state only: no effective-dating/history on bucket
--     config (confirmed with user) -- changing a bucket's
--     scope/members/percent today recalculates every month,
--     including past ones
--   - a doctor can belong to multiple buckets; the same service can
--     belong to multiple buckets (independently counted in each,
--     INTENTIONAL per user: "both are true")
--
-- Base Pay, Own-Service and Referral are untouched by this
-- migration. The RETURNS TABLE column `department_bucket_amount` on
-- calculate_physician_payroll is deliberately KEPT (not renamed) so
-- the old, still-in-use /finance/payroll page (PayrollDashboardPage
-- + get_physician_payroll/confirm_physician_payroll, which call this
-- function) and payroll_confirmations.department_bucket_amount
-- continue to work unchanged.
--
-- Validated live against this hospital's real Oct 2026 data before
-- delivery: a scratch 40% bucket scoped to "Urology Consultation"
-- with two members (25%, 15%) against 5 completed services of
-- 8.80 each (total 44.00) produced bucket amounts of 11.00 and 6.60
-- respectively (44.00 x 25% and 44.00 x 15%) via both
-- get_payroll_bucket_revenue and the rewritten
-- calculate_physician_payroll, and the detail view returned the
-- correct 5 (not 10) rows with no double-counting even when a
-- bucket was deliberately given both a direct service item and an
-- overlapping service-group item for the same service.

-- ============================================================
-- 1. Tables
-- ============================================================

CREATE TABLE public.payroll_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id),
  name text NOT NULL,
  percent numeric NOT NULL CHECK (percent >= 0 AND percent <= 100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY payroll_buckets_select ON public.payroll_buckets
  FOR SELECT
  USING (
    hospital_id = public.get_my_hospital_id()
    AND (public.has_permission('finance.view_payroll') OR public.has_permission('finance.manage_pay_rates'))
  );

CREATE TABLE public.payroll_bucket_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id uuid NOT NULL REFERENCES public.payroll_buckets(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
  service_group_id uuid REFERENCES public.service_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((service_id IS NULL) <> (service_group_id IS NULL))
);

CREATE UNIQUE INDEX payroll_bucket_items_service_uq ON public.payroll_bucket_items(bucket_id, service_id) WHERE service_id IS NOT NULL;
CREATE UNIQUE INDEX payroll_bucket_items_group_uq ON public.payroll_bucket_items(bucket_id, service_group_id) WHERE service_group_id IS NOT NULL;

ALTER TABLE public.payroll_bucket_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY payroll_bucket_items_select ON public.payroll_bucket_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.payroll_buckets pb
      WHERE pb.id = payroll_bucket_items.bucket_id
        AND pb.hospital_id = public.get_my_hospital_id()
        AND (public.has_permission('finance.view_payroll') OR public.has_permission('finance.manage_pay_rates'))
    )
  );

CREATE TABLE public.payroll_bucket_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id uuid NOT NULL REFERENCES public.payroll_buckets(id) ON DELETE CASCADE,
  staff_role_id uuid NOT NULL REFERENCES public.staff_roles(id) ON DELETE CASCADE,
  percent numeric NOT NULL CHECK (percent >= 0 AND percent <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, staff_role_id)
);

ALTER TABLE public.payroll_bucket_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY payroll_bucket_members_select ON public.payroll_bucket_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.payroll_buckets pb
      WHERE pb.id = payroll_bucket_members.bucket_id
        AND pb.hospital_id = public.get_my_hospital_id()
        AND (public.has_permission('finance.view_payroll') OR public.has_permission('finance.manage_pay_rates'))
    )
  );

-- ============================================================
-- 2. Management RPCs (same SECURITY DEFINER / permission-gated /
--    end-then-insert-where-applicable pattern as set_physician_pay_rate)
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_payroll_bucket(p_hospital_id uuid, p_name text, p_percent numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_permission('finance.manage_pay_rates') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF trim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'Bucket name is required';
  END IF;
  IF p_percent IS NULL OR p_percent < 0 OR p_percent > 100 THEN
    RAISE EXCEPTION 'Percent must be between 0 and 100';
  END IF;

  INSERT INTO public.payroll_buckets (hospital_id, name, percent)
  VALUES (p_hospital_id, trim(p_name), p_percent)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_payroll_bucket(p_bucket_id uuid, p_name text, p_percent numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_members_total numeric;
BEGIN
  IF NOT public.has_permission('finance.manage_pay_rates') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF trim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'Bucket name is required';
  END IF;
  IF p_percent IS NULL OR p_percent < 0 OR p_percent > 100 THEN
    RAISE EXCEPTION 'Percent must be between 0 and 100';
  END IF;

  SELECT COALESCE(SUM(percent), 0) INTO v_members_total
  FROM public.payroll_bucket_members
  WHERE bucket_id = p_bucket_id;

  IF v_members_total > p_percent THEN
    RAISE EXCEPTION 'Cannot set bucket percent below current members'' total (%)', v_members_total;
  END IF;

  UPDATE public.payroll_buckets
  SET name = trim(p_name), percent = p_percent, updated_at = now()
  WHERE id = p_bucket_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_payroll_bucket_active(p_bucket_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission('finance.manage_pay_rates') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.payroll_buckets
  SET is_active = p_is_active, updated_at = now()
  WHERE id = p_bucket_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_bucket_item(p_bucket_id uuid, p_service_id uuid DEFAULT NULL, p_service_group_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_exists boolean;
BEGIN
  IF NOT public.has_permission('finance.manage_pay_rates') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF (p_service_id IS NULL) = (p_service_group_id IS NULL) THEN
    RAISE EXCEPTION 'Provide exactly one of service_id or service_group_id';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.payroll_bucket_items
    WHERE bucket_id = p_bucket_id
      AND service_id IS NOT DISTINCT FROM p_service_id
      AND service_group_id IS NOT DISTINCT FROM p_service_group_id
  ) INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'This service or service group is already in the bucket';
  END IF;

  INSERT INTO public.payroll_bucket_items (bucket_id, service_id, service_group_id)
  VALUES (p_bucket_id, p_service_id, p_service_group_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_bucket_item(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission('finance.manage_pay_rates') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.payroll_bucket_items WHERE id = p_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_bucket_member(p_bucket_id uuid, p_staff_role_id uuid, p_percent numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_bucket_percent numeric;
  v_other_total numeric;
BEGIN
  IF NOT public.has_permission('finance.manage_pay_rates') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_percent IS NULL OR p_percent < 0 OR p_percent > 100 THEN
    RAISE EXCEPTION 'Percent must be between 0 and 100';
  END IF;

  SELECT percent INTO v_bucket_percent FROM public.payroll_buckets WHERE id = p_bucket_id;
  IF v_bucket_percent IS NULL THEN
    RAISE EXCEPTION 'Bucket not found';
  END IF;

  SELECT COALESCE(SUM(percent), 0) INTO v_other_total
  FROM public.payroll_bucket_members
  WHERE bucket_id = p_bucket_id AND staff_role_id <> p_staff_role_id;

  IF v_other_total + p_percent > v_bucket_percent THEN
    RAISE EXCEPTION 'Members'' percent (%) would exceed the bucket''s percent (%)', v_other_total + p_percent, v_bucket_percent;
  END IF;

  INSERT INTO public.payroll_bucket_members (bucket_id, staff_role_id, percent)
  VALUES (p_bucket_id, p_staff_role_id, p_percent)
  ON CONFLICT (bucket_id, staff_role_id) DO UPDATE SET percent = EXCLUDED.percent
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_bucket_member(p_bucket_id uuid, p_staff_role_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission('finance.manage_pay_rates') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.payroll_bucket_members WHERE bucket_id = p_bucket_id AND staff_role_id = p_staff_role_id;
END;
$$;

-- ============================================================
-- 3. Revenue calc + detail view
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_payroll_bucket_revenue(p_bucket_id uuid, p_period_start timestamptz, p_period_end timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(vs.cost_at_time), 0)
  FROM public.visit_services vs
  JOIN public.service_statuses ss ON ss.id = vs.status_id
  JOIN public.services s ON s.id = vs.service_id
  WHERE ss.code = 'completed'
    AND vs.completed_at >= p_period_start
    AND vs.completed_at < p_period_end
    AND EXISTS (
      SELECT 1 FROM public.payroll_bucket_items bi
      WHERE bi.bucket_id = p_bucket_id
        AND (bi.service_id = vs.service_id OR (bi.service_id IS NULL AND bi.service_group_id = s.service_group_id))
    );
$$;

-- Per-member, per-service detail for the Payroll tab's expand panel
-- (Stage 3). Joins through payroll_bucket_items via EXISTS (not a
-- blind cross join) so a bucket with both a direct service item and
-- an overlapping service-group item for the same service does not
-- double-count that service -- validated live.
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
  (vs.cost_at_time * pbm.percent / 100) AS amount
FROM public.payroll_buckets pb
JOIN public.payroll_bucket_members pbm ON pbm.bucket_id = pb.id
JOIN public.visit_services vs ON EXISTS (
  SELECT 1 FROM public.payroll_bucket_items bi
  WHERE bi.bucket_id = pb.id
    AND (
      bi.service_id = vs.service_id
      OR (bi.service_id IS NULL AND bi.service_group_id = (SELECT service_group_id FROM public.services WHERE id = vs.service_id))
    )
)
JOIN public.services s ON s.id = vs.service_id
JOIN public.service_statuses ss ON ss.id = vs.status_id
WHERE pb.is_active
  AND ss.code = 'completed';

-- ============================================================
-- 4. calculate_physician_payroll -- department-bucket lateral
--    replaced with the new bucket-based calc. Base Pay, Own-Service
--    and Referral laterals are UNCHANGED from the already-shipped
--    referral fix. Output column stays `department_bucket_amount`
--    for backward compatibility with the old /finance/payroll page
--    and payroll_confirmations.
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

  RETURN QUERY
  SELECT
    sr.id,
    trim(COALESCE(p.last_name, '') || ' ' || COALESCE(p.first_name, '')),
    COALESCE(public.get_effective_flat_rate(sr.id, v_base_type_id, v_period_start), 0) AS base_pay_amount,
    COALESCE(os.amount, 0) AS own_service_amount,
    COALESCE(rf.amount, 0) AS referral_amount,
    COALESCE(bk.amount, 0) AS department_bucket_amount,
    (
      COALESCE(public.get_effective_flat_rate(sr.id, v_base_type_id, v_period_start), 0)
      + COALESCE(os.amount, 0)
      + COALESCE(rf.amount, 0)
      + COALESCE(bk.amount, 0)
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
    -- Bucket: sum, across every active bucket this physician belongs
    -- to, of that bucket's period revenue x the physician's OWN
    -- member % (not a share of the bucket's overall %). A physician
    -- in multiple buckets, or a service counted in multiple buckets,
    -- is intentional and not deduplicated across buckets.
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
