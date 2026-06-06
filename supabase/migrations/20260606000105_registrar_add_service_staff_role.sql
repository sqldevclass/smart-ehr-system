-- Migration 105: Update registrar_add_service RPC
-- Rename p_assigned_physician_id to p_assigned_staff_role_id
-- Update visit_services insert to use assigned_staff_role_id

DROP FUNCTION IF EXISTS public.registrar_add_service(uuid, uuid, uuid, uuid, uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.registrar_add_service(
  p_patient_id              uuid,
  p_hospital_id             uuid,
  p_created_by              uuid,
  p_service_id              uuid,
  p_assigned_staff_role_id  uuid,
  p_cost_at_time            numeric,
  p_registration_source     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visit_id       uuid;
  v_invoice_id     uuid;
  v_vs_id          uuid;
  v_preliminary    uuid;
BEGIN
  SELECT id INTO v_preliminary
  FROM public.service_statuses
  WHERE code = 'preliminary';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'preliminary status not found';
  END IF;

  SELECT id INTO v_visit_id
  FROM public.visits
  WHERE patient_id   = p_patient_id
    AND hospital_id  = p_hospital_id
    AND visit_date   = current_date
    AND status IN ('unpaid', 'partial')
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_visit_id IS NULL THEN
    INSERT INTO public.visits (
      patient_id, hospital_id, visit_type,
      visit_date, total_amount, amount_paid, status,
      registration_source
    ) VALUES (
      p_patient_id, p_hospital_id, 'outpatient',
      current_date, 0, 0, 'unpaid',
      p_registration_source
    )
    RETURNING id INTO v_visit_id;
  END IF;

  SELECT id INTO v_invoice_id
  FROM public.invoices
  WHERE visit_id = v_visit_id
    AND status   = 'active'
  LIMIT 1;

  IF v_invoice_id IS NULL THEN
    INSERT INTO public.invoices (visit_id, hospital_id, created_by)
    VALUES (v_visit_id, p_hospital_id, p_created_by)
    RETURNING id INTO v_invoice_id;
  END IF;

  INSERT INTO public.visit_services (
    visit_id, patient_id, hospital_id,
    service_id, assigned_staff_role_id,
    status_id, source, cost_at_time, created_by
  ) VALUES (
    v_visit_id, p_patient_id, p_hospital_id,
    p_service_id, p_assigned_staff_role_id,
    v_preliminary, 'registrar',
    p_cost_at_time, p_created_by
  )
  RETURNING id INTO v_vs_id;

  INSERT INTO public.invoice_items (invoice_id, visit_service_id, amount)
  VALUES (v_invoice_id, v_vs_id, p_cost_at_time);

  UPDATE public.visits
  SET total_amount = total_amount + p_cost_at_time
  WHERE id = v_visit_id;

  RETURN jsonb_build_object(
    'visit_id',         v_visit_id,
    'visit_service_id', v_vs_id,
    'invoice_id',       v_invoice_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'registrar_add_service failed: %', SQLERRM;
END;
$$;
