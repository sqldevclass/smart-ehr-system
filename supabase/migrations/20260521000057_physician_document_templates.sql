-- Migration 057: Physician document templates
-- Full document snapshots (not per-field snippets)
-- physician_personal_templates stays unchanged for future per-field use

CREATE TABLE public.physician_document_templates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  physician_id     uuid NOT NULL REFERENCES public.physicians(id) ON DELETE CASCADE,
  hospital_id      uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  document_type_id uuid NOT NULL REFERENCES public.document_types(id) ON DELETE CASCADE,
  name             text NOT NULL,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (physician_id, document_type_id, name)
);

CREATE INDEX pdt_physician_idx ON public.physician_document_templates(physician_id);
CREATE INDEX pdt_document_type_idx ON public.physician_document_templates(document_type_id);

ALTER TABLE public.physician_document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdt_select" ON public.physician_document_templates
  FOR SELECT TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND physician_id = (
      SELECT id FROM public.physicians
      WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "pdt_insert" ON public.physician_document_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND physician_id = (
      SELECT id FROM public.physicians
      WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "pdt_delete" ON public.physician_document_templates
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND physician_id = (
      SELECT id FROM public.physicians
      WHERE profile_id = auth.uid()
    )
  );

-- ============================================================
-- Template field values
-- ============================================================
CREATE TABLE public.physician_document_template_values (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         uuid NOT NULL REFERENCES
    public.physician_document_templates(id) ON DELETE CASCADE,
  field_definition_id uuid NOT NULL REFERENCES
    public.field_definitions(id) ON DELETE CASCADE,
  value               text NOT NULL,
  UNIQUE (template_id, field_definition_id)
);

CREATE INDEX pdtv_template_idx ON public.physician_document_template_values(template_id);

ALTER TABLE public.physician_document_template_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pdtv_select" ON public.physician_document_template_values
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.physician_document_templates pdt
      WHERE pdt.id = template_id
        AND pdt.hospital_id = public.get_my_hospital_id()
        AND pdt.physician_id = (
          SELECT id FROM public.physicians
          WHERE profile_id = auth.uid()
        )
    )
  );

CREATE POLICY "pdtv_insert" ON public.physician_document_template_values
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.physician_document_templates pdt
      WHERE pdt.id = template_id
        AND pdt.hospital_id = public.get_my_hospital_id()
        AND pdt.physician_id = (
          SELECT id FROM public.physicians
          WHERE profile_id = auth.uid()
        )
    )
  );

CREATE POLICY "pdtv_delete" ON public.physician_document_template_values
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.physician_document_templates pdt
      WHERE pdt.id = template_id
        AND pdt.hospital_id = public.get_my_hospital_id()
        AND pdt.physician_id = (
          SELECT id FROM public.physicians
          WHERE profile_id = auth.uid()
        )
    )
  );