-- Migration 085: Replace extend_prescription with
-- extend_prescription_to_date
-- Extends prescription TO a specific target date
-- generating slots only for that day

-- Drop old RPC
DROP FUNCTION IF EXISTS
  public.extend_prescription(uuid);

-- New RPC: extend to a specific date
CREATE OR REPLACE FUNCTION
  public.extend_prescription_to_date(
    p_prescription_id uuid,
    p_target_date     date
  )
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id     uuid;
  v_hospital_id   uuid;
  v_prescription  record;
  v_target_start  timestamptz;
  v_slot_time     text;
  v_new_duration  integer;
  v_caller_roles  text[];
BEGIN
  v_caller_id   := auth.uid();
  v_hospital_id := public.get_my_hospital_id();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Only physicians can extend
  SELECT array_agg(r.code)
  INTO v_caller_roles
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_caller_id;

  IF NOT ('physician' = ANY(v_caller_roles)) THEN
    RAISE EXCEPTION
      'Only physicians can extend prescriptions';
  END IF;

  -- Get prescription
  SELECT * INTO v_prescription
  FROM public.drug_prescriptions
  WHERE id = p_prescription_id
    AND hospital_id = v_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prescription not found';
  END IF;

  IF v_prescription.status_code = 'cancelled'
  THEN
    RAISE EXCEPTION
      'Cannot extend a cancelled prescription';
  END IF;

  -- Target date must not be in the past
  IF p_target_date < CURRENT_DATE THEN
    RAISE EXCEPTION
      'Target date cannot be in the past';
  END IF;

  -- Target date must be outside current range
  -- (no existing slots for that day)
  IF EXISTS (
    SELECT 1
    FROM public.drug_administration_slots
    WHERE prescription_id = p_prescription_id
      AND scheduled_at::date = p_target_date
  ) THEN
    RAISE EXCEPTION
      'Slots already exist for this date';
  END IF;

  -- Target datetime = target date at 00:00
  v_target_start :=
    p_target_date::timestamptz
    AT TIME ZONE 'UTC';

  -- Generate slots for the target date
  IF v_prescription.schedule_times IS NOT NULL
    AND array_length(
      v_prescription.schedule_times, 1) > 0
  THEN
    FOREACH v_slot_time IN ARRAY
      v_prescription.schedule_times
    LOOP
      INSERT INTO public.drug_administration_slots
        (prescription_id, hospital_id,
         hospitalization_id, patient_id,
         scheduled_at, status)
      VALUES (
        p_prescription_id,
        v_hospital_id,
        v_prescription.hospitalization_id,
        v_prescription.patient_id,
        v_target_start + v_slot_time::interval,
        'pending'
      );
    END LOOP;
  END IF;

  -- Update duration_days to cover up to
  -- target date from prescribed_at
  v_new_duration :=
    (p_target_date -
      date_trunc('day',
        v_prescription.prescribed_at)::date
    ) + 1;

  -- Only extend, never shorten
  IF v_new_duration > v_prescription.duration_days
  THEN
    UPDATE public.drug_prescriptions
    SET duration_days = v_new_duration
    WHERE id = p_prescription_id;
  END IF;

  RETURN jsonb_build_object(
    'success',       true,
    'target_date',   p_target_date,
    'new_duration',  GREATEST(
      v_new_duration,
      v_prescription.duration_days)
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION
      'extend_prescription_to_date failed: %',
      SQLERRM;
END;
$$;
