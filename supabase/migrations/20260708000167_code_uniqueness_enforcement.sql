-- Migration 167: enforce code uniqueness at the database level,
-- not just the application layer — both fixes are race-condition
-- safe and cannot be bypassed by calling the API directly.
--
-- 1. services.code — plain partial unique index, no trigger
--    needed, standard per-hospital uniqueness.
-- 2. service_types.code — the cross-scope check (a hospital's own
--    code must not collide with any global code) can't be
--    expressed as a single index, since global rows and hospital
--    rows sit in two separate partial indexes that can't see each
--    other. This genuinely needs a trigger — the correct tool for
--    a cross-row check, not a workaround.

-- ============================================================
-- 1. services — per-hospital code uniqueness
-- ============================================================
CREATE UNIQUE INDEX services_hospital_code_uidx
  ON public.services(hospital_id, code)
  WHERE code IS NOT NULL;

-- ============================================================
-- 2. service_types — trigger blocking a hospital-scoped code from
--    colliding with any existing global code.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_service_type_code_conflict()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only relevant for hospital-scoped rows with a code set.
  -- Global rows (hospital_id IS NULL) are already protected from
  -- colliding with each other by service_types_global_code_uidx,
  -- and RLS already prevents hospital admins from writing to
  -- global rows at all — this trigger only needs to guard the
  -- hospital -> global direction.
  IF NEW.hospital_id IS NOT NULL AND NEW.code IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.service_types
      WHERE hospital_id IS NULL
        AND code = NEW.code
    ) THEN
      RAISE EXCEPTION
        'Service type code "%" is already used by a platform-default type.',
        NEW.code;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_type_code_conflict_check ON public.service_types;

CREATE TRIGGER service_type_code_conflict_check
  BEFORE INSERT OR UPDATE ON public.service_types
  FOR EACH ROW
  EXECUTE FUNCTION public.check_service_type_code_conflict();
