-- Migration 106: Update remaining RPCs from assigned_physician_id to assigned_staff_role_id
-- Covers: inpatient_add_service, inpatient_order_service,
--         registrar_assign_physician_order, physician_order_services,
--         complete_document (document_participants physician_id reference)

-- ============================================================
-- 1. inpatient_add_service
-- ============================================================

DROP FUNCTION IF EXISTS public.inpatient_add_service(uuid, uuid, uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.inpatient_add_service(
  p_hospitalization_id    uuid,
  p_patient_id            uuid,
  p_hospital_id           uuid,
  p_service_id            uuid,
  p_ordered_by            uuid,
  p_assigned_staff_role_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id   uuid;
  v_vs_id        uuid;
  v_cost         numeric;
  v_ready_status uuid;
BEGIN
  SELECT id INTO v_ready_status
  FROM public.service_statuses
  WHERE code = 'ready_for_execution';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ready_for_execution status not found';
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
    visit_id, patient_id, hospital_id,
    service_id, assigned_staff_role_id,
    status_id, source, cost_at_time, created_by
  ) VALUES (
    NULL, p_patient_id, p_hospital_id,
    p_service_id, p_assigned_staff_role_id,
    v_ready_status, 'physician', v_cost, p_ordered_by
  )
  RETURNING id INTO v_vs_id;

  INSERT INTO public.invoice_items (invoice_id, visit_service_id, amount)
  VALUES (v_invoice_id, v_vs_id, v_cost);

  UPDATE public.hospitalizations
  SET total_charges = COALESCE(total_charges, 0) + v_cost
  WHERE id = p_hospitalization_id;

  RETURN jsonb_build_object(
    'visit_service_id', v_vs_id,
    'invoice_id', v_invoice_id,
    'cost', v_cost
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'inpatient_add_service failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 2. inpatient_order_service
-- ============================================================

DROP FUNCTION IF EXISTS public.inpatient_order_service(uuid, uuid, uuid, uuid, uuid, uuid);

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
  v_invoice_id   uuid;
  v_vs_id        uuid;
  v_cost         numeric;
  v_ready_status uuid;
BEGIN
  SELECT id INTO v_ready_status
  FROM public.service_statuses
  WHERE code = 'ready_for_execution';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ready_for_execution status not found';
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
    visit_id, patient_id, hospital_id,
    service_id, assigned_staff_role_id,
    status_id, source, cost_at_time, created_by
  ) VALUES (
    NULL, p_patient_id, p_hospital_id,
    p_service_id, p_assigned_staff_role_id,
    v_ready_status, 'physician', v_cost, p_ordered_by
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

-- ============================================================
-- 3. registrar_assign_physician_order
-- ============================================================

DROP FUNCTION IF EXISTS public.registrar_assign_physician_order(uuid, uuid, uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.registrar_assign_physician_order(
  p_visit_service_id       uuid,
  p_patient_id             uuid,
  p_hospital_id            uuid,
  p_assigned_by            uuid,
  p_assigned_staff_role_id uuid DEFAULT NULL,
  p_assigned_room_id       uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visit_id           uuid;
  v_cost               numeric;
  v_ordered_from_vs_id uuid;
  v_parent_visit_id    uuid;
BEGIN
  IF p_assigned_staff_role_id IS NULL AND p_assigned_room_id IS NULL THEN
    RAISE EXCEPTION 'Must provide either p_assigned_staff_role_id or p_assigned_room_id';
  END IF;

  SELECT cost_at_time, ordered_from_visit_service_id
  INTO v_cost, v_ordered_from_vs_id
  FROM public.visit_services
  WHERE id = p_visit_service_id AND hospital_id = p_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit service not found: %', p_visit_service_id;
  END IF;

  IF v_ordered_from_vs_id IS NOT NULL THEN
    SELECT visit_id INTO v_parent_visit_id
    FROM public.visit_services
    WHERE id = v_ordered_from_vs_id;
  END IF;

  SELECT id INTO v_visit_id
  FROM public.visits
  WHERE patient_id  = p_patient_id
    AND hospital_id = p_hospital_id
    AND visit_date  = current_date
    AND status IN ('unpaid', 'partial')
    AND (v_parent_visit_id IS NULL OR parent_visit_id = v_parent_visit_id)
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_visit_id IS NULL THEN
    INSERT INTO public.visits (
      patient_id, hospital_id, visit_type,
      visit_date, total_amount, amount_paid, status,
      parent_visit_id, parent_visit_service_id
    ) VALUES (
      p_patient_id, p_hospital_id, 'outpatient',
      current_date, 0, 0, 'unpaid',
      v_parent_visit_id, v_ordered_from_vs_id
    )
    RETURNING id INTO v_visit_id;
  END IF;

  UPDATE public.visit_services
  SET visit_id                = v_visit_id,
      assigned_staff_role_id  = p_assigned_staff_role_id,
      assigned_room_id        = p_assigned_room_id
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

-- ============================================================
-- 4. physician_order_services
-- (uses NULL for assigned_staff_role_id — orders have no pre-assigned physician)
-- ============================================================

DROP FUNCTION IF EXISTS public.physician_order_services CASCADE;

CREATE OR REPLACE FUNCTION public.physician_order_services(
  p_patient_id              uuid,
  p_hospital_id             uuid,
  p_ordered_by              uuid,
  p_services                jsonb,
  p_source_visit_service_id uuid DEFAULT NULL
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preliminary uuid;
  v_item        jsonb;
  v_vs_id       uuid;
  v_vs_ids      uuid[] := '{}';
BEGIN
  SELECT id INTO v_preliminary
  FROM public.service_statuses
  WHERE code = 'preliminary';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'preliminary status not found';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_services)
  LOOP
    INSERT INTO public.visit_services (
      visit_id, patient_id, hospital_id,
      service_id, assigned_staff_role_id,
      status_id, source, cost_at_time, created_by,
      ordered_from_visit_service_id
    ) VALUES (
      NULL, p_patient_id, p_hospital_id,
      (v_item->>'service_id')::uuid,
      NULL,
      v_preliminary, 'physician',
      (v_item->>'cost_at_time')::numeric,
      p_ordered_by,
      p_source_visit_service_id
    )
    RETURNING id INTO v_vs_id;

    v_vs_ids := array_append(v_vs_ids, v_vs_id);
  END LOOP;

  RETURN v_vs_ids;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'physician_order_services failed: %', SQLERRM;
END;
$$;

