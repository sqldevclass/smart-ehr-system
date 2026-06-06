-- Migration 104: Migrate physicians table references to staff_roles
-- This migration:
-- 1. Adds staff_role_id FK to all tables that currently reference physicians.id
-- 2. Backfills staff_role_id from physicians.staff_role_id
-- 3. Makes physician_id nullable on all these tables
-- 4. Updates RPCs to use staff_role_id
-- 5. Updates RLS policies that reference physicians table
-- NOTE: physicians table is NOT dropped here — it stays for historical reference
--       and will be dropped in a future cleanup migration

-- ============================================================
-- 1. physician_schedules
-- ============================================================

ALTER TABLE public.physician_schedules
  ADD COLUMN staff_role_id uuid REFERENCES public.staff_roles(id) ON DELETE CASCADE;

UPDATE public.physician_schedules ps
SET staff_role_id = ph.staff_role_id
FROM public.physicians ph
WHERE ph.id = ps.physician_id
  AND ph.staff_role_id IS NOT NULL;

ALTER TABLE public.physician_schedules
  ALTER COLUMN physician_id DROP NOT NULL;

CREATE INDEX physician_schedules_staff_role_idx
  ON public.physician_schedules(staff_role_id);

-- ============================================================
-- 2. physician_schedule_blocks
-- ============================================================

ALTER TABLE public.physician_schedule_blocks
  ADD COLUMN staff_role_id uuid REFERENCES public.staff_roles(id) ON DELETE CASCADE;

UPDATE public.physician_schedule_blocks psb
SET staff_role_id = ph.staff_role_id
FROM public.physicians ph
WHERE ph.id = psb.physician_id
  AND ph.staff_role_id IS NOT NULL;

ALTER TABLE public.physician_schedule_blocks
  ALTER COLUMN physician_id DROP NOT NULL;

CREATE INDEX schedule_blocks_staff_role_idx
  ON public.physician_schedule_blocks(staff_role_id);

-- ============================================================
-- 3. schedule_slots
-- ============================================================

ALTER TABLE public.schedule_slots
  ADD COLUMN staff_role_id uuid REFERENCES public.staff_roles(id) ON DELETE CASCADE;

UPDATE public.schedule_slots ss
SET staff_role_id = ph.staff_role_id
FROM public.physicians ph
WHERE ph.id = ss.physician_id
  AND ph.staff_role_id IS NOT NULL;

ALTER TABLE public.schedule_slots
  ALTER COLUMN physician_id DROP NOT NULL;

-- Drop old unique constraint and replace with staff_role_id based one
ALTER TABLE public.schedule_slots
  DROP CONSTRAINT IF EXISTS schedule_slots_physician_id_slot_datetime_key;

CREATE UNIQUE INDEX schedule_slots_staff_role_datetime_unique
  ON public.schedule_slots(staff_role_id, slot_datetime)
  WHERE staff_role_id IS NOT NULL;

CREATE INDEX schedule_slots_staff_role_idx
  ON public.schedule_slots(staff_role_id, slot_datetime);

-- ============================================================
-- 4. visit_services (assigned_physician_id → staff_role_id)
-- ============================================================

ALTER TABLE public.visit_services
  ADD COLUMN assigned_staff_role_id uuid REFERENCES public.staff_roles(id) ON DELETE SET NULL;

UPDATE public.visit_services vs
SET assigned_staff_role_id = ph.staff_role_id
FROM public.physicians ph
WHERE ph.id = vs.assigned_physician_id
  AND ph.staff_role_id IS NOT NULL;

CREATE INDEX visit_services_staff_role_idx
  ON public.visit_services(assigned_staff_role_id);

-- ============================================================
-- 5. hospitalizations (primary_physician_id → primary_staff_role_id)
-- ============================================================

ALTER TABLE public.hospitalizations
  ADD COLUMN primary_staff_role_id uuid REFERENCES public.staff_roles(id) ON DELETE SET NULL;

UPDATE public.hospitalizations h
SET primary_staff_role_id = ph.staff_role_id
FROM public.physicians ph
WHERE ph.id = h.primary_physician_id
  AND ph.staff_role_id IS NOT NULL;

CREATE INDEX hospitalizations_staff_role_idx
  ON public.hospitalizations(primary_staff_role_id);

-- ============================================================
-- 6. office_room_physicians (physician_id → staff_role_id)
-- ============================================================

ALTER TABLE public.office_room_physicians
  ADD COLUMN staff_role_id uuid REFERENCES public.staff_roles(id) ON DELETE CASCADE;

UPDATE public.office_room_physicians orp
SET staff_role_id = ph.staff_role_id
FROM public.physicians ph
WHERE ph.id = orp.physician_id
  AND ph.staff_role_id IS NOT NULL;

