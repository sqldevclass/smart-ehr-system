-- Migration 043: Phase 7 — Medical Document System Schema

-- ============================================================
-- 0. is_document_editable stub (created first so RLS policy compiles)
--    Replaced with real implementation at end of this migration
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_document_editable(p_document_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT true; $$;

-- ============================================================
-- 1. document_types
-- ============================================================
CREATE TABLE public.document_types (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id             uuid REFERENCES public.hospitals(id) ON DELETE CASCADE,
  code                    text UNIQUE NOT NULL,
  name_ru                 text NOT NULL,
  name_en                 text,
  color                   text,
  group_code              text,
  is_system_default       boolean DEFAULT false,
  requires_second_sig     boolean DEFAULT false,
  linked_service_type_id  uuid REFERENCES public.service_types(id) ON DELETE SET NULL,
  setting                 text DEFAULT 'both' CHECK (setting IN ('outpatient','inpatient','both')),
  is_active               boolean DEFAULT true,
  created_at              timestamptz DEFAULT now()
);

CREATE INDEX document_types_hospital_idx ON public.document_types(hospital_id);
CREATE INDEX document_types_code_idx ON public.document_types(code);

ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_types_select" ON public.document_types
  FOR SELECT TO authenticated
  USING (hospital_id IS NULL OR hospital_id = public.get_my_hospital_id());

CREATE POLICY "document_types_insert" ON public.document_types
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_settings')
  );

CREATE POLICY "document_types_update" ON public.document_types
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_settings')
  );

-- ============================================================
-- 2. document_sections
-- ============================================================
CREATE TABLE public.document_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL,
  name_ru     text NOT NULL,
  name_en     text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.document_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_sections_select" ON public.document_sections
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 3. document_type_sections
-- ============================================================
CREATE TABLE public.document_type_sections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type_id  uuid NOT NULL REFERENCES public.document_types(id) ON DELETE CASCADE,
  section_id        uuid NOT NULL REFERENCES public.document_sections(id) ON DELETE RESTRICT,
  sort_order        int NOT NULL DEFAULT 0,
  UNIQUE (document_type_id, section_id)
);

CREATE INDEX dts_document_type_idx ON public.document_type_sections(document_type_id);

ALTER TABLE public.document_type_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_type_sections_select" ON public.document_type_sections
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 4. field_definitions
-- ============================================================
CREATE TABLE public.field_definitions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_code  text UNIQUE NOT NULL,
  label_ru        text NOT NULL,
  label_en        text,
  field_type      text NOT NULL CHECK (field_type IN (
                    'text','textarea','number','date','datetime',
                    'boolean','select','multiselect','calculated','auto'
                  )),
  options         jsonb,
  unit            text,
  is_mandatory    boolean DEFAULT false,
  sort_order      int DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX field_definitions_code_idx ON public.field_definitions(attribute_code);

ALTER TABLE public.field_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "field_definitions_select" ON public.field_definitions
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 5. document_type_fields
-- ============================================================
CREATE TABLE public.document_type_fields (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type_id      uuid NOT NULL REFERENCES public.document_types(id) ON DELETE CASCADE,
  section_id            uuid NOT NULL REFERENCES public.document_sections(id) ON DELETE RESTRICT,
  field_definition_id   uuid NOT NULL REFERENCES public.field_definitions(id) ON DELETE RESTRICT,
  sort_order            int NOT NULL DEFAULT 0,
  is_mandatory          boolean DEFAULT false,
  is_visible            boolean DEFAULT true,
  UNIQUE (document_type_id, field_definition_id)
);

CREATE INDEX dtf_document_type_idx ON public.document_type_fields(document_type_id);
CREATE INDEX dtf_field_definition_idx ON public.document_type_fields(field_definition_id);

ALTER TABLE public.document_type_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_type_fields_select" ON public.document_type_fields
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "document_type_fields_update" ON public.document_type_fields
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.document_types dt
      WHERE dt.id = document_type_id
        AND (dt.hospital_id IS NULL OR dt.hospital_id = public.get_my_hospital_id())
    )
  )
  WITH CHECK (public.has_permission('system.manage_settings'));

-- ============================================================
-- 6. patient_documents
-- ============================================================
CREATE TABLE public.patient_documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          uuid NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  hospitalization_id  uuid REFERENCES public.hospitalizations(id) ON DELETE SET NULL,
  hospital_id         uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  document_type_id    uuid NOT NULL REFERENCES public.document_types(id) ON DELETE RESTRICT,
  visit_service_id    uuid REFERENCES public.visit_services(id) ON DELETE SET NULL,
  status              text DEFAULT 'preliminary' CHECK (status IN ('preliminary','completed')),
  criticality_flag    boolean DEFAULT false,
  created_by          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at          timestamptz DEFAULT now(),
  completed_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at        timestamptz
);

CREATE INDEX patient_documents_patient_idx    ON public.patient_documents(patient_id);
CREATE INDEX patient_documents_hospital_idx   ON public.patient_documents(hospital_id);
CREATE INDEX patient_documents_hosp_id_idx    ON public.patient_documents(hospitalization_id);
CREATE INDEX patient_documents_status_idx     ON public.patient_documents(status);

