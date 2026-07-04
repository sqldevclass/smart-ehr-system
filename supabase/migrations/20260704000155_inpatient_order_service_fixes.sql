-- Migration 155: Two fixes to inpatient_order_service, bundled
-- since both require replacing the same function body:
--
-- 1. Per Workflow_laboratory_updated.docx: the attending inpatient
--    physician should open a service at 'preliminary' (not jump
--    straight to 'ready_for_execution'). The ward nurse's draw
--    action is what advances it to 'ready_for_execution' — that
--    step doesn't exist in the app yet and is being built
--    separately; this migration only fixes the starting status.
--
-- 2. hospitalization_id was never set on the visit_services INSERT
--    — confirmed bug, silently mis-tagging every inpatient-ordered
--    lab/consultation service as outpatient in any code that
--    splits current/history by hospitalization_id (e.g.
--    TreatmentCarePlanModal's Лаборатория/Консультация columns).

CREATE OR REPLACE FUNCTION public.inpatient_order_service(
  p_hospitalization_id     uuid,
  p_patient_id             uuid,
  p_hospital_id            uuid,
  p_service_id             uuid,
  p_ordered_by             uuid,
  p_assigned_staff_role_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id       uuid;
  v_vs_id            uuid;
  v_cost             numeric;
  v_preliminary_status uuid;
BEGIN
  SELECT id INTO v_preliminary_status
  FROM public.service_statuses
  WHERE code = 'preliminary';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'preliminary status not found';
  END IF;

  SELECT cost_with_vat INTO v_cost
  FROM public.services
  WHERE id = p_service_id AND hospital_id = p_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found: %', p_service_id;
  END IF;

  SELECT id INTO v_invoice_id
  FROM public.invoices
  WHERE hospitalization_id = p_hospitalization_id
    AND hospital_id = p_hospital_id
    AND status = 'active'
  LIMIT 1;

  IF v_invoice_id IS NULL THEN
    INSERT INTO public.invoices (hospitalization_id, hospital_id, created_by, status)
    VALUES (p_hospitalization_id, p_hospital_id, p_ordered_by, 'active')
    RETURNING id INTO v_invoice_id;
  END IF;

  INSERT INTO public.visit_services (
    visit_id, patient_id, hospital_id, hospitalization_id,
    service_id, assigned_staff_role_id,
    status_id, source, cost_at_time, created_by
  ) VALUES (
    NULL, p_patient_id, p_hospital_id, p_hospitalization_id,
    p_service_id, p_assigned_staff_role_id,
    v_preliminary_status, 'physician', v_cost, p_ordered_by
  )
  RETURNING id INTO v_vs_id;

  INSERT INTO public.invoice_items (invoice_id, visit_service_id, amount)
  VALUES (v_invoice_id, v_vs_id, v_cost);

  RETURN jsonb_build_object(
    'visit_service_id', v_vs_id,
    'invoice_id', v_invoice_id,
    'cost', v_cost
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'inpatient_order_service failed: %', SQLERRM;
END;
$$;
