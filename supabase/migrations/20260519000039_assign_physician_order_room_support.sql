-- Migration 039: Add room assignment support to registrar_assign_physician_order
-- Allows registrar to assign an office room instead of a physician
-- when scheduling a physician-ordered service

DROP FUNCTION IF EXISTS public.registrar_assign_physician_order CASCADE;

CREATE OR REPLACE FUNCTION public.registrar_assign_physician_order(
  p_visit_service_id      uuid,
  p_patient_id            uuid,
  p_hospital_id           uuid,
  p_assigned_by           uuid,
  p_assigned_physician_id uuid DEFAULT NULL,
  p_assigned_room_id      uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visit_id uuid;
  v_cost     numeric;
BEGIN
  IF p_assigned_physician_id IS NULL AND p_assigned_room_id IS NULL THEN
    RAISE EXCEPTION 'Must provide either p_assigned_physician_id or p_assigned_room_id';
  END IF;

  SELECT cost_at_time INTO v_cost
  FROM public.visit_services
  WHERE id = p_visit_service_id
    AND hospital_id = p_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit service not found: %', p_visit_service_id;
  END IF;

  -- Find or create today's open visit
  SELECT id INTO v_visit_id
  FROM public.visits
  WHERE patient_id  = p_patient_id
    AND hospital_id = p_hospital_id
    AND visit_date  = current_date
    AND status IN ('unpaid', 'partial')
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_visit_id IS NULL THEN
    INSERT INTO public.visits (
      patient_id, hospital_id, visit_type,
      visit_date, total_amount, amount_paid, status
    ) VALUES (
      p_patient_id, p_hospital_id, 'outpatient',
      current_date, 0, 0, 'unpaid'
    )
    RETURNING id INTO v_visit_id;
  END IF;

  UPDATE public.visit_services
  SET visit_id              = v_visit_id,
      assigned_physician_id = p_assigned_physician_id,
      assigned_room_id      = p_assigned_room_id
  WHERE id = p_visit_service_id;

  UPDATE public.visits
  SET total_amount = total_amount + v_cost
  WHERE id = v_visit_id;

  RETURN jsonb_build_object(
    'visit_id',         v_visit_id,
    'visit_service_id', p_visit_service_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'registrar_assign_physician_order failed: %', SQLERRM;
END;
$$;