-- Stage 4 of 4: move Referral out of the per-physician Pay Rates
-- page. Referral stays in physician_pay_rates (same table, same
-- columns, same effective-dating/get_effective_scoped_rate
-- resolution -- NO schema change, and the already-shipped referral
-- calculation in calculate_physician_payroll / physician_service_pay_items
-- needs ZERO changes). The only new behavior: setting a referral
-- rate for a scope now applies the same value to every active
-- physician's own row in one action, from its own page (no
-- physician selector), and a newly hired physician automatically
-- inherits whatever referral rates are currently set, from day one.
--
-- Confirmed with user: "as soon as a new person is added it should
-- calculate with the current %" -- applies to both Referral
-- (needs this trigger) and Buckets (already worked this way, no
-- change needed there).
--
-- Validated live before delivery:
--  - set_referral_rate_for_all_physicians' loop logic applied value
--    12 for a test scope to all 3 real active physicians in one
--    pass.
--  - inherit_referral_rates_for_new_physician's trigger logic,
--    fired on a real INSERT into staff_roles for a scratch
--    physician, correctly copied every one of the hospital's then-
--    current referral scopes (two service-type-level rates plus the
--    one service-level test rate) onto the new physician.
-- Both run inside BEGIN...ROLLBACK against production data, not
-- committed.

-- ============================================================
-- 1. Apply-to-all / end-for-all RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_referral_rate_for_all_physicians(
  p_hospital_id uuid,
  p_value numeric,
  p_service_type_id uuid DEFAULT NULL,
  p_service_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral_type_id uuid;
  v_sr record;
BEGIN
  IF NOT public.has_permission('finance.manage_pay_rates') THEN
    RAISE EXCEPTION 'Not authorized to manage pay rates';
  END IF;
  IF p_value IS NULL OR p_value < 0 THEN
    RAISE EXCEPTION 'Rate value cannot be negative';
  END IF;

  SELECT id INTO v_referral_type_id FROM public.pay_rate_types WHERE code = 'referral';
  IF v_referral_type_id IS NULL THEN
    RAISE EXCEPTION 'referral pay rate type not found';
  END IF;

  -- Reuses set_physician_pay_rate's own end-then-insert logic for
  -- each physician, rather than duplicating it.
  FOR v_sr IN
    SELECT id FROM public.staff_roles
    WHERE hospital_id = p_hospital_id AND role_type = 'physician' AND is_active
  LOOP
    PERFORM public.set_physician_pay_rate(v_sr.id, v_referral_type_id, p_value, p_service_type_id, p_service_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_referral_rate_for_all_physicians(
  p_hospital_id uuid,
  p_service_type_id uuid DEFAULT NULL,
  p_service_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral_type_id uuid;
BEGIN
  IF NOT public.has_permission('finance.manage_pay_rates') THEN
    RAISE EXCEPTION 'Not authorized to manage pay rates';
  END IF;

  SELECT id INTO v_referral_type_id FROM public.pay_rate_types WHERE code = 'referral';
  IF v_referral_type_id IS NULL THEN
    RAISE EXCEPTION 'referral pay rate type not found';
  END IF;

  UPDATE public.physician_pay_rates
  SET valid_to = now()
  WHERE hospital_id = p_hospital_id
    AND pay_rate_type_id = v_referral_type_id
    AND service_type_id IS NOT DISTINCT FROM p_service_type_id
    AND service_id IS NOT DISTINCT FROM p_service_id
    AND valid_to IS NULL;
END;
$$;

-- ============================================================
-- 2. Hospital-wide read view for the new Referral Rates page.
--    Referral is still stored per-physician, but since it's only
--    ever written via the RPC above (or inherited, below), every
--    active physician's row for a scope should carry the same
--    value -- this collapses that to one row per scope. If rows
--    ever diverge (shouldn't happen going forward), the most
--    recently-set value for that scope wins, same tiebreak as the
--    inherit trigger.
-- ============================================================

CREATE OR REPLACE VIEW public.hospital_referral_rates
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (pr.hospital_id, pr.service_type_id, pr.service_id)
  pr.hospital_id,
  pr.service_type_id,
  pr.service_id,
  pr.value,
  pr.valid_from
FROM public.physician_pay_rates pr
JOIN public.pay_rate_types prt ON prt.id = pr.pay_rate_type_id
WHERE prt.code = 'referral'
  AND pr.valid_to IS NULL
ORDER BY pr.hospital_id, pr.service_type_id, pr.service_id, pr.valid_from DESC;

-- ============================================================
-- 3. New-hire auto-inherit trigger. Runs as the function owner
--    (SECURITY DEFINER) specifically so it does NOT require the
--    inserting user (HR/admin hiring the physician) to hold
--    finance.manage_pay_rates -- this is a system propagation, not
--    a manual finance edit, so it deliberately skips that check.
-- ============================================================

CREATE OR REPLACE FUNCTION public.inherit_referral_rates_for_new_physician()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral_type_id uuid;
  v_scope record;
BEGIN
  IF NEW.role_type <> 'physician' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_referral_type_id FROM public.pay_rate_types WHERE code = 'referral';
  IF v_referral_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_scope IN
    SELECT DISTINCT ON (service_type_id, service_id) service_type_id, service_id, value
    FROM public.physician_pay_rates
    WHERE hospital_id = NEW.hospital_id
      AND pay_rate_type_id = v_referral_type_id
      AND valid_to IS NULL
    ORDER BY service_type_id, service_id, valid_from DESC
  LOOP
    INSERT INTO public.physician_pay_rates (
      hospital_id, staff_role_id, pay_rate_type_id, service_type_id, service_id, value, valid_from, valid_to
    ) VALUES (
      NEW.hospital_id, NEW.id, v_referral_type_id, v_scope.service_type_id, v_scope.service_id, v_scope.value, now(), NULL
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inherit_referral_rates ON public.staff_roles;
CREATE TRIGGER trg_inherit_referral_rates
AFTER INSERT ON public.staff_roles
FOR EACH ROW
EXECUTE FUNCTION public.inherit_referral_rates_for_new_physician();
