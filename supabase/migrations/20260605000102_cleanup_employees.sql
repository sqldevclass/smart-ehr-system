-- Migration 102: Clean up and finalize schema
-- - Restore correct audit_trigger_func
-- - Add audit triggers to new tables
-- - Drop old employee-based pending unique index

CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hospital_id uuid;
  v_record_id   uuid;
  v_old_values  jsonb;
  v_new_values  jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_hospital_id := OLD.hospital_id;
    v_record_id   := OLD.id;
    v_old_values  := to_jsonb(OLD);
    v_new_values  := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_hospital_id := NEW.hospital_id;
    v_record_id   := NEW.id;
    v_old_values  := NULL;
    v_new_values  := to_jsonb(NEW);
  ELSE
    v_hospital_id := NEW.hospital_id;
    v_record_id   := NEW.id;
    v_old_values  := to_jsonb(OLD);
    v_new_values  := to_jsonb(NEW);
  END IF;

  INSERT INTO public.audit_logs (
    hospital_id,
    table_name,
    record_id,
    operation,
    old_values,
    new_values,
    performed_by,
    performed_at
  ) VALUES (
    v_hospital_id,
    TG_TABLE_NAME,
    v_record_id,
    TG_OP,
    v_old_values,
    v_new_values,
    auth.uid(),
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS persons_audit ON public.persons;
CREATE TRIGGER persons_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.persons
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS employments_audit ON public.employments;
CREATE TRIGGER employments_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.employments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS staff_roles_audit ON public.staff_roles;
CREATE TRIGGER staff_roles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.staff_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP INDEX IF EXISTS staff_invitations_employee_pending_unique;
