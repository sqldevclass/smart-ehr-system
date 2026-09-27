-- Migration 189: trace each allergy back to the document it was
-- recorded in, so the allergy banner can link straight to it.

ALTER TABLE public.patient_allergies
  ADD COLUMN patient_document_id uuid REFERENCES public.patient_documents(id) ON DELETE SET NULL;
