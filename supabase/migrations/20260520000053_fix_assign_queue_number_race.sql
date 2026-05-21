-- Migration 053: Fix race condition in assign_queue_number
-- Root cause: date reset and increment were separate statements
-- without row locking, allowing concurrent calls to get same number.
-- Fix: SELECT FOR UPDATE locks the row for the entire transaction.

CREATE OR REPLACE FUNCTION public.assign_queue_number(
  p_queue_config_id  uuid,
  p_visit_service_id uuid,
  p_hospital_id      uuid
)
RETURNS public.queue_numbers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_number  int;
  v_queue_number public.queue_numbers;
  v_config       public.queue_configs;
BEGIN
  -- Lock the queue_config row for this entire transaction
  -- Prevents concurrent calls from getting the same number
  SELECT * INTO v_config
  FROM public.queue_configs
  WHERE id = p_queue_config_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue config not found: %',
      p_queue_config_id;
  END IF;

  -- Reset counter if date has changed
  IF v_config.queue_date < current_date THEN
    UPDATE public.queue_configs
    SET last_number = 0,
        queue_date  = current_date,
        reset_at    = now()
    WHERE id = p_queue_config_id;
    v_config.last_number := 0;
  END IF;

  -- Increment atomically (row is locked)
  v_next_number := v_config.last_number + 1;

  UPDATE public.queue_configs
  SET last_number = v_next_number
  WHERE id = p_queue_config_id;

  INSERT INTO public.queue_numbers (
    queue_config_id, visit_service_id,
    hospital_id, queue_number, status
  ) VALUES (
    p_queue_config_id, p_visit_service_id,
    p_hospital_id, v_next_number, 'waiting'
  )
  RETURNING * INTO v_queue_number;

  UPDATE public.visit_services
  SET queue_number = v_next_number
  WHERE id = p_visit_service_id;

  RETURN v_queue_number;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Queue number assignment failed: %',
      SQLERRM;
END;
$$;