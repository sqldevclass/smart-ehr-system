-- Migration 163: assign_queue_number never set
-- visit_services.scheduled_at. MyPatientsList.tsx's date filter
-- falls back to visits.visit_date when scheduled_at is null, but
-- that's also null for inpatient-originated orders (no visit_id).
-- So a queue-assigned inpatient consultation had nothing to filter
-- on and was invisible on every date. A queue assignment is
-- inherently "today" (v_today is used throughout this function for
-- the queue itself) — stamping scheduled_at = now() makes it flow
-- through the existing date filter with no frontend special-casing.

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
  SET queue_number = v_next_number,
      scheduled_at = now()
  WHERE id = p_visit_service_id;

  UPDATE public.queue_configs
  SET last_number = v_next_number,
      queue_date  = v_today
  WHERE id = v_queue_config_id;

  RETURN v_queue_number;
END;
$$;
