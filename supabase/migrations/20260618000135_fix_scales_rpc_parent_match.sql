-- Migration 135: Fix get_scales_for_diagnosis to match parent codes
--
-- The ICD-10 table contains leaf nodes (e.g. J18.2) but mappings were
-- seeded with parent codes (e.g. J18). The RPC needs to also check
-- the parent prefix so J18.2 matches a mapping stored as J18.

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
    -- Exact match (e.g. K74 maps to K74)
    (m.icd10_range_end IS NULL AND m.icd10_code = p_icd10_code)
    OR
    -- Parent prefix match: J18.2 matches mapping stored as J18
    -- Strip everything from the last dot onward and compare
    (m.icd10_range_end IS NULL
      AND m.icd10_code IS NOT NULL
      AND m.icd10_code = regexp_replace(p_icd10_code, '\.[^.]*$', ''))
    OR
    -- Range match (e.g. E10.5 to E14.5)
    (m.icd10_range_end IS NOT NULL
      AND m.icd10_code IS NOT NULL
      AND p_icd10_code >= m.icd10_code
      AND p_icd10_code <= m.icd10_range_end)
  ORDER BY m.sort_order, s.name;
$$;
