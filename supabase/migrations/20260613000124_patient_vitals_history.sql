-- Migration 124: Patient weight/height measurement history
--
-- patients.weight_kg / patients.height_cm remain as a denormalized
-- "current value" cache — fast reads, zero changes needed to existing
-- call sites (PatientCardModal, InpatientPatientDetail, OrdersPage).
--
-- New patient_vitals_measurements table is an append-only history log.
-- Every save inserts one row here (weight + height together, as one
-- measurement event) AND updates the cache columns on patients, in the
-- same transaction via the record_patient_measurement() RPC below.

-- ============================================================
-- 1. History table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.patient_vitals_measurements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  hospital_id  uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  weight_kg    numeric CHECK (weight_kg > 0),
  height_cm    numeric CHECK (height_cm > 0),
  recorded_by  uuid NOT NULL REFERENCES public.profiles(id),
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pvm_at_least_one_value CHECK (weight_kg IS NOT NULL OR height_cm IS NOT NULL)
);

-- Fast "latest N for this patient" lookups
CREATE INDEX IF NOT EXISTS pvm_patient_recorded_idx
  ON public.patient_vitals_measurements (patient_id, recorded_at DESC);

ALTER TABLE public.patient_vitals_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pvm_select" ON public.patient_vitals_measurements
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

-- Inserts only happen via the RPC below (SECURITY DEFINER), so no
-- direct insert policy is needed for normal app roles.

-- ============================================================
-- 2. RPC: record a measurement + update the cache atomically
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_patient_measurement(
  p_patient_id uuid,
  p_weight_kg  numeric,
  p_height_cm  numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hospital_id uuid;
  v_caller_id   uuid := auth.uid();
  v_row_id      uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_hospital_id := public.get_my_hospital_id();
  IF v_hospital_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Confirm the patient belongs to the caller's hospital
  PERFORM 1 FROM public.patients
  WHERE id = p_patient_id AND hospital_id = v_hospital_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;

  IF p_weight_kg IS NULL AND p_height_cm IS NULL THEN
    RAISE EXCEPTION 'At least one of weight or height must be provided';
  END IF;

  INSERT INTO public.patient_vitals_measurements
    (patient_id, hospital_id, weight_kg, height_cm, recorded_by)
  VALUES
    (p_patient_id, v_hospital_id, p_weight_kg, p_height_cm, v_caller_id)
  RETURNING id INTO v_row_id;

  UPDATE public.patients
  SET weight_kg = p_weight_kg,
      height_cm = p_height_cm
  WHERE id = p_patient_id;

  RETURN v_row_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_patient_measurement(uuid, numeric, numeric) TO authenticated;
