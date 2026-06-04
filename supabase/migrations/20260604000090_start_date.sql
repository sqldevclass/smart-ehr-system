-- Migration 090: Add start_date column to drug_prescriptions
-- Stores the prescription start date as a pure date (no timezone)
-- Used for slot generation instead of date_trunc(prescribed_at)
-- This eliminates timezone bugs where prescribed_at UTC offset
-- shifts the slot date/time incorrectly.

-- Step 1: Add start_date column
ALTER TABLE public.drug_prescriptions
  ADD COLUMN IF NOT EXISTS start_date date;

-- Step 2: Backfill from prescribed_at for existing rows
-- Use UTC date of prescribed_at as the start date
UPDATE public.drug_prescriptions
SET start_date = (prescribed_at AT TIME ZONE 'UTC')::date
WHERE start_date IS NULL;

-- Step 3: Set NOT NULL after backfill
-- (existing rows now have start_date populated)
ALTER TABLE public.drug_prescriptions
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN start_date SET DEFAULT CURRENT_DATE;

-- Step 4: Update submit_prescriptions RPC
-- Use start_date for slot generation instead of
-- date_trunc('day', prescribed_at)
CREATE OR REPLACE FUNCTION public.submit_prescriptions(
  p_hospitalization_id  uuid,
  p_hospital_id         uuid,
  p_physician_id        uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id     uuid;
  v_prescription  record;
  v_slot          jsonb;
  v_slot_time     text;
  v_slot_dose     text;
  v_slot_at       timestamptz;
  v_day           integer;
  v_count         integer := 0;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  FOR v_prescription IN
    SELECT id, drug_formulary_id,
      schedule_times, duration_days,
      prescribed_at, start_date,
      patient_id, hospitalization_id
    FROM public.drug_prescriptions
    WHERE hospitalization_id =
        p_hospitalization_id
      AND hospital_id = p_hospital_id
      AND is_drafted = true
  LOOP
    -- Mark as submitted
    UPDATE public.drug_prescriptions
    SET
      is_drafted        = false,
      status_code       = 'preliminary',
      status_changed_at = now(),
      status_changed_by = v_caller_id
    WHERE id = v_prescription.id;

    -- Generate slots using start_date (pure date, no timezone)
    IF v_prescription.schedule_times IS NOT NULL
      AND jsonb_array_length(
        v_prescription.schedule_times) > 0
      AND v_prescription.duration_days IS NOT NULL
      AND v_prescription.duration_days > 0
    THEN
      FOR v_day IN
        0..(v_prescription.duration_days - 1)
      LOOP
        FOR v_slot IN SELECT *
          FROM jsonb_array_elements(
            v_prescription.schedule_times)
        LOOP
          v_slot_time := v_slot->>'time';
          v_slot_dose := v_slot->>'dose';

          -- Use start_date + day offset + time
          -- start_date is a pure date so adding
          -- interval gives UTC midnight + time
          -- No timezone shifting occurs
          v_slot_at :=
            (v_prescription.start_date
              + v_day)::timestamp
            + v_slot_time::interval;

          INSERT INTO
            public.drug_administration_slots(
              prescription_id, hospital_id,
              hospitalization_id, patient_id,
              scheduled_at, status,
              override_dose)
          VALUES (
            v_prescription.id,
            p_hospital_id,
            p_hospitalization_id,
            v_prescription.patient_id,
            v_slot_at,
            'pending',
            NULLIF(v_slot_dose, '')
          );
        END LOOP;
      END LOOP;
    END IF;

    -- Update physician favorites
    INSERT INTO public.physician_favorites
      (physician_id, drug_formulary_id,
       use_count, last_used_at)
    VALUES
      (v_caller_id,
       v_prescription.drug_formulary_id,
       1, now())
    ON CONFLICT (physician_id, drug_formulary_id)
    DO UPDATE SET
      use_count    =
        physician_favorites.use_count + 1,
      last_used_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'submitted_count', v_count,
    'success', true
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION
      'submit_prescriptions failed: %', SQLERRM;
END;
$$;

-- Step 5: Update extend_prescription_to_date RPC
-- Use start_date for date calculations
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
  v_caller_id    uuid;
  v_hospital_id  uuid;
  v_prescription record;
  v_source_slot  record;
  v_target_start timestamptz;
  v_new_duration integer;
  v_caller_roles text[];
  v_latest_date  date;
  v_slot_count   integer := 0;
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

  -- Block only if non-skipped slots exist
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

  -- Target start = target date at midnight UTC
  v_target_start :=
    p_target_date::timestamp;

  IF v_latest_date IS NOT NULL THEN
    -- Clone active slots from latest day
    FOR v_source_slot IN
      SELECT
        EXTRACT(HOUR FROM scheduled_at)
          AS slot_hour,
        EXTRACT(MINUTE FROM scheduled_at)
          AS slot_minute,
        override_dose
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
        NULLIF(v_source_slot.slot_dose, '')
      );
      v_slot_count := v_slot_count + 1;
    END LOOP;
  END IF;

  -- Update duration_days to cover target date
  v_new_duration :=
    (p_target_date - v_prescription.start_date)
    + 1;

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
