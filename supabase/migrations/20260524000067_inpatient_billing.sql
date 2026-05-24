-- Migration 067: Inpatient billing support
-- Add hospitalization_id to invoices for inpatient accumulated billing
-- Make visit_id nullable (inpatient invoices don't have a single visit)
-- Services ordered during inpatient stay go directly to ready_for_execution

-- ============================================================
-- 1. Update invoices table
-- ============================================================
ALTER TABLE public.invoices
  ALTER COLUMN visit_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS hospitalization_id uuid
    REFERENCES public.hospitalizations(id)
    ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS invoices_hospitalization_idx
  ON public.invoices(hospitalization_id);

-- Ensure at least one of visit_id or hospitalization_id is set
ALTER TABLE public.invoices
  ADD CONSTRAINT invoice_has_visit_or_hospitalization CHECK (
    visit_id IS NOT NULL OR hospitalization_id IS NOT NULL
  );

-- ============================================================
-- 2. New RPC: inpatient_order_service
-- Orders a service for an inpatient patient
-- Goes directly to ready_for_execution (no payment gate)
-- Adds to hospitalization invoice
-- ============================================================
CREATE OR REPLACE FUNCTION public.inpatient_order_service(
  p_hospitalization_id    uuid,
  p_patient_id            uuid,
  p_hospital_id           uuid,
  p_service_id            uuid,
  p_ordered_by            uuid,
  p_assigned_physician_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id      uuid;
  v_vs_id           uuid;
  v_cost            numeric;
  v_ready_status    uuid;
BEGIN
  -- Get ready_for_execution status
  SELECT id INTO v_ready_status
  FROM public.service_statuses
  WHERE code = 'ready_for_execution';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ready_for_execution status not found';
  END IF;

  -- Get service cost
  SELECT cost_with_vat INTO v_cost
  FROM public.services
  WHERE id = p_service_id
    AND hospital_id = p_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found: %', p_service_id;
  END IF;

  -- Find or create hospitalization invoice
  SELECT id INTO v_invoice_id
  FROM public.invoices
  WHERE hospitalization_id = p_hospitalization_id
    AND hospital_id = p_hospital_id
    AND status = 'active'
  LIMIT 1;

  IF v_invoice_id IS NULL THEN
    INSERT INTO public.invoices (
      hospitalization_id, hospital_id,
      created_by, status
    ) VALUES (
      p_hospitalization_id, p_hospital_id,
      p_ordered_by, 'active'
    )
    RETURNING id INTO v_invoice_id;
  END IF;

  -- Create visit_service at ready_for_execution
  -- No visit_id for inpatient services
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
    NULL,
    p_patient_id,
    p_hospital_id,
    p_service_id,
    p_assigned_physician_id,
    v_ready_status,
    'physician',
    v_cost,
    p_ordered_by
  )
  RETURNING id INTO v_vs_id;

  -- Add to hospitalization invoice
  INSERT INTO public.invoice_items (
    invoice_id, visit_service_id, amount
  ) VALUES (
    v_invoice_id, v_vs_id, v_cost
  );

  RETURN jsonb_build_object(
    'visit_service_id', v_vs_id,
    'invoice_id', v_invoice_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'inpatient_order_service failed: %', SQLERRM;
END;
$$;