-- Migration 070: Discharge patient
-- Add discharged_by to hospitalizations
-- Add discharge RPC

ALTER TABLE public.hospitalizations
  ADD COLUMN IF NOT EXISTS discharged_by
    uuid REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discharge_notes
    text;

CREATE OR REPLACE FUNCTION public.discharge_patient(
  p_hospitalization_id  uuid,
  p_discharge_type      text,
  p_discharge_notes     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id     uuid;
  v_hospital_id   uuid;
  v_hosp          record;
BEGIN
  v_caller_id   := auth.uid();
  v_hospital_id := public.get_my_hospital_id();

  IF v_caller_id IS NULL OR
     v_hospital_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.has_permission(
    'hospitalizations.discharge') THEN
    RAISE EXCEPTION
      'Permission denied';
  END IF;

  IF p_discharge_type NOT IN (
    'discharged', 'transferred', 'deceased') THEN
    RAISE EXCEPTION
      'Invalid discharge type: %',
      p_discharge_type;
  END IF;

  SELECT * INTO v_hosp
  FROM public.hospitalizations
  WHERE id = p_hospitalization_id
    AND hospital_id = v_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hospitalization not found';
  END IF;

  IF v_hosp.discharged_at IS NOT NULL THEN
    RAISE EXCEPTION 'Patient already discharged';
  END IF;

  -- 1. Discharge hospitalization
  UPDATE public.hospitalizations
  SET discharged_at    = now(),
      discharge_type   = p_discharge_type,
      discharged_by    = v_caller_id,
      discharge_notes  = p_discharge_notes
  WHERE id = p_hospitalization_id;

  -- 2. Close room assignment
  UPDATE public.room_assignments
  SET discharged_at = now()
  WHERE hospitalization_id = p_hospitalization_id
    AND discharged_at IS NULL;

  -- 3. Finalize hospitalization invoice
  UPDATE public.invoices
  SET status = 'pending_payment'
  WHERE hospitalization_id = p_hospitalization_id
    AND status = 'active';

  -- 4. Audit log
  INSERT INTO public.audit_logs (
    hospital_id, table_name, record_id,
    operation, new_values, performed_by
  ) VALUES (
    v_hospital_id,
    'hospitalizations',
    p_hospitalization_id,
    'UPDATE',
    jsonb_build_object(
      'discharged_at', now(),
      'discharge_type', p_discharge_type,
      'discharged_by', v_caller_id,
      'discharge_notes', p_discharge_notes
    ),
    v_caller_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'discharge_type', p_discharge_type,
    'discharged_at', now()
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION
      'discharge_patient failed: %', SQLERRM;
END;
$$;