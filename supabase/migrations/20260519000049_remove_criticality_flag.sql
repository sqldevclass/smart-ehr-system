-- Migration 049: Remove criticality_flag requirement from complete_document RPC
-- criticality_flag is redundant — mandatory field validation already ensures
-- the physician has reviewed all required fields before confirming.

-- Remove criticality_flag check from complete_document
CREATE OR REPLACE FUNCTION public.complete_document(
  p_document_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc             record;
  v_doc_type        record;
  v_caller_id       uuid;
  v_hospital_id     uuid;
  v_missing_fields  text[];
  v_sig_count       int;
  v_visit_service   record;
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

  -- Validate all mandatory fields are filled
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

  IF v_missing_fields IS NOT NULL AND array_length(v_missing_fields, 1) > 0 THEN
    RAISE EXCEPTION 'Mandatory fields not filled: %', array_to_string(v_missing_fields, ', ');
  END IF;

  -- Check signature count for multi-sig documents
  IF v_doc_type.requires_second_sig THEN
    SELECT COUNT(*) INTO v_sig_count
    FROM public.document_participants
    WHERE patient_document_id = p_document_id
      AND signed_at IS NOT NULL;

    IF v_sig_count < 2 THEN
      INSERT INTO public.document_participants (
        patient_document_id, hospital_id, physician_id, role, signed_at
      )
      SELECT p_document_id, v_hospital_id, ph.id, 'signer', now()
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

  UPDATE public.patient_documents
  SET status       = 'completed',
      completed_by = v_caller_id,
      completed_at = now()
  WHERE id = p_document_id;

  IF v_doc_type.linked_service_type_id IS NOT NULL
     AND v_doc.visit_service_id IS NOT NULL THEN
    SELECT vs.*, ss.code as status_code
    INTO v_visit_service
    FROM public.visit_services vs
    JOIN public.service_statuses ss ON ss.id = vs.status_id
    WHERE vs.id = v_doc.visit_service_id
      AND vs.hospital_id = v_hospital_id;

    IF FOUND AND v_visit_service.status_code = 'ready_for_execution' THEN
      UPDATE public.visit_services
      SET status_id    = (SELECT id FROM public.service_statuses WHERE code = 'completed'),
          completed_at = now()
      WHERE id = v_doc.visit_service_id;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (
    hospital_id, table_name, record_id, operation, new_values, performed_by
  ) VALUES (
    v_hospital_id, 'patient_documents', p_document_id,
    'UPDATE',
    jsonb_build_object('status','completed','completed_by',v_caller_id,'completed_at',now()),
    v_caller_id
  );

  RETURN jsonb_build_object(
    'status', 'completed',
    'document_id', p_document_id,
    'visit_service_updated', (
      v_doc_type.linked_service_type_id IS NOT NULL
      AND v_doc.visit_service_id IS NOT NULL
    )
  );

EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO public.audit_logs (
      hospital_id, table_name, record_id, operation, new_values, performed_by
    ) VALUES (
      v_hospital_id, 'patient_documents', p_document_id,
      'UPDATE',
      jsonb_build_object('error', SQLERRM, 'attempted', 'complete_document'),
      v_caller_id
    );
    RAISE EXCEPTION 'complete_document failed: %', SQLERRM;
END;
$$;