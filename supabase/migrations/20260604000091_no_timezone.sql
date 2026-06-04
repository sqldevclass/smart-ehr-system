-- Migration 091: Remove timezone from time columns
-- scheduled_at in drug_administration_slots: timestamptz → timestamp
-- This ensures times are stored and displayed as-is (wall clock time)
-- No timezone conversion anywhere in the system

-- Change scheduled_at in drug_administration_slots
ALTER TABLE public.drug_administration_slots
  ALTER COLUMN scheduled_at
    TYPE timestamp
    USING scheduled_at AT TIME ZONE 'UTC';

-- Change administered_at as well for consistency
ALTER TABLE public.drug_administration_slots
  ALTER COLUMN administered_at
    TYPE timestamp
    USING administered_at AT TIME ZONE 'UTC';

-- Change overridden_at for consistency
ALTER TABLE public.drug_administration_slots
  ALTER COLUMN overridden_at
    TYPE timestamp
    USING overridden_at AT TIME ZONE 'UTC';

-- prescribed_at in drug_prescriptions:
-- Keep as timestamptz (it records when the prescription
-- was created — an audit timestamp, timezone matters)
-- start_date is already date type — correct

-- Update submit_prescriptions RPC to insert
-- timestamp (not timestamptz) for scheduled_at
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
  v_slot_at       timestamp;
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
      start_date, patient_id,
      hospitalization_id
    FROM public.drug_prescriptions
    WHERE hospitalization_id =
        p_hospitalization_id
      AND hospital_id = p_hospital_id
      AND is_drafted = true
  LOOP
    UPDATE public.drug_prescriptions
    SET
      is_drafted        = false,
      status_code       = 'preliminary',
      status_changed_at = now(),
      status_changed_by = v_caller_id
    WHERE id = v_prescription.id;

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

          -- start_date + day offset + time
          -- Result is timestamp with no timezone
          v_slot_at :=
            (v_prescription.start_date + v_day)
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

-- Update extend_prescription_to_date RPC
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
  v_target_start timestamp;
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

  SELECT MAX(scheduled_at::date)
  INTO v_latest_date
  FROM public.drug_administration_slots
  WHERE prescription_id = p_prescription_id
    AND status != 'skipped';

  v_target_start := p_target_date::timestamp;

  IF v_latest_date IS NOT NULL THEN
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
