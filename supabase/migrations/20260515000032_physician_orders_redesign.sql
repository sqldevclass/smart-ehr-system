-- Migration 032: Physician Orders Redesign
-- visit_services.visit_id is now nullable
-- physician_order_services no longer creates a visit
-- new registrar_assign_physician_order RPC assigns physician and moves service to visit
-- new registrar_invoice_visit RPC creates invoice for all services on a visit

-- ============================================================
-- 1. Make visit_id nullable
-- ============================================================

ALTER TABLE public.visit_services
  ALTER COLUMN visit_id DROP NOT NULL;

-- ============================================================
-- 2. Rewrite physician_order_services
-- No visit created — just visit_services with visit_id = NULL
-- ============================================================

CREATE OR REPLACE FUNCTION public.physician_order_services(
  p_patient_id  uuid,
  p_hospital_id uuid,
  p_ordered_by  uuid,
  p_services    jsonb
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
      visit_id,       -- NULL — no visit yet
      patient_id,
      hospital_id,
      service_id,
      assigned_physician_id,
      status_id,
      source,
      cost_at_time,
      created_by
    ) VALUES (
      NULL,
      p_patient_id,
      p_hospital_id,
      (v_item->>'service_id')::uuid,
      NULL,           -- registrar assigns physician later
      v_preliminary,
      'physician',
      (v_item->>'cost_at_time')::numeric,
      p_ordered_by
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

-- ============================================================
-- 3. registrar_assign_physician_order
-- Called by registrar when assigning a physician to a pending order
-- Finds or creates today's open visit, moves service to it
-- BookingModal then calls book_slot or assign_queue_number separately
-- ============================================================

CREATE OR REPLACE FUNCTION public.registrar_assign_physician_order(
  p_visit_service_id      uuid,
  p_assigned_physician_id uuid,
  p_patient_id            uuid,
  p_hospital_id           uuid,
  p_assigned_by           uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visit_id  uuid;
  v_cost      numeric;
BEGIN
  -- Get service cost
  SELECT cost_at_time INTO v_cost
  FROM public.visit_services
  WHERE id = p_visit_service_id
    AND hospital_id = p_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit service not found: %', p_visit_service_id;
  END IF;

  -- Find today's open visit (unpaid/partial)
  SELECT id INTO v_visit_id
  FROM public.visits
  WHERE patient_id  = p_patient_id
    AND hospital_id = p_hospital_id
    AND visit_date  = current_date
    AND status IN ('unpaid', 'partial')
  ORDER BY created_at ASC
  LIMIT 1;

  -- No open visit — create one
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

  -- Assign physician and move service to visit
  UPDATE public.visit_services
  SET visit_id              = v_visit_id,
      assigned_physician_id = p_assigned_physician_id
  WHERE id = p_visit_service_id;

  -- Update visit total
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
-- 4. registrar_invoice_visit
-- Called when registrar clicks "Invoice" on a visit
-- Creates invoice + invoice_items for all services without invoice_items
-- ============================================================

CREATE OR REPLACE FUNCTION public.registrar_invoice_visit(
  p_visit_id    uuid,
  p_hospital_id uuid,
  p_invoiced_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_vs         record;
BEGIN
  -- Find or create active invoice for this visit
  SELECT id INTO v_invoice_id
  FROM public.invoices
  WHERE visit_id = p_visit_id
    AND status   = 'active'
  LIMIT 1;

  IF v_invoice_id IS NULL THEN
    INSERT INTO public.invoices (visit_id, hospital_id, created_by)
    VALUES (p_visit_id, p_hospital_id, p_invoiced_by)
    RETURNING id INTO v_invoice_id;
  END IF;

  -- Create invoice_items for all services not yet invoiced
  FOR v_vs IN
    SELECT vs.id, vs.cost_at_time
    FROM public.visit_services vs
    WHERE vs.visit_id    = p_visit_id
      AND vs.hospital_id = p_hospital_id
      AND vs.status_id IN (
        SELECT id FROM public.service_statuses
        WHERE code = 'preliminary'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.invoice_items ii
        WHERE ii.visit_service_id = vs.id
      )
  LOOP
    INSERT INTO public.invoice_items (invoice_id, visit_service_id, amount)
    VALUES (v_invoice_id, v_vs.id, v_vs.cost_at_time);
  END LOOP;

  RETURN v_invoice_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'registrar_invoice_visit failed: %', SQLERRM;
END;
$$;