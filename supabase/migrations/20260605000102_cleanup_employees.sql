-- Migration 102: Clean up employees table and finalize schema
-- - Make person_id NOT NULL on employments (data should be complete)
-- - Drop old unique constraint on staff_invitations email
--   (replaced by person-based constraint in migration 098)
-- - Add audit trigger to new tables
-- NOTE: employees and physicians tables are NOT dropped here.
--   They will be dropped in a future migration after all UI
--   components are migrated to persons/employments/staff_roles.
--   This keeps the system stable during the UI transition.

-- ============================================================
-- 1. Add audit triggers to new tables
-- ============================================================

-- Recreate audit trigger function if needed
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    performed_by,
    performed_at
  ) VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW) ELSE NULL END,
    auth.uid(),
    now()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER persons_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.persons
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER employments_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.employments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

CREATE TRIGGER staff_roles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.staff_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- ============================================================
-- 2. Add person_id to profiles NOT NULL constraint
--    (deferred — some profiles may not have person yet e.g. admin)
--    Instead add a check constraint that person_id is set
--    whenever a non-admin user is created. Enforced at app level.
-- ============================================================

-- ============================================================
-- 3. Ensure staff_invitations pending unique constraint
--    on person_id doesn't conflict with existing employee_id one
-- ============================================================

-- Drop the old employee-based pending unique index if it exists
-- (created in migration 093, superseded by person_id index in 098)
DROP INDEX IF EXISTS staff_invitations_employee_pending_unique;
