-- Migration 132: Clinical scales schema
-- Creates three tables and one RPC.
-- No data inserted here — seeds in migrations 133 and 134.

-- ============================================================
-- 1. clinical_scales
-- ============================================================

CREATE TABLE public.clinical_scales (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text        NOT NULL UNIQUE,
  name        text        NOT NULL,
  description text,
  input_mode  text        NOT NULL DEFAULT 'scored'
                CHECK (input_mode IN ('scored', 'freetext')),
  -- scored: array of {id, label, type, options, score, min, max}
  -- freetext: empty array, physician enters a single value
  items       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- scoring.ranges: [{min, max, label, color}]
  scoring     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clinical_scales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cs_select" ON public.clinical_scales
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 2. diagnosis_scale_mappings
-- ============================================================

CREATE TABLE public.diagnosis_scale_mappings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = situation-based entry (no ICD-10 trigger, manually added only)
  icd10_code      text        REFERENCES public.icd10_codes(code) ON DELETE SET NULL,
  -- For range matches only (e.g. E10.5 to E14.5); plain text, no FK
  icd10_range_end text,
  scale_id        uuid        NOT NULL REFERENCES public.clinical_scales(id) ON DELETE CASCADE,
  purpose         text,
  sort_order      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dsm_icd10_idx ON public.diagnosis_scale_mappings (icd10_code);
CREATE INDEX dsm_scale_idx ON public.diagnosis_scale_mappings (scale_id);

ALTER TABLE public.diagnosis_scale_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dsm_select" ON public.diagnosis_scale_mappings
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 3. patient_scale_assessments
-- ============================================================

CREATE TABLE public.patient_scale_assessments (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hospitalization_id uuid        REFERENCES public.hospitalizations(id) ON DELETE CASCADE,
  patient_id         uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  hospital_id        uuid        NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  scale_id           uuid        NOT NULL REFERENCES public.clinical_scales(id) ON DELETE CASCADE,
  -- plain text — which ICD-10 code triggered this (no FK, may be sub-code)
  icd10_code         text,
  document_id        uuid        REFERENCES public.patient_documents(id) ON DELETE SET NULL,
  responses          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  total_score        numeric,
  interpretation     text,
  status             text        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'completed')),
  assessed_by        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  assessed_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX psa_hosp_idx    ON public.patient_scale_assessments (hospitalization_id);
CREATE INDEX psa_doc_idx     ON public.patient_scale_assessments (document_id);
CREATE INDEX psa_patient_idx ON public.patient_scale_assessments (patient_id, scale_id);
CREATE INDEX psa_icd10_idx   ON public.patient_scale_assessments (icd10_code);

ALTER TABLE public.patient_scale_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "psa_select" ON public.patient_scale_assessments
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "psa_insert" ON public.patient_scale_assessments
  FOR INSERT TO authenticated
  WITH CHECK (hospital_id = public.get_my_hospital_id());

CREATE POLICY "psa_update" ON public.patient_scale_assessments
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

-- ============================================================
-- 4. RPC: get_scales_for_diagnosis
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_scales_for_diagnosis(
  p_icd10_code text
)
RETURNS TABLE (
  mapping_id  uuid,
  scale_id    uuid,
  scale_code  text,
  scale_name  text,
  description text,
  input_mode  text,
  items       jsonb,
  scoring     jsonb,
  purpose     text,
  sort_order  integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    s.id,
    s.code,
    s.name,
    s.description,
    s.input_mode,
    s.items,
    s.scoring,
    m.purpose,
    m.sort_order
  FROM public.diagnosis_scale_mappings m
  JOIN public.clinical_scales s ON s.id = m.scale_id
  WHERE
    -- Exact match (no range)
    (m.icd10_range_end IS NULL AND m.icd10_code = p_icd10_code)
    OR
    -- Range match: e.g. E10.5 <= p_code <= E14.5
    (m.icd10_range_end IS NOT NULL
      AND m.icd10_code IS NOT NULL
      AND p_icd10_code >= m.icd10_code
      AND p_icd10_code <= m.icd10_range_end)
  ORDER BY m.sort_order, s.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_scales_for_diagnosis(text) TO authenticated;
