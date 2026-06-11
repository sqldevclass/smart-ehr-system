-- Migration 117: Add order_prn_drug RPC
-- Called when nurse orders a PRN drug (condition met).
-- Creates ONE administration slot for the specified time
-- and changes prescription status to in_progress (goes to pharmacy).

CREATE OR REPLACE FUNCTION public.order_prn_drug(
  p_prescription_id uuid,
  p_hospital_id     uuid,
  p_scheduled_at    timestamptz,
  p_ordered_by      uuid
)
RETURNS uuid  -- returns new slot id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prescription record;
  v_slot_id      uuid;
BEGIN
  -- Validate prescription
  SELECT * INTO v_prescription
  FROM public.drug_prescriptions
  WHERE id = p_prescription_id
    AND hospital_id = p_hospital_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prescription not found: %', p_prescription_id;
  END IF;

  IF v_prescription.prescription_type != 'prn' THEN
    RAISE EXCEPTION 'Not a PRN prescription';
  END IF;

  IF v_prescription.status_code NOT IN ('preliminary', 'ready_for_execution') THEN
    RAISE EXCEPTION 'PRN prescription cannot be ordered in status: %',
      v_prescription.status_code;
  END IF;

  -- Create one administration slot
  INSERT INTO public.drug_administration_slots (
    prescription_id,
    hospital_id,
    hospitalization_id,
    patient_id,
    scheduled_at,
    status
  ) VALUES (
    p_prescription_id,
    p_hospital_id,
    v_prescription.hospitalization_id,
    v_prescription.patient_id,
    p_scheduled_at,
    'pending'
  )
  RETURNING id INTO v_slot_id;

  -- Move prescription to in_progress → triggers pharmacy flow
  UPDATE public.drug_prescriptions
  SET
    status_code       = 'in_progress',
    status_changed_at = now(),
    status_changed_by = p_ordered_by
  WHERE id = p_prescription_id;

  RETURN v_slot_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'order_prn_drug failed: %', SQLERRM;
END;
$$;

-- Update submit_prescriptions to handle PRN:
-- PRN goes to preliminary (not ready_for_execution)
-- No slots generated for PRN prescriptions
-- (Already handled correctly — schedule_times is empty for PRN)