ALTER TABLE public.patient_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_documents_select" ON public.patient_documents
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "patient_documents_insert" ON public.patient_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('documents.create')
    AND (
      hospitalization_id IS NOT NULL
      OR (
        visit_service_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.visit_services vs
          JOIN public.service_statuses ss ON ss.id = vs.status_id
          WHERE vs.id = visit_service_id
            AND ss.code = 'ready_for_execution'
        )
      )
    )
  );

CREATE POLICY "patient_documents_update" ON public.patient_documents
  FOR UPDATE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.is_document_editable(id)
  )
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('documents.complete')
  );

-- ============================================================
-- 7. patient_document_field_values
-- ============================================================
CREATE TABLE public.patient_document_field_values (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_document_id   uuid NOT NULL REFERENCES public.patient_documents(id) ON DELETE CASCADE,
  field_definition_id   uuid NOT NULL REFERENCES public.field_definitions(id) ON DELETE RESTRICT,
  hospital_id           uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  value                 text,
  recorded_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recorded_at           timestamptz DEFAULT now(),
  UNIQUE (patient_document_id, field_definition_id)
);

CREATE INDEX pdfv_document_idx ON public.patient_document_field_values(patient_document_id);
CREATE INDEX pdfv_field_idx    ON public.patient_document_field_values(field_definition_id);
CREATE INDEX pdfv_hospital_idx ON public.patient_document_field_values(hospital_id);

ALTER TABLE public.patient_document_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdfv_select" ON public.patient_document_field_values
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "pdfv_insert" ON public.patient_document_field_values
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('documents.create')
  );

CREATE POLICY "pdfv_update" ON public.patient_document_field_values
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('documents.create')
  );

-- ============================================================
-- 8. document_participants
-- ============================================================
CREATE TABLE public.document_participants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_document_id   uuid NOT NULL REFERENCES public.patient_documents(id) ON DELETE CASCADE,
  hospital_id           uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  physician_id          uuid NOT NULL REFERENCES public.physicians(id) ON DELETE RESTRICT,
  role                  text NOT NULL DEFAULT 'signer',
  signed_at             timestamptz,
  UNIQUE (patient_document_id, physician_id)
);

CREATE INDEX doc_participants_document_idx ON public.document_participants(patient_document_id);

ALTER TABLE public.document_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_participants_select" ON public.document_participants
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "doc_participants_insert" ON public.document_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('documents.complete')
  );

CREATE POLICY "doc_participants_update" ON public.document_participants
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('documents.complete')
  );

-- ============================================================
-- 9. physician_personal_templates
-- ============================================================
CREATE TABLE public.physician_personal_templates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  physician_id        uuid NOT NULL REFERENCES public.physicians(id) ON DELETE CASCADE,
  hospital_id         uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  field_definition_id uuid NOT NULL REFERENCES public.field_definitions(id) ON DELETE CASCADE,
  label               text NOT NULL,
  content             text NOT NULL,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (physician_id, field_definition_id, label)
);

CREATE INDEX ppt_physician_idx ON public.physician_personal_templates(physician_id);
CREATE INDEX ppt_field_idx     ON public.physician_personal_templates(field_definition_id);

ALTER TABLE public.physician_personal_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ppt_select" ON public.physician_personal_templates
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "ppt_insert" ON public.physician_personal_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND physician_id = (
      SELECT id FROM public.physicians WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "ppt_update" ON public.physician_personal_templates
  FOR UPDATE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND physician_id = (
      SELECT id FROM public.physicians WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "ppt_delete" ON public.physician_personal_templates
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND physician_id = (
      SELECT id FROM public.physicians WHERE profile_id = auth.uid()
    )
  );

-- ============================================================
-- 10. get_previous_field_values
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_previous_field_values(
  p_patient_id        uuid,
  p_document_type_id  uuid
)
RETURNS TABLE(field_definition_id uuid, value text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (pdfv.field_definition_id)
    pdfv.field_definition_id,
    pdfv.value
  FROM public.patient_document_field_values pdfv
  JOIN public.patient_documents pd ON pd.id = pdfv.patient_document_id
  JOIN public.document_type_fields dtf
    ON dtf.field_definition_id = pdfv.field_definition_id
    AND dtf.document_type_id = p_document_type_id
  WHERE pd.patient_id = p_patient_id
    AND pd.status = 'completed'
  ORDER BY pdfv.field_definition_id, pd.completed_at DESC;
$$;

-- ============================================================
-- 11. is_document_editable (real implementation — replaces stub)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_document_editable(p_document_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pd.status = 'preliminary'
    OR (
      pd.completed_at IS NOT NULL
      AND (pd.completed_at + (hs.physician_edit_window_hours || ' hours')::interval > now())
    )
    OR public.has_permission('documents.edit_after_window')
  FROM public.patient_documents pd
  JOIN public.hospital_settings hs ON hs.hospital_id = pd.hospital_id
  WHERE pd.id = p_document_id;
$$;