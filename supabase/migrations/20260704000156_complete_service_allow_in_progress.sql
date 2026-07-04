-- Migration 156: complete_service currently only allows completing
-- a service from 'ready_for_execution', rejecting everything else
-- — including 'in_progress', which blocks the doc's intended
-- 4-status lifecycle (ready → in_progress → completed) from ever
-- being usable. Loosen the precondition to accept either.
--
-- Existing 'completed' rows are unaffected — this function only
-- runs going forward on services that haven't completed yet.

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
  v_service            public.visit_services;
  v_completed_status   uuid;
  v_ready_status       uuid;
  v_in_progress_status uuid;
BEGIN
  SELECT id INTO v_completed_status
  FROM public.service_statuses WHERE code = 'completed';

  SELECT id INTO v_ready_status
  FROM public.service_statuses WHERE code = 'ready_for_execution';

  SELECT id INTO v_in_progress_status
  FROM public.service_statuses WHERE code = 'in_progress';

  SELECT * INTO v_service
  FROM public.visit_services
  WHERE id = p_visit_service_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit service not found: %', p_visit_service_id;
  END IF;

  -- Allow completion from either ready_for_execution (today's
  -- outpatient path, which never actually passes through
  -- in_progress at the visit_services level) or in_progress
  -- (the inpatient ward-draw -> lab-receive path being built).
  IF v_service.status_id NOT IN (v_ready_status, v_in_progress_status) THEN
    RAISE EXCEPTION 'Service must be in Ready for Execution or In Progress status to complete. Current status id: %',
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
