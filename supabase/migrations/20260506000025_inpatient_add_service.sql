-- Migration 025: inpatient_add_service RPC
-- Called when physician orders a service for an inpatient
-- Finds or creates a visit linked to the hospitalization
-- Creates visit_service with status=ready_for_execution (inpatient bypass)

CREATE OR REPLACE FUNCTION public.inpatient_add_service(
  p_hospitalization_id    uuid,
  p_patient_id            uuid,
  p_hospital_id           uuid,
  p_ordered_by            uuid,
  p_service_id            uuid,
  p_assigned_physician_id uuid,
  p_cost_at_time          numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visit_id       uuid;
  v_vs_id          uuid;
  v_ready_status   uuid;
BEGIN
  -- Get ready_for_execution status
  SELECT id INTO v_ready_status
  FROM public.service_statuses
  WHERE code = 'ready_for_execution';

  -- Find existing inpatient visit for this hospitalization
  SELECT id INTO v_visit_id
  FROM public.visits
  WHERE patient_id        = p_patient_id
    AND hospital_id       = p_hospital_id
    AND visit_type        = 'inpatient'
    AND status           != 'cancelled'
  ORDER BY created_at ASC
  LIMIT 1;

  -- No visit exists — create one
  IF v_visit_id IS NULL THEN
    INSERT INTO public.visits (
      patient_id, hospital_id, visit_type,
      visit_date, total_amount, amount_paid, status
    ) VALUES (
      p_patient_id, p_hospital_id, 'inpatient',
      current_date, 0, 0, 'unpaid'
    )
    RETURNING id INTO v_visit_id;
  END IF;

  -- Create visit_service with ready_for_execution status
  INSERT INTO public.visit_services (
    visit_id, patient_id, hospital_id,
    service_id, hospitalization_id,
    assigned_physician_id, status_id,
    source, cost_at_time, created_by
  ) VALUES (
    v_visit_id, p_patient_id, p_hospital_id,
    p_service_id, p_hospitalization_id,
    p_assigned_physician_id, v_ready_status,
    'inpatient_physician', p_cost_at_time, p_ordered_by
  )
  RETURNING id INTO v_vs_id;

  -- Update visit total
  UPDATE public.visits
  SET total_amount = total_amount + p_cost_at_time
  WHERE id = v_visit_id;

  RETURN jsonb_build_object(
    'visit_id',         v_visit_id,
    'visit_service_id', v_vs_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'inpatient_add_service failed: %', SQLERRM;
END;
$$;