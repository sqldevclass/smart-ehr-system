-- Allow multiple bonus/advance entries per physician per month;
-- entries become immutable once created (insert-only); deleting an
-- entry is restricted to the admin role.

-- 1. Allow multiple rows per (staff_role_id, year, month, type).
ALTER TABLE public.physician_payroll_adjustments
  DROP CONSTRAINT physician_payroll_adjustments_staff_role_id_year_month_type_key;

-- 2. New permission, granted only to the admin role.
INSERT INTO public.permissions (code, name_en, name_ru, module)
VALUES ('finance.delete_payroll_adjustment', 'Delete bonus/advance entry', 'Удаление бонуса/аванса', 'finance')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = 'finance.delete_payroll_adjustment'
WHERE r.code = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3. View: expose the row id so the frontend can target one entry for deletion.
CREATE OR REPLACE VIEW public.payroll_adjustment_items
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
  approver.full_name AS approved_by_name,
  pa.id AS adjustment_id
FROM public.physician_payroll_adjustments pa
LEFT JOIN public.profiles approver ON approver.id = pa.created_by;

-- 4. set_payroll_adjustment: insert-only, no more upsert/update.
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
SET search_path TO 'public'
AS $function$
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

  INSERT INTO public.physician_payroll_adjustments
    (hospital_id, staff_role_id, year, month, type, amount, description, created_by)
  VALUES
    (v_hospital_id, p_staff_role_id, p_year, p_month, p_type, p_amount, p_description, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- 5. remove_payroll_adjustment: now targets one row by id, and is
-- restricted to the admin-only permission rather than manage_pay_rates.
DROP FUNCTION IF EXISTS public.remove_payroll_adjustment(uuid, int, int, text);

CREATE FUNCTION public.remove_payroll_adjustment(p_adjustment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_staff_role_id uuid;
  v_year int;
  v_month int;
BEGIN
  IF NOT public.has_permission('finance.delete_payroll_adjustment') THEN
    RAISE EXCEPTION 'Not authorized to delete payroll adjustments';
  END IF;

  SELECT staff_role_id, year, month
  INTO v_staff_role_id, v_year, v_month
  FROM public.physician_payroll_adjustments
  WHERE id = p_adjustment_id;

  IF v_staff_role_id IS NULL THEN
    RAISE EXCEPTION 'Adjustment % not found', p_adjustment_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payroll_confirmations pc
    WHERE pc.staff_role_id = v_staff_role_id AND pc.year = v_year AND pc.month = v_month
  ) THEN
    RAISE EXCEPTION 'This month is already confirmed and locked for this physician';
  END IF;

  DELETE FROM public.physician_payroll_adjustments WHERE id = p_adjustment_id;
END;
$function$;
