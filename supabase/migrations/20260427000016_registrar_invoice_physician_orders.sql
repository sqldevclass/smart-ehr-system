-- Migration 016: Fix physician_order_services and add registrar_invoice_physician_orders
--
-- physician_order_services: now only creates visit + visit_services (no invoice)
-- Registrar sees uninvoiced physician orders and invoices them explicitly
--
-- registrar_invoice_physician_orders: called by registrar to invoice physician orders
-- Finds or creates today's open visit, adds services, creates/updates invoice

-- ============================================================
-- Replace physician_order_services
-- Removes automatic invoice creation
-- Just creates visit + visit_services with source='physician'
-- ============================================================

CREATE OR REPLACE FUNCTION public.physician_order_services(
  p_patient_id  uuid,
  p_hospital_id uuid,
  p_ordered_by  uuid,
  p_services    jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visit_id    uuid;
  v_preliminary uuid;
  v_total       numeric := 0;
  v_item        jsonb;
BEGIN
  SELECT id INTO v_preliminary
  FROM public.service_statuses
  WHERE code = 'preliminary';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'preliminary status not found';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_services)
  LOOP
    v_total := v_total + (v_item->>'cost_at_time')::numeric;
  END LOOP;

  -- Create new visit (no invoice yet — registrar invoices later)
  INSERT INTO public.visits (
    patient_id, hospital_id, visit_type,
    visit_date, total_amount, amount_paid, status
  ) VALUES (
    p_patient_id, p_hospital_id, 'outpatient',
    current_date, v_total, 0, 'unpaid'
  )
  RETURNING id INTO v_visit_id;

  -- Create visit_services only
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_services)
  LOOP
    INSERT INTO public.visit_services (
      visit_id, patient_id, hospital_id,
      service_id, assigned_physician_id,
      status_id, source, cost_at_time, created_by
    ) VALUES (
      v_visit_id, p_patient_id, p_hospital_id,
      (v_item->>'service_id')::uuid,
      (v_item->>'assigned_physician_id')::uuid,
      v_preliminary, 'physician',
      (v_item->>'cost_at_time')::numeric,
      p_ordered_by
    );
  END LOOP;

  RETURN v_visit_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'physician_order_services failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- registrar_invoice_physician_orders
-- Called by registrar when they want to invoice physician-ordered services
--
-- Logic:
-- 1. Find today's open (unpaid/partial) visit for this patient
-- 2. If none exists: use the physician-created visit directly
-- 3. Find or create invoice for that visit
-- 4. For each visit_service_id passed in:
--    - If it belongs to a different visit: move it to the target visit
--    - Create invoice_item
--    - Update visit total
-- Returns the visit_id that was invoiced
-- ============================================================

CREATE OR REPLACE FUNCTION public.registrar_invoice_physician_orders(
  p_patient_id       uuid,
  p_hospital_id      uuid,
  p_invoiced_by      uuid,
  p_visit_service_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_visit_id uuid;
  v_invoice_id      uuid;
  v_vs_id           uuid;
  v_vs_cost         numeric;
  v_vs_visit_id     uuid;
  v_total_addition  numeric := 0;
BEGIN
  -- Find today's open visit for this patient (not the physician-created one)
  -- Prefer registrar-created visits (they have invoice items already)
  SELECT v.id INTO v_target_visit_id
  FROM public.visits v
  WHERE v.patient_id = p_patient_id
    AND v.hospital_id = p_hospital_id
    AND v.visit_date = current_date
    AND v.status IN ('unpaid', 'partial')
    AND EXISTS (
      SELECT 1 FROM public.invoices i WHERE i.visit_id = v.id
    )
  ORDER BY v.created_at ASC
  LIMIT 1;

  -- If no existing invoiced visit, use the first uninvoiced unpaid visit today
  IF v_target_visit_id IS NULL THEN
    SELECT v.id INTO v_target_visit_id
    FROM public.visits v
    WHERE v.patient_id = p_patient_id
      AND v.hospital_id = p_hospital_id
      AND v.visit_date = current_date
      AND v.status IN ('unpaid', 'partial')
    ORDER BY v.created_at ASC
    LIMIT 1;
  END IF;

  IF v_target_visit_id IS NULL THEN
    RAISE EXCEPTION 'No open visit found for patient % today', p_patient_id;
  END IF;

  -- Find or create invoice for target visit
  SELECT id INTO v_invoice_id
  FROM public.invoices
  WHERE visit_id = v_target_visit_id
    AND status = 'active'
  LIMIT 1;

  IF v_invoice_id IS NULL THEN
    INSERT INTO public.invoices (visit_id, hospital_id, created_by)
    VALUES (v_target_visit_id, p_hospital_id, p_invoiced_by)
    RETURNING id INTO v_invoice_id;
  END IF;

  -- Process each visit_service
  FOREACH v_vs_id IN ARRAY p_visit_service_ids
  LOOP
    -- Get cost and current visit_id
    SELECT cost_at_time, visit_id
    INTO v_vs_cost, v_vs_visit_id
    FROM public.visit_services
    WHERE id = v_vs_id
      AND hospital_id = p_hospital_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'visit_service not found: %', v_vs_id;
    END IF;

    -- If service is on a different visit, move it to target visit
    -- and clean up the old visit
    IF v_vs_visit_id != v_target_visit_id THEN
      UPDATE public.visit_services
      SET visit_id = v_target_visit_id
      WHERE id = v_vs_id;

      -- Reduce old visit total
      UPDATE public.visits
      SET total_amount = GREATEST(0, total_amount - v_vs_cost)
      WHERE id = v_vs_visit_id;
    END IF;

    -- Create invoice item
    INSERT INTO public.invoice_items (invoice_id, visit_service_id, amount)
    VALUES (v_invoice_id, v_vs_id, v_vs_cost)
    ON CONFLICT DO NOTHING;

    v_total_addition := v_total_addition + v_vs_cost;
  END LOOP;

  -- Update target visit total if we moved services from another visit
  UPDATE public.visits
  SET total_amount = total_amount + v_total_addition
  WHERE id = v_target_visit_id
    AND NOT EXISTS (
      -- Only add if the services were moved from another visit
      SELECT 1 FROM public.visit_services
      WHERE id = ANY(p_visit_service_ids)
        AND visit_id = v_target_visit_id
    );

  -- Clean up empty physician-created visits (no services left)
  DELETE FROM public.visits
  WHERE patient_id = p_patient_id
    AND hospital_id = p_hospital_id
    AND visit_date = current_date
    AND status = 'unpaid'
    AND total_amount = 0
    AND NOT EXISTS (
      SELECT 1 FROM public.visit_services WHERE visit_id = visits.id
    );

  RETURN v_target_visit_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'registrar_invoice_physician_orders failed: %', SQLERRM;
END;
$$;