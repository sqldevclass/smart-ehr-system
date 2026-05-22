-- Migration 058: Add hospitalization recommendation fields to visits
-- Physician fills these in the outpatient document (Plan лечения tab)
-- Only becomes visible to inpatient registrar after document is confirmed

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS hospitalization_recommended
    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS hosp_recommended_department_id
    uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hosp_recommended_urgency
    text CHECK (hosp_recommended_urgency IN
      ('planned', 'emergency')),
  ADD COLUMN IF NOT EXISTS hosp_recommended_notes
    text,
  ADD COLUMN IF NOT EXISTS hosp_recommended_at
    timestamptz,
  ADD COLUMN IF NOT EXISTS hosp_recommended_by
    uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS visits_hosp_recommended_idx
  ON public.visits(hospital_id, hospitalization_recommended)
  WHERE hospitalization_recommended = true;

-- Update complete_document RPC to set
-- hospitalization_recommended = true when document
-- is confirmed and recommendation exists on the visit

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
  v_visit_id          uuid;
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

  -- Validate mandatory fields
  SELECT array_agg(fd.label_ru)
  INTO v_missing_fields
  FROM public.document_type_fields dtf
  JOIN public.field_definitions fd
    ON fd.id = dtf.field_definition_id
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

  -- Check child visit services completed
  IF v_doc.visit_service_id IS NOT NULL THEN
    WITH RECURSIVE child_visits AS (
      SELECT v.id as visit_id
      FROM public.visits v
      WHERE v.parent_visit_service_id =
        v_doc.visit_service_id
      UNION ALL
      SELECT v.id
      FROM public.visits v
      JOIN child_visits cv
        ON v.parent_visit_id = cv.visit_id
    )
    SELECT array_agg(s.name)
    INTO v_pending_services
    FROM public.visit_services vs
    JOIN public.services s ON s.id = vs.service_id
    JOIN public.service_statuses ss
      ON ss.id = vs.status_id
    WHERE vs.visit_id IN (
      SELECT visit_id FROM child_visits)
      AND ss.code != 'completed'
      AND ss.code != 'cancelled';

    IF v_pending_services IS NOT NULL
       AND array_length(v_pending_services, 1) > 0 THEN
      RAISE EXCEPTION
        'Cannot confirm: pending child services: %',
        array_to_string(v_pending_services, ', ');
    END IF;
  END IF;

  -- Multi-signature check
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

  -- Complete the document
  UPDATE public.patient_documents
  SET status       = 'completed',
      completed_by = v_caller_id,
      completed_at = now()
  WHERE id = p_document_id;

  -- Update linked visit_service
  IF v_doc.visit_service_id IS NOT NULL THEN
    SELECT vs.*, ss.code as status_code
    INTO v_visit_service
    FROM public.visit_services vs
    JOIN public.service_statuses ss
      ON ss.id = vs.status_id
    WHERE vs.id = v_doc.visit_service_id
      AND vs.hospital_id = v_hospital_id;

    IF FOUND AND v_visit_service.status_code
       = 'ready_for_execution' THEN
      UPDATE public.visit_services
      SET status_id = (
            SELECT id FROM public.service_statuses
            WHERE code = 'completed'),
          completed_at = now()
      WHERE id = v_doc.visit_service_id;
    END IF;

    -- Get visit_id from visit_service
    v_visit_id := v_visit_service.visit_id;
  END IF;

  -- If hospitalization recommendation exists on visit,
  -- activate it now that document is confirmed
  IF v_visit_id IS NOT NULL THEN
    UPDATE public.visits
    SET hospitalization_recommended = true
    WHERE id = v_visit_id
      AND hosp_recommended_department_id IS NOT NULL
      AND hospitalization_recommended = false;
  END IF;

  INSERT INTO public.audit_logs (
    hospital_id, table_name, record_id,
    operation, new_values, performed_by
  ) VALUES (
    v_hospital_id, 'patient_documents',
    p_document_id, 'UPDATE',
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
    RAISE EXCEPTION 'complete_document failed: %',
      SQLERRM;
END;
$$;