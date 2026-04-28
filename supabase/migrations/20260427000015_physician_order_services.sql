-- Migration 015: physician_order_services RPC
-- When a physician orders additional services for a patient,
-- this function atomically creates a NEW visit + invoice + visit_services.
-- A paid visit is closed. Additional orders always open a fresh unpaid visit.

CREATE OR REPLACE FUNCTION public.physician_order_services(
  p_patient_id          uuid,
  p_hospital_id         uuid,
  p_ordered_by          uuid,
  p_services            jsonb  
  -- array of {service_id, assigned_physician_id, cost_at_time}
)
RETURNS uuid  -- returns the new visit_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visit_id       uuid;
  v_invoice_id     uuid;
  v_vs_id          uuid;
  v_preliminary    uuid;
  v_total          numeric := 0;
  v_item           jsonb;
BEGIN
  -- Get preliminary status id
  SELECT id INTO v_preliminary
  FROM public.service_statuses
  WHERE code = 'preliminary';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'preliminary status not found in service_statuses';
  END IF;

  -- Calculate total
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_services)
  LOOP
    v_total := v_total + (v_item->>'cost_at_time')::numeric;
  END LOOP;

  -- Create new visit
  INSERT INTO public.visits (
    patient_id,
    hospital_id,
    visit_type,
    visit_date,
    total_amount,
    amount_paid,
    status
  ) VALUES (
    p_patient_id,
    p_hospital_id,
    'outpatient',
    current_date,
    v_total,
    0,
    'unpaid'
  )
  RETURNING id INTO v_visit_id;

  -- Create invoice
  INSERT INTO public.invoices (
    visit_id,
    hospital_id,
    created_by
  ) VALUES (
    v_visit_id,
    p_hospital_id,
    p_ordered_by
  )
  RETURNING id INTO v_invoice_id;

  -- Create visit_services and invoice_items for each ordered service
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_services)
  LOOP
    INSERT INTO public.visit_services (
      visit_id,
      patient_id,
      hospital_id,
      service_id,
      assigned_physician_id,
      status_id,
      source,
      cost_at_time,
      created_by
    ) VALUES (
      v_visit_id,
      p_patient_id,
      p_hospital_id,
      (v_item->>'service_id')::uuid,
      (v_item->>'assigned_physician_id')::uuid,
      v_preliminary,
      'physician',
      (v_item->>'cost_at_time')::numeric,
      p_ordered_by
    )
    RETURNING id INTO v_vs_id;

    INSERT INTO public.invoice_items (
      invoice_id,
      visit_service_id,
      amount
    ) VALUES (
      v_invoice_id,
      v_vs_id,
      (v_item->>'cost_at_time')::numeric
    );
  END LOOP;

  RETURN v_visit_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'physician_order_services failed: %', SQLERRM;
END;
$$;