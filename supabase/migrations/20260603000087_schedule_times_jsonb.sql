-- Migration 087: Change schedule_times from text[] to jsonb
-- Cannot use subquery in USING clause.
-- Solution: add new column, populate via UPDATE, drop old column.

-- Step 1: Add new jsonb column
ALTER TABLE public.drug_prescriptions
  ADD COLUMN schedule_times_new
    jsonb DEFAULT '[]'::jsonb;

-- Step 2: Migrate existing data
-- Convert text[] → jsonb [{time, dose: null}]
UPDATE public.drug_prescriptions
SET schedule_times_new = (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('time', t, 'dose', null)
    ),
    '[]'::jsonb
  )
  FROM unnest(schedule_times) AS t
)
WHERE schedule_times IS NOT NULL
  AND array_length(schedule_times, 1) > 0;

-- Step 3: Drop old column, rename new
ALTER TABLE public.drug_prescriptions
  DROP COLUMN schedule_times;

ALTER TABLE public.drug_prescriptions
  RENAME COLUMN schedule_times_new
    TO schedule_times;

-- Step 4: Update submit_prescriptions RPC
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
      prescribed_at, patient_id,
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
          v_slot_at :=
            date_trunc('day',
              v_prescription.prescribed_at)
            + v_day * interval '1 day'
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
            v_slot_dose
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

-- Step 5: Update extend_prescription_to_date RPC
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
  v_target_start timestamptz;
  v_slot         jsonb;
  v_slot_time    text;
  v_slot_dose    text;
  v_new_duration integer;
  v_caller_roles text[];
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
  ) THEN
    RAISE EXCEPTION
      'Slots already exist for this date';
  END IF;

  v_target_start :=
    p_target_date::timestamptz
    AT TIME ZONE 'UTC';

  IF v_prescription.schedule_times IS NOT NULL
    AND jsonb_array_length(
      v_prescription.schedule_times) > 0
  THEN
    FOR v_slot IN SELECT *
      FROM jsonb_array_elements(
        v_prescription.schedule_times)
    LOOP
      v_slot_time := v_slot->>'time';
      v_slot_dose := v_slot->>'dose';

      INSERT INTO
        public.drug_administration_slots(
          prescription_id, hospital_id,
          hospitalization_id, patient_id,
          scheduled_at, status,
          override_dose)
      VALUES (
        p_prescription_id,
        v_hospital_id,
        v_prescription.hospitalization_id,
        v_prescription.patient_id,
        v_target_start + v_slot_time::interval,
        'pending',
        v_slot_dose
      );
    END LOOP;
  END IF;

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
    'success',      true,
    'target_date',  p_target_date,
    'new_duration', GREATEST(
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
