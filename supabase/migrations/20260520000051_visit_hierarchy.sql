-- Migration 051: Visit hierarchy (parent_visit_id, parent_visit_service_id)
-- Implements FHIR Encounter.partOf pattern
-- Every visit can reference the visit and service that spawned it
-- Enables recursive child service completion check before document confirm

-- ============================================================
-- 1. Add hierarchy columns to visits
-- ============================================================
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS parent_visit_id
    uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_visit_service_id
    uuid REFERENCES public.visit_services(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS visits_parent_visit_idx
  ON public.visits(parent_visit_id);
CREATE INDEX IF NOT EXISTS visits_parent_service_idx
  ON public.visits(parent_visit_service_id);

-- ============================================================
-- 2. Add ordered_from_visit_service_id to visit_services
-- Tracks which service triggered this physician order
-- Equivalent to FHIR ServiceRequest.basedOn
-- ============================================================
ALTER TABLE public.visit_services
  ADD COLUMN IF NOT EXISTS ordered_from_visit_service_id
    uuid REFERENCES public.visit_services(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS vs_ordered_from_idx
  ON public.visit_services(ordered_from_visit_service_id);

-- ============================================================
-- 3. Update physician_order_services RPC
-- Accept source visit_service_id so orders can be traced back
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
      visit_id,
      patient_id,
      hospital_id,
      service_id,
      assigned_physician_id,
      status_id,
      source,
      cost_at_time,
      created_by,
      ordered_from_visit_service_id
    ) VALUES (
      NULL,
      p_patient_id,
      p_hospital_id,
      (v_item->>'service_id')::uuid,
      NULL,
      v_preliminary,
      'physician',
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

-- ============================================================
-- 4. Update registrar_assign_physician_order RPC
-- Set parent_visit_id and parent_visit_service_id on new visits
-- parent_visit_id = the visit of the source visit_service
-- parent_visit_service_id = the source visit_service itself
-- ============================================================
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
  v_visit_id                  uuid;
  v_cost                      numeric;
  v_ordered_from_vs_id        uuid;
  v_parent_visit_id           uuid;
BEGIN
  IF p_assigned_physician_id IS NULL AND p_assigned_room_id IS NULL THEN
    RAISE EXCEPTION 'Must provide either p_assigned_physician_id or p_assigned_room_id';
  END IF;

  -- Get service cost and its ordered_from_visit_service_id
  SELECT cost_at_time, ordered_from_visit_service_id
  INTO v_cost, v_ordered_from_vs_id
  FROM public.visit_services
  WHERE id = p_visit_service_id
    AND hospital_id = p_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit service not found: %', p_visit_service_id;
  END IF;

  -- Derive parent_visit_id from the source visit_service's visit
  IF v_ordered_from_vs_id IS NOT NULL THEN
    SELECT visit_id INTO v_parent_visit_id
    FROM public.visit_services
    WHERE id = v_ordered_from_vs_id;
  END IF;

  -- Find today's open visit for this patient
  -- If parent_visit_id is set, find a child visit of that parent
  -- Otherwise find any open visit
  SELECT id INTO v_visit_id
  FROM public.visits
  WHERE patient_id  = p_patient_id
    AND hospital_id = p_hospital_id
    AND visit_date  = current_date
    AND status IN ('unpaid', 'partial')
    AND (
      v_parent_visit_id IS NULL
      OR parent_visit_id = v_parent_visit_id
    )
  ORDER BY created_at ASC
  LIMIT 1;

  -- No open visit — create one with hierarchy
  IF v_visit_id IS NULL THEN
    INSERT INTO public.visits (
      patient_id,
      hospital_id,
      visit_type,
      visit_date,
      total_amount,
      amount_paid,
      status,
      parent_visit_id,
      parent_visit_service_id
    ) VALUES (
      p_patient_id,
      p_hospital_id,
      'outpatient',
      current_date,
      0,
      0,
      'unpaid',
      v_parent_visit_id,
      v_ordered_from_vs_id
    )
    RETURNING id INTO v_visit_id;
  END IF;

  -- Assign and move service to visit
  UPDATE public.visit_services
  SET visit_id              = v_visit_id,
      assigned_physician_id = p_assigned_physician_id,
      assigned_room_id      = p_assigned_room_id
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
-- 5. Update complete_document RPC
-- Block confirmation until all child visit services completed
-- Recursive: checks all descendant visits
-- ============================================================
DROP FUNCTION IF EXISTS public.complete_document CASCADE;

CREATE OR REPLACE FUNCTION public.complete_document(
  p_document_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc               record;
  v_doc_type          record;
  v_caller_id         uuid;
  v_hospital_id       uuid;
  v_missing_fields    text[];
  v_sig_count         int;
  v_visit_service     record;
  v_pending_services  text[];
BEGIN
  v_caller_id   := auth.uid();
  v_hospital_id := public.get_my_hospital_id();

  IF v_caller_id IS NULL OR v_hospital_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.has_permission('documents.complete') THEN
    RAISE EXCEPTION 'Permission denied: documents.complete required';
  END IF;

  SELECT * INTO v_doc
  FROM public.patient_documents
  WHERE id = p_document_id
    AND hospital_id = v_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found: %', p_document_id;
  END IF;

  IF v_doc.status = 'completed' THEN
    RAISE EXCEPTION 'Document is already completed';
  END IF;

  SELECT * INTO v_doc_type
  FROM public.document_types
  WHERE id = v_doc.document_type_id;

  -- ── Validate mandatory fields ──────────────────────────
  SELECT array_agg(fd.label_ru)
  INTO v_missing_fields
  FROM public.document_type_fields dtf
  JOIN public.field_definitions fd ON fd.id = dtf.field_definition_id
  WHERE dtf.document_type_id = v_doc.document_type_id
    AND dtf.is_mandatory = true
    AND NOT EXISTS (
      SELECT 1 FROM public.patient_document_field_values pdfv
      WHERE pdfv.patient_document_id = p_document_id
        AND pdfv.field_definition_id = dtf.field_definition_id
        AND pdfv.value IS NOT NULL
        AND trim(pdfv.value) != ''
    );

  IF v_missing_fields IS NOT NULL
     AND array_length(v_missing_fields, 1) > 0 THEN
    RAISE EXCEPTION 'Mandatory fields not filled: %',
      array_to_string(v_missing_fields, ', ');
  END IF;

  -- ── Check all child visit services are completed ───────
  -- Uses recursive CTE to traverse full visit hierarchy
  IF v_doc.visit_service_id IS NOT NULL THEN
    WITH RECURSIVE child_visits AS (
      -- Direct children
      SELECT v.id as visit_id
      FROM public.visits v
      WHERE v.parent_visit_service_id = v_doc.visit_service_id

      UNION ALL

      -- Recursive children
      SELECT v.id
      FROM public.visits v
      JOIN child_visits cv ON v.parent_visit_id = cv.visit_id
    )
    SELECT array_agg(s.name)
    INTO v_pending_services
    FROM public.visit_services vs
    JOIN public.services s ON s.id = vs.service_id
    JOIN public.service_statuses ss ON ss.id = vs.status_id
    WHERE vs.visit_id IN (SELECT visit_id FROM child_visits)
      AND ss.code != 'completed'
      AND ss.code != 'cancelled';

    IF v_pending_services IS NOT NULL
       AND array_length(v_pending_services, 1) > 0 THEN
      RAISE EXCEPTION
        'Cannot confirm: pending child services: %',
        array_to_string(v_pending_services, ', ');
    END IF;
  END IF;

  -- ── Multi-signature check ──────────────────────────────
  IF v_doc_type.requires_second_sig THEN
    SELECT COUNT(*) INTO v_sig_count
    FROM public.document_participants
    WHERE patient_document_id = p_document_id
      AND signed_at IS NOT NULL;

    IF v_sig_count < 2 THEN
      INSERT INTO public.document_participants (
        patient_document_id, hospital_id,
        physician_id, role, signed_at
      )
      SELECT p_document_id, v_hospital_id,
             ph.id, 'signer', now()
      FROM public.physicians ph
      WHERE ph.profile_id = v_caller_id
      ON CONFLICT (patient_document_id, physician_id)
      DO UPDATE SET signed_at = now();

      SELECT COUNT(*) INTO v_sig_count
      FROM public.document_participants
      WHERE patient_document_id = p_document_id
        AND signed_at IS NOT NULL;

      IF v_sig_count < 2 THEN
        RETURN jsonb_build_object(
          'status', 'awaiting_second_signature',
          'signatures_collected', v_sig_count,
          'signatures_required', 2
        );
      END IF;
    END IF;
  END IF;

  -- ── Complete the document ──────────────────────────────
  UPDATE public.patient_documents
  SET status       = 'completed',
      completed_by = v_caller_id,
      completed_at = now()
  WHERE id = p_document_id;

  -- ── Update linked visit_service ────────────────────────
  IF v_doc.visit_service_id IS NOT NULL THEN
    SELECT vs.*, ss.code as status_code
    INTO v_visit_service
    FROM public.visit_services vs
    JOIN public.service_statuses ss ON ss.id = vs.status_id
    WHERE vs.id = v_doc.visit_service_id
      AND vs.hospital_id = v_hospital_id;

    IF FOUND AND v_visit_service.status_code
       = 'ready_for_execution' THEN
      UPDATE public.visit_services
      SET status_id    = (
            SELECT id FROM public.service_statuses
            WHERE code = 'completed'),
          completed_at = now()
      WHERE id = v_doc.visit_service_id;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (
    hospital_id, table_name, record_id,
    operation, new_values, performed_by
  ) VALUES (
    v_hospital_id, 'patient_documents', p_document_id,
    'UPDATE',
    jsonb_build_object(
      'status', 'completed',
      'completed_by', v_caller_id,
      'completed_at', now()
    ),
    v_caller_id
  );

  RETURN jsonb_build_object(
    'status', 'completed',
    'document_id', p_document_id,
    'visit_service_updated',
      v_doc.visit_service_id IS NOT NULL
  );

EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO public.audit_logs (
      hospital_id, table_name, record_id,
      operation, new_values, performed_by
    ) VALUES (
      v_hospital_id, 'patient_documents',
      p_document_id, 'UPDATE',
      jsonb_build_object(
        'error', SQLERRM,
        'attempted', 'complete_document'
      ),
      v_caller_id
    );
    RAISE EXCEPTION 'complete_document failed: %', SQLERRM;
END;
$$;