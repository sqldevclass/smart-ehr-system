-- Migration 017: registrar_add_service RPC
-- Called when registrar adds a service to a patient.
-- Atomically:
--   1. Finds today's open (unpaid/partial) visit for this patient
--   2. If none exists: creates a new visit
--   3. Finds or creates an active invoice for that visit
--   4. Creates the visit_service
--   5. Creates the invoice_item
--   6. Updates the visit total
-- Returns the visit_id

CREATE OR REPLACE FUNCTION public.registrar_add_service(
  p_patient_id          uuid,
  p_hospital_id         uuid,
  p_created_by          uuid,
  p_service_id          uuid,
  p_assigned_physician_id uuid,
  p_cost_at_time        numeric,
  p_registration_source text DEFAULT NULL
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
  -- Get preliminary status id
  SELECT id INTO v_preliminary
  FROM public.service_statuses
  WHERE code = 'preliminary';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'preliminary status not found';
  END IF;

  -- Find today's open visit for this patient
  SELECT id INTO v_visit_id
  FROM public.visits
  WHERE patient_id   = p_patient_id
    AND hospital_id  = p_hospital_id
    AND visit_date   = current_date
    AND status IN ('unpaid', 'partial')
  ORDER BY created_at ASC
  LIMIT 1;

  -- No open visit today — create one
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

  -- Find or create active invoice for this visit
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

  -- Create visit_service
  INSERT INTO public.visit_services (
    visit_id, patient_id, hospital_id,
    service_id, assigned_physician_id,
    status_id, source, cost_at_time, created_by
  ) VALUES (
    v_visit_id, p_patient_id, p_hospital_id,
    p_service_id, p_assigned_physician_id,
    v_preliminary, 'registrar',
    p_cost_at_time, p_created_by
  )
  RETURNING id INTO v_vs_id;

  -- Create invoice item
  INSERT INTO public.invoice_items (invoice_id, visit_service_id, amount)
  VALUES (v_invoice_id, v_vs_id, p_cost_at_time);

  -- Update visit total
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