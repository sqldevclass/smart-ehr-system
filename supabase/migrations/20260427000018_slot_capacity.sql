-- Migration 018: Add booking_count to schedule_slots
-- Supports up to 2 patients per slot (0=free, 1=first booked, 2=full)
-- Add is_waitlist to visit_services to track second-patient bookings

-- Add booking_count to schedule_slots
ALTER TABLE public.schedule_slots
  DROP COLUMN is_booked,
  ADD COLUMN booking_count int DEFAULT 0 CHECK (booking_count BETWEEN 0 AND 2);

-- Add slot reference and waitlist flag to visit_services
ALTER TABLE public.visit_services
  ADD COLUMN slot_id uuid REFERENCES public.schedule_slots(id) ON DELETE SET NULL,
  ADD COLUMN is_waitlist boolean DEFAULT false;

CREATE INDEX visit_services_slot_idx ON public.visit_services(slot_id);

-- ============================================================
-- book_slot RPC
-- Atomically books a slot for a patient
-- Returns: slot booking result with waitlist status
-- ============================================================

CREATE OR REPLACE FUNCTION public.book_slot(
  p_slot_id            uuid,
  p_visit_service_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_count int;
  v_is_waitlist   boolean;
BEGIN
  -- Lock slot row and get current count
  SELECT booking_count INTO v_booking_count
  FROM public.schedule_slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Slot not found: %', p_slot_id;
  END IF;

  IF v_booking_count >= 2 THEN
    RAISE EXCEPTION 'Slot is full — maximum 2 patients per slot';
  END IF;

  -- Determine if this is a waitlist booking
  v_is_waitlist := (v_booking_count = 1);

  -- Increment booking count
  UPDATE public.schedule_slots
  SET booking_count = booking_count + 1
  WHERE id = p_slot_id;

  -- Link visit_service to slot and set waitlist flag
  UPDATE public.visit_services
  SET slot_id     = p_slot_id,
      is_waitlist = v_is_waitlist,
      scheduled_at = (
        SELECT slot_datetime FROM public.schedule_slots WHERE id = p_slot_id
      )
  WHERE id = p_visit_service_id;

  RETURN jsonb_build_object(
    'slot_id',     p_slot_id,
    'is_waitlist', v_is_waitlist,
    'booking_count', v_booking_count + 1
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'book_slot failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- generate_slots RPC
-- Called by HR after creating a physician schedule
-- Generates schedule_slots rows for a date range
-- Respects schedule_blocks (lunch, vacation)
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_slots(
  p_schedule_id uuid,
  p_from_date   date DEFAULT current_date,
  p_to_date     date DEFAULT current_date + interval '30 days'
)
RETURNS int  -- returns number of slots generated
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
  -- Fetch schedule
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

    -- Check if this day of week is in schedule
    IF v_day_of_week = ANY(v_schedule.days_of_week) THEN
      v_slot_time := (v_current_date + v_schedule.work_start)::timestamptz;
      v_end_time  := (v_current_date + v_schedule.work_end)::timestamptz;

      WHILE v_slot_time < v_end_time
      LOOP
        -- Skip if blocked
        IF NOT EXISTS (
          SELECT 1 FROM public.physician_schedule_blocks
          WHERE physician_id = v_schedule.physician_id
            AND blocked_from <= v_slot_time
            AND blocked_to   >  v_slot_time
        ) THEN
          INSERT INTO public.schedule_slots (
            physician_id, hospital_id, slot_datetime, booking_count
          ) VALUES (
            v_schedule.physician_id,
            v_schedule.hospital_id,
            v_slot_time,
            0
          )
          ON CONFLICT (physician_id, slot_datetime) DO NOTHING;

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