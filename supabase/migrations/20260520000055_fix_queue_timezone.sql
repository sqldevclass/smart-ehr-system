-- Migration 055: Fix queue date to use hospital timezone
-- Root cause: current_date uses UTC, hospitals may be in different timezone
-- Fix: derive today's date using hospital's configured timezone

CREATE OR REPLACE FUNCTION public.assign_queue_number(
  p_visit_service_id uuid,
  p_hospital_id      uuid,
  p_physician_id     uuid DEFAULT NULL,
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
  v_timezone        text;
  v_today           date;
BEGIN
  -- Get hospital timezone, default to UTC if not set
  SELECT COALESCE(timezone, 'UTC')
  INTO v_timezone
  FROM public.hospital_settings
  WHERE hospital_id = p_hospital_id;

  IF NOT FOUND THEN
    v_timezone := 'UTC';
  END IF;

  -- Derive today's date in hospital's local timezone
  v_today := (now() AT TIME ZONE v_timezone)::date;

  -- Step 1: Resolve or create queue_config atomically
  IF p_queue_config_id IS NOT NULL THEN
    v_queue_config_id := p_queue_config_id;

  ELSIF p_physician_id IS NOT NULL THEN
    INSERT INTO public.queue_configs (
      hospital_id, physician_id, queue_date
    ) VALUES (
      p_hospital_id, p_physician_id, v_today
    )
    ON CONFLICT (hospital_id, physician_id, queue_date)
    DO UPDATE SET is_active = true
    RETURNING id INTO v_queue_config_id;

    IF v_queue_config_id IS NULL THEN
      SELECT id INTO v_queue_config_id
      FROM public.queue_configs
      WHERE hospital_id  = p_hospital_id
        AND physician_id = p_physician_id
        AND queue_date   = v_today;
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
      'Must provide p_queue_config_id, p_physician_id, or p_room_id';
  END IF;

  IF v_queue_config_id IS NULL THEN
    RAISE EXCEPTION 'Could not resolve queue config';
  END IF;

  -- Step 2: Lock config row
  PERFORM id FROM public.queue_configs
  WHERE id = v_queue_config_id
  FOR UPDATE;

  -- Step 3: Derive next number from actual data for today
  SELECT COALESCE(MAX(queue_number), 0) + 1
  INTO v_next_number
  FROM public.queue_numbers
  WHERE queue_config_id = v_queue_config_id
    AND (issued_at AT TIME ZONE v_timezone)::date = v_today;

  -- Step 4: Insert queue number
  INSERT INTO public.queue_numbers (
    queue_config_id, visit_service_id,
    hospital_id, queue_number, status
  ) VALUES (
    v_queue_config_id, p_visit_service_id,
    p_hospital_id, v_next_number, 'waiting'
  )
  RETURNING * INTO v_queue_number;

  -- Step 5: Update visit_service
  UPDATE public.visit_services
  SET queue_number = v_next_number
  WHERE id = p_visit_service_id;

  -- Step 6: Keep last_number in sync
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