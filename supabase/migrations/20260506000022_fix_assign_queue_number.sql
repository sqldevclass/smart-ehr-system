-- Migration 022: Fix assign_queue_number to also update visit_services.queue_number
-- Previously only created queue_numbers row but didn't update visit_services

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
  v_next_number int;
  v_queue_number public.queue_numbers;
BEGIN
  UPDATE public.queue_configs
  SET last_number = last_number + 1
  WHERE id = p_queue_config_id
  RETURNING last_number INTO v_next_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue config not found: %', p_queue_config_id;
  END IF;

  INSERT INTO public.queue_numbers (
    queue_config_id, visit_service_id, hospital_id, queue_number, status
  ) VALUES (
    p_queue_config_id, p_visit_service_id, p_hospital_id, v_next_number, 'waiting'
  )
  RETURNING * INTO v_queue_number;

  UPDATE public.visit_services
  SET queue_number = v_next_number
  WHERE id = p_visit_service_id;

  RETURN v_queue_number;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Queue number assignment failed: %', SQLERRM;
END;
$$;