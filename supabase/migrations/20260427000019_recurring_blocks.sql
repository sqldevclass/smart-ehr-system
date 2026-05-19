DROP FUNCTION IF EXISTS public.generate_slots CASCADE;

-- Migration 019: Add recurring block support to physician_schedule_blocks

ALTER TABLE public.physician_schedule_blocks
  ADD COLUMN is_recurring   boolean DEFAULT false,
  ADD COLUMN recur_days     int[],
  ADD COLUMN recur_time_from time,
  ADD COLUMN recur_time_to   time;

-- Add constraint: recurring blocks must have recur_days and times
ALTER TABLE public.physician_schedule_blocks
  ADD CONSTRAINT recurring_block_fields CHECK (
    (is_recurring = false)
    OR (
      is_recurring = true
      AND recur_days IS NOT NULL
      AND recur_time_from IS NOT NULL
      AND recur_time_to IS NOT NULL
    )
  );

-- Update generate_slots to respect recurring blocks
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
        -- Check one-time blocks
        IF NOT EXISTS (
          SELECT 1 FROM public.physician_schedule_blocks
          WHERE physician_id  = v_schedule.physician_id
            AND is_recurring  = false
            AND blocked_from <= v_slot_time
            AND blocked_to   >  v_slot_time
        )
        -- Check recurring blocks
        AND NOT EXISTS (
          SELECT 1 FROM public.physician_schedule_blocks
          WHERE physician_id    = v_schedule.physician_id
            AND is_recurring    = true
            AND v_day_of_week   = ANY(recur_days)
            AND recur_time_from <= v_slot_time::time
            AND recur_time_to   >  v_slot_time::time
            AND (blocked_from IS NULL OR blocked_from::date <= v_current_date)
            AND (blocked_to   IS NULL OR blocked_to::date   >= v_current_date)
        )
        THEN
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