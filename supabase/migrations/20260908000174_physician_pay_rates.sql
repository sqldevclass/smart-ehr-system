-- Migration 174: Physician pay rate configuration
-- Adds a lookup table for pay rate types (base pay, own-service %,
-- referral %, department bucket %) and a single table for finance
-- to configure each physician's rates against that lookup.
--
-- Does NOT compute payroll — this only stores the configured rates.
-- The payroll calculation (Finance Dashboard, Phase 10 remainder) is
-- a separate RPC/view built on top of this, once this is confirmed.

-- ============================================================
-- 1. pay_rate_types lookup table
-- ============================================================

CREATE TABLE public.pay_rate_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name_ru     text NOT NULL,
  name_en     text,
  value_kind  text NOT NULL CHECK (value_kind IN ('flat_amount', 'percentage')),
  sort_order  integer DEFAULT 0,
  is_active   boolean DEFAULT true
);

INSERT INTO public.pay_rate_types (code, name_ru, name_en, value_kind, sort_order) VALUES
  ('base_pay',          'Базовая оплата',              'Base pay',              'flat_amount', 1),
  ('own_service',       'Процент от своих услуг',      'Own service %',        'percentage',  2),
  ('referral',          'Процент от направленных услуг','Referral %',           'percentage',  3),
  ('department_bucket', 'Доля от бюджета отделения',    'Department bucket %',  'percentage',  4);

ALTER TABLE public.pay_rate_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pay_rate_types_select" ON public.pay_rate_types
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- 2. physician_pay_rates
--    One row per physician (staff_role) x rate type x optional
--    service scope. service_type_id / service_id are mutually
--    exclusive; both NULL means "no service scope" (required for
--    base_pay and department_bucket, optional default-fallback
--    for own_service / referral).
-- ============================================================

CREATE TABLE public.physician_pay_rates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id      uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  staff_role_id    uuid NOT NULL REFERENCES public.staff_roles(id) ON DELETE CASCADE,
  pay_rate_type_id uuid NOT NULL REFERENCES public.pay_rate_types(id) ON DELETE RESTRICT,

  service_type_id  uuid REFERENCES public.service_types(id) ON DELETE CASCADE,
  service_id       uuid REFERENCES public.services(id) ON DELETE CASCADE,

  value            numeric NOT NULL CHECK (value >= 0),

  is_active        boolean DEFAULT true,
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz DEFAULT now(),

  CONSTRAINT physician_pay_rates_scope_exclusive
    CHECK (NOT (service_type_id IS NOT NULL AND service_id IS NOT NULL))
);

-- Treat NULL as a real value for uniqueness (no duplicate scope per physician+type)
CREATE UNIQUE INDEX physician_pay_rates_scope_unique
  ON public.physician_pay_rates (
    staff_role_id,
    pay_rate_type_id,
    COALESCE(service_type_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(service_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX physician_pay_rates_staff_role_idx ON public.physician_pay_rates(staff_role_id);
CREATE INDEX physician_pay_rates_hospital_idx ON public.physician_pay_rates(hospital_id);

-- ============================================================
-- 3. Scope validation trigger
--    base_pay / department_bucket must have NO service scope.
--    (own_service / referral may or may not — a NULL-scope row
--    on those acts as a default/fallback rate.)
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_physician_pay_rate_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_code text;
BEGIN
  SELECT code INTO v_code
  FROM public.pay_rate_types
  WHERE id = NEW.pay_rate_type_id;

  IF v_code IN ('base_pay', 'department_bucket') THEN
    IF NEW.service_type_id IS NOT NULL OR NEW.service_id IS NOT NULL THEN
      RAISE EXCEPTION '% rates cannot have a service scope', v_code;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER physician_pay_rates_validate_scope
  BEFORE INSERT OR UPDATE ON public.physician_pay_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_physician_pay_rate_scope();

-- ============================================================
-- 4. Permission: finance.manage_pay_rates
-- ============================================================

INSERT INTO public.permissions (code, name_ru, name_en, module)
VALUES ('finance.manage_pay_rates', 'Настройка ставок оплаты', 'Manage pay rates', 'finance');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.code IN ('finance', 'admin')
  AND p.code = 'finance.manage_pay_rates';

-- ============================================================
-- 5. RLS on physician_pay_rates
-- ============================================================

ALTER TABLE public.physician_pay_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "physician_pay_rates_select" ON public.physician_pay_rates
  FOR SELECT TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('finance.view_payroll')
      OR public.has_permission('finance.manage_pay_rates')
    )
  );

CREATE POLICY "physician_pay_rates_insert" ON public.physician_pay_rates
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('finance.manage_pay_rates')
  );

CREATE POLICY "physician_pay_rates_update" ON public.physician_pay_rates
  FOR UPDATE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('finance.manage_pay_rates')
  )
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('finance.manage_pay_rates')
  );

CREATE POLICY "physician_pay_rates_delete" ON public.physician_pay_rates
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('finance.manage_pay_rates')
  );
