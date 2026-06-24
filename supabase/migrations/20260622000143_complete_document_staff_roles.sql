-- Migration 143: Update complete_document RPC to use staff_roles
--
-- Now that document_participants uses staff_role_id, the multi-sig
-- check inserts/queries using staff_role_id instead of physician_id.
-- Also ensures all single-sig documents complete correctly.

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
  v_staff_role_id   uuid;
  v_missing_fields  text[];
  v_needs_diagnosis boolean;
  v_has_diagnosis   boolean;
  v_sig_count       int;
  v_visit_service   record;
BEGIN
  -- ── 1. Identify caller ──────────────────────────────────
  v_caller_id   := auth.uid();
  v_hospital_id := public.get_my_hospital_id();

  IF v_caller_id IS NULL OR v_hospital_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.has_permission('documents.complete') THEN
    RAISE EXCEPTION 'Permission denied: documents.complete required';
  END IF;

  -- ── 2. Resolve caller staff_role_id (physician) ─────────
  SELECT sr.id INTO v_staff_role_id
  FROM public.staff_roles sr
  JOIN public.profiles pr ON pr.person_id = sr.person_id
  WHERE pr.id = v_caller_id
    AND sr.hospital_id = v_hospital_id
    AND sr.role_type = 'physician'
  LIMIT 1;

  IF v_staff_role_id IS NULL THEN
    -- Try any role with documents.complete permission
    SELECT sr.id INTO v_staff_role_id
    FROM public.staff_roles sr
    JOIN public.profiles pr ON pr.person_id = sr.person_id
    WHERE pr.id = v_caller_id
      AND sr.hospital_id = v_hospital_id
    LIMIT 1;
  END IF;

  IF v_staff_role_id IS NULL THEN
    RAISE EXCEPTION 'No staff role found for current user';
  END IF;

  -- ── 3. Load document ────────────────────────────────────
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

  -- ── 4. Load document type ───────────────────────────────
  SELECT * INTO v_doc_type
  FROM public.document_types
  WHERE id = v_doc.document_type_id;

  -- ── 5. Validate non-diagnosis mandatory fields ──────────
  SELECT array_agg(fd.label_ru)
  INTO v_missing_fields
  FROM public.document_type_fields dtf
  JOIN public.field_definitions fd  ON fd.id = dtf.field_definition_id
  JOIN public.document_sections  ds ON ds.id = dtf.section_id
  WHERE dtf.document_type_id = v_doc.document_type_id
    AND dtf.is_mandatory = true
    AND ds.code <> 'diagnosis'
    AND NOT EXISTS (
      SELECT 1 FROM public.patient_document_field_values pdfv
      WHERE pdfv.patient_document_id = p_document_id
        AND pdfv.field_definition_id  = dtf.field_definition_id
        AND pdfv.value IS NOT NULL
        AND trim(pdfv.value) != ''
    );

  IF v_missing_fields IS NOT NULL AND array_length(v_missing_fields, 1) > 0 THEN
    RAISE EXCEPTION 'Mandatory fields not filled: %', array_to_string(v_missing_fields, ', ');
  END IF;

  -- ── 6. Validate diagnosis section if required ────────────
  SELECT EXISTS (
    SELECT 1
    FROM public.document_type_fields dtf
    JOIN public.document_sections ds ON ds.id = dtf.section_id
    WHERE dtf.document_type_id = v_doc.document_type_id
      AND dtf.is_mandatory = true
      AND ds.code = 'diagnosis'
  ) INTO v_needs_diagnosis;

  IF v_needs_diagnosis THEN
    SELECT EXISTS (
      SELECT 1 FROM public.patient_diagnoses
      WHERE (
        (v_doc.hospitalization_id IS NOT NULL
          AND hospitalization_id = v_doc.hospitalization_id)
        OR
        (v_doc.hospitalization_id IS NULL
          AND v_doc.visit_service_id IS NOT NULL
          AND visit_id = (
            SELECT visit_id FROM public.visit_services
            WHERE id = v_doc.visit_service_id
          ))
      )
    ) INTO v_has_diagnosis;

    IF NOT v_has_diagnosis THEN
      RAISE EXCEPTION 'Mandatory fields not filled: Основной диагноз';
    END IF;
  END IF;

  -- ── 7. Multi-sig check ───────────────────────────────────
  IF v_doc_type.requires_second_sig THEN
    SELECT COUNT(*) INTO v_sig_count
    FROM public.document_participants
    WHERE patient_document_id = p_document_id
      AND signed_at IS NOT NULL;

    IF v_sig_count < 2 THEN
      -- Record current physician's signature
      INSERT INTO public.document_participants (
        patient_document_id, hospital_id, staff_role_id, role, signed_at
      ) VALUES (
        p_document_id,
        v_hospital_id,
        v_staff_role_id,
        'signer',
        now()
      )
      ON CONFLICT (patient_document_id, staff_role_id)
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

  -- ── 8. Complete the document ─────────────────────────────
  UPDATE public.patient_documents
  SET
    status       = 'completed',
    completed_by = v_caller_id,
    completed_at = now()
  WHERE id = p_document_id;

  -- ── 9. Update linked visit_service if applicable ─────────
  IF v_doc_type.linked_service_type_id IS NOT NULL
     AND v_doc.visit_service_id IS NOT NULL THEN

    SELECT vs.*, ss.code AS status_code
    INTO v_visit_service
    FROM public.visit_services vs
    JOIN public.service_statuses ss ON ss.id = vs.status_id
    WHERE vs.id = v_doc.visit_service_id
      AND vs.hospital_id = v_hospital_id;

    IF FOUND AND v_visit_service.status_code = 'ready_for_execution' THEN
      UPDATE public.visit_services
      SET
        status_id    = (SELECT id FROM public.service_statuses WHERE code = 'completed'),
        completed_at = now()
      WHERE id = v_doc.visit_service_id;
    END IF;
  END IF;

  -- ── 10. Write to audit log ───────────────────────────────
  INSERT INTO public.audit_logs (
    hospital_id, table_name, record_id, operation, new_values, performed_by
  ) VALUES (
    v_hospital_id,
    'patient_documents',
    p_document_id,
    'UPDATE',
    jsonb_build_object(
      'status', 'completed',
      'completed_by', v_caller_id,
      'completed_at', now()
    ),
    v_caller_id
  );

  RETURN jsonb_build_object('status', 'completed');
END;
$$;