-- Drop old PK and replace with staff_role_id based one
ALTER TABLE public.office_room_physicians
  DROP CONSTRAINT IF EXISTS office_room_physicians_pkey;

ALTER TABLE public.office_room_physicians
  ADD COLUMN id uuid DEFAULT gen_random_uuid();

UPDATE public.office_room_physicians SET id = gen_random_uuid() WHERE id IS NULL;

ALTER TABLE public.office_room_physicians
  ALTER COLUMN id SET NOT NULL,
  ADD PRIMARY KEY (id);

CREATE UNIQUE INDEX office_room_physicians_staff_role_unique
  ON public.office_room_physicians(room_id, staff_role_id)
  WHERE staff_role_id IS NOT NULL;

CREATE INDEX office_room_physicians_staff_role_idx
  ON public.office_room_physicians(staff_role_id);

-- ============================================================
-- 7. queue_configs (physician_id → staff_role_id)
-- ============================================================

ALTER TABLE public.queue_configs
  ADD COLUMN staff_role_id uuid REFERENCES public.staff_roles(id) ON DELETE CASCADE;

UPDATE public.queue_configs qc
SET staff_role_id = ph.staff_role_id
FROM public.physicians ph
WHERE ph.id = qc.physician_id
  AND ph.staff_role_id IS NOT NULL;

ALTER TABLE public.queue_configs
  ALTER COLUMN physician_id DROP NOT NULL;

-- Update unique constraints
ALTER TABLE public.queue_configs
  DROP CONSTRAINT IF EXISTS queue_config_physician_date_unique;

CREATE UNIQUE INDEX queue_config_staff_role_date_unique
  ON public.queue_configs(hospital_id, staff_role_id, queue_date)
  WHERE staff_role_id IS NOT NULL;

CREATE INDEX queue_configs_staff_role_idx
  ON public.queue_configs(staff_role_id);

-- ============================================================
-- 8. physician_recent_patients (physician_id → staff_role_id)
-- ============================================================

ALTER TABLE public.physician_recent_patients
  ADD COLUMN staff_role_id uuid REFERENCES public.staff_roles(id) ON DELETE CASCADE;

UPDATE public.physician_recent_patients prp
SET staff_role_id = ph.staff_role_id
FROM public.physicians ph
WHERE ph.id = prp.physician_id
  AND ph.staff_role_id IS NOT NULL;

ALTER TABLE public.physician_recent_patients
  ALTER COLUMN physician_id DROP NOT NULL;

-- Drop old unique and replace
ALTER TABLE public.physician_recent_patients
  DROP CONSTRAINT IF EXISTS physician_recent_patients_physician_id_patient_id_key;

CREATE UNIQUE INDEX physician_recent_patients_staff_role_patient_unique
  ON public.physician_recent_patients(staff_role_id, patient_id)
  WHERE staff_role_id IS NOT NULL;

-- Update RLS policies to use staff_role_id
DROP POLICY IF EXISTS "recent_patients_select" ON public.physician_recent_patients;
DROP POLICY IF EXISTS "recent_patients_insert" ON public.physician_recent_patients;
DROP POLICY IF EXISTS "recent_patients_update" ON public.physician_recent_patients;
DROP POLICY IF EXISTS "recent_patients_delete" ON public.physician_recent_patients;

CREATE POLICY "recent_patients_select" ON public.physician_recent_patients
  FOR SELECT TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND staff_role_id = public.get_my_staff_role_id()
  );

CREATE POLICY "recent_patients_insert" ON public.physician_recent_patients
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND staff_role_id = public.get_my_staff_role_id()
  );

CREATE POLICY "recent_patients_update" ON public.physician_recent_patients
  FOR UPDATE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND staff_role_id = public.get_my_staff_role_id()
  );

CREATE POLICY "recent_patients_delete" ON public.physician_recent_patients
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND staff_role_id = public.get_my_staff_role_id()
  );

