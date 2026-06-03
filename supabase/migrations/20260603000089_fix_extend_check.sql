-- Migration 089: Fix extend_prescription_to_date
-- to exclude skipped slots from existence check.
-- Previously failed when a day had only skipped slots.

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
  v_source_slot   record;
  v_target_start  timestamptz;
  v_new_duration  integer;
  v_caller_roles  text[];
  v_latest_date   date;
  v_slot_count    integer := 0;
BEGIN
  v_caller_id   := auth.uid();
  v_hospital_id := public.get_my_hospital_id();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT array_agg(r.code)
  INTO v_caller_roles
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_caller_id;

  IF NOT ('physician' = ANY(v_caller_roles)) THEN
    RAISE EXCEPTION
      'Only physicians can extend prescriptions';
  END IF;

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

  IF p_target_date < CURRENT_DATE THEN
    RAISE EXCEPTION
      'Target date cannot be in the past';
  END IF;

  -- Only block if non-skipped slots exist
  -- for this date (skipped slots are OK)
  IF EXISTS (
    SELECT 1
    FROM public.drug_administration_slots
    WHERE prescription_id = p_prescription_id
      AND scheduled_at::date = p_target_date
      AND status != 'skipped'
  ) THEN
    RAISE EXCEPTION
      'Active slots already exist for this date';
  END IF;

  -- Find most recent day with active slots
  SELECT MAX(scheduled_at::date)
  INTO v_latest_date
  FROM public.drug_administration_slots
  WHERE prescription_id = p_prescription_id
    AND status != 'skipped';

  v_target_start :=
    p_target_date::timestamptz
    AT TIME ZONE 'UTC';

  IF v_latest_date IS NOT NULL THEN
    -- Clone active slots from latest day
    FOR v_source_slot IN
      SELECT
        scheduled_at,
        override_dose,
        EXTRACT(HOUR FROM scheduled_at)
          AS slot_hour,
        EXTRACT(MINUTE FROM scheduled_at)
          AS slot_minute
      FROM public.drug_administration_slots
      WHERE prescription_id = p_prescription_id
        AND scheduled_at::date = v_latest_date
        AND status != 'skipped'
      ORDER BY scheduled_at
    LOOP
      INSERT INTO public.drug_administration_slots
        (prescription_id, hospital_id,
         hospitalization_id, patient_id,
         scheduled_at, status, override_dose)
      VALUES (
        p_prescription_id,
        v_hospital_id,
        v_prescription.hospitalization_id,
        v_prescription.patient_id,
        v_target_start
          + (v_source_slot.slot_hour
              * interval '1 hour')
          + (v_source_slot.slot_minute
              * interval '1 minute'),
        'pending',
        v_source_slot.override_dose
      );
      v_slot_count := v_slot_count + 1;
    END LOOP;

  ELSE
    -- No existing slots — fall back to
    -- schedule_times from prescription
    FOR v_source_slot IN
      SELECT
        (elem->>'time') AS slot_time,
        (elem->>'dose') AS slot_dose
      FROM jsonb_array_elements(
        v_prescription.schedule_times) AS elem
    LOOP
      INSERT INTO public.drug_administration_slots
        (prescription_id, hospital_id,
         hospitalization_id, patient_id,
         scheduled_at, status, override_dose)
      VALUES (
        p_prescription_id,
        v_hospital_id,
        v_prescription.hospitalization_id,
        v_prescription.patient_id,
        v_target_start +
          v_source_slot.slot_time::interval,
        'pending',
        v_source_slot.slot_dose
      );
      v_slot_count := v_slot_count + 1;
    END LOOP;
  END IF;

  -- Update duration_days to cover target date
  v_new_duration :=
    (p_target_date -
      date_trunc('day',
        v_prescription.prescribed_at)::date
    ) + 1;

  IF v_new_duration > v_prescription.duration_days
  THEN
    UPDATE public.drug_prescriptions
    SET duration_days = v_new_duration
    WHERE id = p_prescription_id;
  END IF;

  RETURN jsonb_build_object(
    'success',       true,
    'target_date',   p_target_date,
    'slots_created', v_slot_count,
    'source_date',   v_latest_date,
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
