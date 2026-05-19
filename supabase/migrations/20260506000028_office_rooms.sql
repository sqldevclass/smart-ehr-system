-- Migration 028: Office Room support
-- Adds office room concept: shared clinical spaces with services and physicians
-- Reuses physician_schedules and schedule_slots with room_id
DROP FUNCTION IF EXISTS public.complete_service CASCADE;
DROP FUNCTION IF EXISTS public.generate_slots CASCADE;
-- ============================================================
-- 1. Add completed_by to visit_services
-- ============================================================

ALTER TABLE public.visit_services
  ADD COLUMN completed_by uuid REFERENCES public.profiles(id);

-- ============================================================
-- 2. Add is_office_room to room_types
-- ============================================================

ALTER TABLE public.room_types
  ADD COLUMN is_office_room boolean DEFAULT false;

-- Seed office room type for Kaiser Test
INSERT INTO public.room_types (hospital_id, name, is_office_room)
VALUES ('cf74311c-1827-4066-9376-f9270815c339', 'Office Room', true);

-- ============================================================
-- 3. Office Room Services
-- Links office rooms to services they can perform
-- ============================================================

CREATE TABLE public.office_room_services (
  room_id     uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  service_id  uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  granted_by  uuid REFERENCES public.profiles(id),
  granted_at  timestamptz DEFAULT now(),
  PRIMARY KEY (room_id, service_id)
);

CREATE INDEX office_room_services_room_idx ON public.office_room_services(room_id);
CREATE INDEX office_room_services_service_idx ON public.office_room_services(service_id);

ALTER TABLE public.office_room_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "office_room_services_select" ON public.office_room_services
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "office_room_services_insert" ON public.office_room_services
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_settings')
  );

CREATE POLICY "office_room_services_delete" ON public.office_room_services
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_settings')
  );

-- ============================================================
-- 4. Office Room Physicians
-- Links office rooms to physicians who can perform services there
-- ============================================================

CREATE TABLE public.office_room_physicians (
  room_id      uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  physician_id uuid NOT NULL REFERENCES public.physicians(id) ON DELETE CASCADE,
  hospital_id  uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  granted_by   uuid REFERENCES public.profiles(id),
  granted_at   timestamptz DEFAULT now(),
  PRIMARY KEY (room_id, physician_id)
);

CREATE INDEX office_room_physicians_room_idx ON public.office_room_physicians(room_id);
CREATE INDEX office_room_physicians_physician_idx ON public.office_room_physicians(physician_id);

ALTER TABLE public.office_room_physicians ENABLE ROW LEVEL SECURITY;

CREATE POLICY "office_room_physicians_select" ON public.office_room_physicians
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "office_room_physicians_insert" ON public.office_room_physicians
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_settings')
  );

CREATE POLICY "office_room_physicians_delete" ON public.office_room_physicians
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_settings')
  );

-- ============================================================
-- 5. Update physician_schedules to support room schedules
-- Make physician_id nullable, add room_id
-- Enforce: exactly one of physician_id or room_id must be set
-- ============================================================

ALTER TABLE public.physician_schedules
  ALTER COLUMN physician_id DROP NOT NULL,
  ADD COLUMN room_id uuid REFERENCES public.rooms(id) ON DELETE CASCADE;

ALTER TABLE public.physician_schedules
  ADD CONSTRAINT schedule_has_physician_or_room CHECK (
    (physician_id IS NOT NULL AND room_id IS NULL)
    OR (physician_id IS NULL AND room_id IS NOT NULL)
  );

CREATE INDEX physician_schedules_room_idx ON public.physician_schedules(room_id);

-- ============================================================
-- 6. Update schedule_slots to support room slots
-- Make physician_id nullable, add room_id
-- Enforce: exactly one must be set
-- ============================================================

ALTER TABLE public.schedule_slots
  ALTER COLUMN physician_id DROP NOT NULL,
  ADD COLUMN room_id uuid REFERENCES public.rooms(id) ON DELETE CASCADE;