-- ============================================================
-- 9. Update generate_slots RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_slots(
  p_schedule_id uuid,
  p_from_date   date DEFAULT current_date,
  p_to_date     date DEFAULT current_date + interval '30 days'
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule      record;
  v_current_date  date;
  v_slot_time     timestamptz;
  v_end_time      timestamptz;
  v_slots_created int := 0;
  v_day_of_week   int;
BEGIN
  SELECT * INTO v_schedule
  FROM public.physician_schedules
  WHERE id = p_schedule_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule not found: %', p_schedule_id;
  END IF;

  IF v_schedule.schedule_type != 'slots' THEN
    RAISE EXCEPTION 'generate_slots only applies to slot-based schedules';
  END IF;

  v_current_date := GREATEST(p_from_date, v_schedule.valid_from);

  WHILE v_current_date <= p_to_date
    AND (v_schedule.valid_to IS NULL OR v_current_date <= v_schedule.valid_to)
  LOOP
    v_day_of_week := EXTRACT(DOW FROM v_current_date)::int;

    IF v_day_of_week = ANY(v_schedule.days_of_week) THEN
      v_slot_time := (v_current_date + v_schedule.work_start)::timestamptz;
      v_end_time  := (v_current_date + v_schedule.work_end)::timestamptz;

      WHILE v_slot_time < v_end_time
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM public.physician_schedule_blocks
          WHERE staff_role_id = v_schedule.staff_role_id
            AND blocked_from <= v_slot_time
            AND blocked_to   >  v_slot_time
        ) THEN
          INSERT INTO public.schedule_slots (
            staff_role_id, hospital_id, slot_datetime, booking_count
          ) VALUES (
            v_schedule.staff_role_id,
            v_schedule.hospital_id,
            v_slot_time,
            0
          )
          ON CONFLICT (staff_role_id, slot_datetime) DO NOTHING;

          v_slots_created := v_slots_created + 1;
        END IF;

        v_slot_time := v_slot_time + (v_schedule.slot_duration_minutes || ' minutes')::interval;
      END LOOP;
    END IF;

    v_current_date := v_current_date + 1;
  END LOOP;

  RETURN v_slots_created;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'generate_slots failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 10. Update apply_block_to_existing_slots RPC
-- ============================================================

DROP FUNCTION IF EXISTS public.apply_block_to_existing_slots(uuid, uuid);

CREATE OR REPLACE FUNCTION public.apply_block_to_existing_slots(
  p_staff_role_id uuid,
  p_hospital_id   uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted1 int;
  v_deleted2 int;
BEGIN
  DELETE FROM public.schedule_slots ss
  WHERE ss.staff_role_id  = p_staff_role_id
    AND ss.hospital_id    = p_hospital_id
    AND ss.booking_count  = 0
    AND EXISTS (
      SELECT 1 FROM public.physician_schedule_blocks b
      WHERE b.staff_role_id = p_staff_role_id
        AND b.is_recurring  = false
        AND b.blocked_from <= ss.slot_datetime
        AND b.blocked_to   >  ss.slot_datetime
    );

  GET DIAGNOSTICS v_deleted1 = ROW_COUNT;

  DELETE FROM public.schedule_slots ss
  WHERE ss.staff_role_id  = p_staff_role_id
    AND ss.hospital_id    = p_hospital_id
    AND ss.booking_count  = 0
    AND EXISTS (
      SELECT 1 FROM public.physician_schedule_blocks b
      WHERE b.staff_role_id    = p_staff_role_id
        AND b.is_recurring     = true
        AND EXTRACT(DOW FROM ss.slot_datetime)::int = ANY(b.recur_days)
        AND b.recur_time_from <= ss.slot_datetime::time
        AND b.recur_time_to   >  ss.slot_datetime::time
        AND (b.blocked_from IS NULL OR b.blocked_from::date <= ss.slot_datetime::date)
        AND (b.blocked_to   IS NULL OR b.blocked_to::date   >= ss.slot_datetime::date)
    );

  GET DIAGNOSTICS v_deleted2 = ROW_COUNT;

  RETURN v_deleted1 + v_deleted2;
END;
$$;

-- ============================================================
-- 11. Update assign_queue_number RPC
-- ============================================================

DROP FUNCTION IF EXISTS public.assign_queue_number(uuid, uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.assign_queue_number(
  p_visit_service_id uuid,
  p_hospital_id      uuid,
  p_staff_role_id    uuid DEFAULT NULL,
  p_room_id          uuid DEFAULT NULL,
  p_queue_config_id  uuid DEFAULT NULL
)
RETURNS public.queue_numbers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_config_id uuid;
  v_next_number     int;
  v_queue_number    public.queue_numbers;
  v_today           date := current_date;
BEGIN
  IF p_queue_config_id IS NOT NULL THEN
    v_queue_config_id := p_queue_config_id;

  ELSIF p_staff_role_id IS NOT NULL THEN
    INSERT INTO public.queue_configs (
      hospital_id, staff_role_id, queue_date
    ) VALUES (
      p_hospital_id, p_staff_role_id, v_today
    )
    ON CONFLICT (hospital_id, staff_role_id, queue_date)
    DO UPDATE SET is_active = true
    RETURNING id INTO v_queue_config_id;

    IF v_queue_config_id IS NULL THEN
      SELECT id INTO v_queue_config_id
      FROM public.queue_configs
      WHERE hospital_id   = p_hospital_id
        AND staff_role_id = p_staff_role_id
        AND queue_date    = v_today;
    END IF;

  ELSIF p_room_id IS NOT NULL THEN
    INSERT INTO public.queue_configs (
      hospital_id, room_id, queue_date
    ) VALUES (
      p_hospital_id, p_room_id, v_today
    )
    ON CONFLICT (hospital_id, room_id, queue_date)
    DO UPDATE SET is_active = true
    RETURNING id INTO v_queue_config_id;

    IF v_queue_config_id IS NULL THEN
      SELECT id INTO v_queue_config_id
      FROM public.queue_configs
      WHERE hospital_id = p_hospital_id
        AND room_id     = p_room_id
        AND queue_date  = v_today;
    END IF;

  ELSE
    RAISE EXCEPTION
      'Must provide p_queue_config_id, p_staff_role_id, or p_room_id';
  END IF;

  IF v_queue_config_id IS NULL THEN
    RAISE EXCEPTION 'Could not resolve queue config';
  END IF;

  PERFORM id FROM public.queue_configs
  WHERE id = v_queue_config_id
  FOR UPDATE;

  SELECT COALESCE(MAX(queue_number), 0) + 1
  INTO v_next_number
  FROM public.queue_numbers
  WHERE queue_config_id = v_queue_config_id
    AND issued_at::date = v_today;

  INSERT INTO public.queue_numbers (
    queue_config_id,
    visit_service_id,
    hospital_id,
    queue_number,
    status
  ) VALUES (
    v_queue_config_id,
    p_visit_service_id,
    p_hospital_id,
    v_next_number,
    'waiting'
  )
  RETURNING * INTO v_queue_number;

  UPDATE public.visit_services
  SET queue_number = v_next_number
  WHERE id = p_visit_service_id;

  UPDATE public.queue_configs
  SET last_number = v_next_number,
      queue_date  = v_today
  WHERE id = v_queue_config_id;

  RETURN v_queue_number;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Queue number assignment failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 12. Update submit_prescriptions RPC
--     p_physician_id renamed to p_staff_role_id
--     physician_favorites now uses staff_role_id
-- ============================================================

DROP FUNCTION IF EXISTS public.submit_prescriptions(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.submit_prescriptions(
  p_hospitalization_id  uuid,
  p_hospital_id         uuid,
  p_staff_role_id       uuid
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
    WHERE hospitalization_id = p_hospitalization_id
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
      AND jsonb_array_length(v_prescription.schedule_times) > 0
      AND v_prescription.duration_days IS NOT NULL
      AND v_prescription.duration_days > 0
    THEN
      FOR v_day IN 0..(v_prescription.duration_days - 1)
      LOOP
        FOR v_slot IN SELECT * FROM jsonb_array_elements(v_prescription.schedule_times)
        LOOP
          v_slot_time := v_slot->>'time';
          v_slot_dose := v_slot->>'dose';
          v_slot_at := (v_prescription.start_date + v_day) + v_slot_time::interval;

          INSERT INTO public.drug_administration_slots(
            prescription_id, hospital_id,
            hospitalization_id, patient_id,
            scheduled_at, status, override_dose)
          VALUES (
            v_prescription.id, p_hospital_id,
            p_hospitalization_id, v_prescription.patient_id,
            v_slot_at, 'pending', NULLIF(v_slot_dose, '')
          );
        END LOOP;
      END LOOP;
    END IF;

    INSERT INTO public.physician_favorites
      (physician_id, drug_formulary_id, use_count, last_used_at)
    VALUES
      (v_caller_id, v_prescription.drug_formulary_id, 1, now())
    ON CONFLICT (physician_id, drug_formulary_id)
    DO UPDATE SET
      use_count    = physician_favorites.use_count + 1,
      last_used_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('submitted_count', v_count, 'success', true);

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'submit_prescriptions failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 13. Update get_my_staff_role_id() helper to be more robust
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_staff_role_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sr.id
  FROM public.staff_roles sr
  WHERE sr.person_id = public.get_my_person_id()
    AND sr.hospital_id = public.get_my_hospital_id()
    AND sr.is_active = true
  ORDER BY
    CASE sr.role_type
      WHEN 'physician' THEN 1
      WHEN 'functional_diagnostics_physician' THEN 2
      WHEN 'lab_physician' THEN 3
      WHEN 'inpatient_nurse' THEN 4
      WHEN 'head_nurse' THEN 5
      ELSE 6
    END
  LIMIT 1
$$;