ALTER TABLE public.schedule_slots
  ADD CONSTRAINT slot_has_physician_or_room CHECK (
    (physician_id IS NOT NULL AND room_id IS NULL)
    OR (physician_id IS NULL AND room_id IS NOT NULL)
  );

-- Drop old unique constraint and recreate to handle both physician and room
ALTER TABLE public.schedule_slots
  DROP CONSTRAINT schedule_slots_physician_id_slot_datetime_key;

ALTER TABLE public.schedule_slots
  ADD CONSTRAINT schedule_slots_physician_slot_unique
    UNIQUE NULLS NOT DISTINCT (physician_id, slot_datetime),
  ADD CONSTRAINT schedule_slots_room_slot_unique
    UNIQUE NULLS NOT DISTINCT (room_id, slot_datetime);

CREATE INDEX schedule_slots_room_idx ON public.schedule_slots(room_id);

-- ============================================================
-- 7. Update complete_service RPC to set completed_by
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_service(
  p_visit_service_id uuid,
  p_completed_by     uuid
)
RETURNS public.visit_services
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service          public.visit_services;
  v_completed_status uuid;
  v_ready_status     uuid;
BEGIN
  SELECT id INTO v_completed_status
  FROM public.service_statuses WHERE code = 'completed';

  SELECT id INTO v_ready_status
  FROM public.service_statuses WHERE code = 'ready_for_execution';

  SELECT * INTO v_service
  FROM public.visit_services
  WHERE id = p_visit_service_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit service not found: %', p_visit_service_id;
  END IF;

  IF v_service.status_id != v_ready_status THEN
    RAISE EXCEPTION 'Service must be in Ready for Execution status to complete. Current status id: %',
      v_service.status_id;
  END IF;

  UPDATE public.visit_services
  SET
    status_id    = v_completed_status,
    completed_at = now(),
    completed_by = p_completed_by
  WHERE id = p_visit_service_id
  RETURNING * INTO v_service;

  RETURN v_service;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Service completion failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 8. Update generate_slots RPC to support room slots
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
  v_is_blocked    boolean;
  v_block_reason  text;
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
        v_is_blocked   := false;
        v_block_reason := null;

        -- Check one-time blocks (physician or room)
        SELECT true, reason INTO v_is_blocked, v_block_reason
        FROM public.physician_schedule_blocks
        WHERE (
          (v_schedule.physician_id IS NOT NULL AND physician_id = v_schedule.physician_id)
          OR
          (v_schedule.room_id IS NOT NULL AND physician_id IS NULL)
        )
          AND is_recurring = false
          AND blocked_from <= v_slot_time
          AND blocked_to   >  v_slot_time
        LIMIT 1;

        -- Check recurring blocks
        IF NOT v_is_blocked THEN
          SELECT true, reason INTO v_is_blocked, v_block_reason
          FROM public.physician_schedule_blocks
          WHERE (
            (v_schedule.physician_id IS NOT NULL AND physician_id = v_schedule.physician_id)
            OR
            (v_schedule.room_id IS NOT NULL AND physician_id IS NULL)
          )
            AND is_recurring    = true
            AND v_day_of_week   = ANY(recur_days)
            AND recur_time_from <= v_slot_time::time
            AND recur_time_to   >  v_slot_time::time
            AND (blocked_from IS NULL OR blocked_from::date <= v_current_date)
            AND (blocked_to   IS NULL OR blocked_to::date   >= v_current_date)
          LIMIT 1;
        END IF;

        INSERT INTO public.schedule_slots (
          physician_id, room_id, hospital_id,
          slot_datetime, booking_count,
          is_blocked, block_reason
        ) VALUES (
          v_schedule.physician_id,
          v_schedule.room_id,
          v_schedule.hospital_id,
          v_slot_time,
          0,
          COALESCE(v_is_blocked, false),
          v_block_reason
        )
        ON CONFLICT DO NOTHING;

        v_slots_created := v_slots_created + 1;
        v_slot_time := v_slot_time + 
          (v_schedule.slot_duration_minutes || ' minutes')::interval;
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