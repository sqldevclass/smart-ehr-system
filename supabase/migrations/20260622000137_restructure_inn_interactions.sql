-- Migration 137: Restructure inn_interactions for curated Russian DDI dataset
--
-- Order matters:
-- 1. TRUNCATE first (removes all rows with old severity values)
-- 2. Drop old severity constraint (now no rows to conflict)
-- 3. Add new columns
-- 4. Add new severity constraint (avoid/caution only)
-- 5. Update RPCs

-- ============================================================
-- 1. TRUNCATE — removes all 44k+ rows from prior staging loads
-- ============================================================

TRUNCATE public.inn_interactions;

-- ============================================================
-- 2. Drop old severity CHECK constraint
-- ============================================================

ALTER TABLE public.inn_interactions
  DROP CONSTRAINT IF EXISTS inn_interactions_severity_check;

-- Also drop the inline CHECK that was part of column definition
-- (Postgres stores it separately from named constraints)
-- The column-level check from migration 122 was:
-- severity text NOT NULL DEFAULT 'moderate'
--   CHECK (severity IN ('contraindicated','major','moderate','minor'))
-- We need to find and drop it if it's unnamed.
-- It may already be covered by inn_interactions_severity_check above.

-- ============================================================
-- 3. Change severity column default
-- ============================================================

ALTER TABLE public.inn_interactions
  ALTER COLUMN severity SET DEFAULT 'avoid';

-- ============================================================
-- 4. Add new display name and Russian description columns
-- ============================================================

ALTER TABLE public.inn_interactions
  ADD COLUMN IF NOT EXISTS drug_name_ru_a           text,
  ADD COLUMN IF NOT EXISTS drug_name_en_a           text,
  ADD COLUMN IF NOT EXISTS drug_name_ru_b           text,
  ADD COLUMN IF NOT EXISTS drug_name_en_b           text,
  ADD COLUMN IF NOT EXISTS clinical_effect_ru        text,
  ADD COLUMN IF NOT EXISTS actions_recommendations_ru text;

-- ============================================================
-- 5. Add new severity CHECK constraint (avoid / caution only)
-- ============================================================

ALTER TABLE public.inn_interactions
  ADD CONSTRAINT inn_interactions_severity_check
    CHECK (severity IN ('avoid', 'caution'));

-- ============================================================
-- 6. Update detect_patient_interactions
--    - Returns actual INN values in inn_a/inn_b (bug fix from 122)
--    - No severity filter (both avoid and caution shown)
--    - Prefers Russian descriptions when available
-- ============================================================

CREATE OR REPLACE FUNCTION public.detect_patient_interactions(
  p_hospitalization_id uuid,
  p_hospital_id        uuid
)
RETURNS TABLE (
  inn_a                   text,
  inn_b                   text,
  drug_a_name             text,
  drug_b_name             text,
  severity                text,
  clinical_effect         text,
  clinical_significance   text,
  actions_recommendations text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH active_drugs AS (
    SELECT DISTINCT
      COALESCE(df.inn, dp.custom_inn)              AS inn,
      COALESCE(df.trade_name, dp.custom_drug_name) AS name
    FROM public.drug_prescriptions dp
    LEFT JOIN public.drug_formulary df ON df.id = dp.drug_formulary_id
    WHERE dp.hospitalization_id = p_hospitalization_id
      AND dp.hospital_id        = p_hospital_id
      AND dp.is_drafted         = false
      AND dp.status_code        <> 'cancelled'
      AND COALESCE(df.inn, dp.custom_inn) IS NOT NULL
  )
  SELECT
    ii.inn_a,
    ii.inn_b,
    da.name,
    db.name,
    ii.severity,
    COALESCE(ii.clinical_effect_ru,        ii.clinical_effect),
    ii.clinical_significance,
    COALESCE(ii.actions_recommendations_ru, ii.actions_recommendations)
  FROM active_drugs da
  JOIN active_drugs db
    ON public.norm_inn(da.inn) < public.norm_inn(db.inn)
  JOIN public.inn_interactions ii
    ON  public.norm_inn(ii.inn_a) = public.norm_inn(da.inn)
    AND public.norm_inn(ii.inn_b) = public.norm_inn(db.inn);
$$;

-- ============================================================
-- 7. Update check_new_drug_interactions
--    - No severity filter (both avoid and caution checked pre-insert)
--    - Prefers Russian descriptions when available
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_new_drug_interactions(
  p_hospitalization_id uuid,
  p_hospital_id        uuid,
  p_candidate_inn      text
)
RETURNS TABLE (
  existing_drug_name      text,
  severity                text,
  clinical_effect         text,
  clinical_significance   text,
  actions_recommendations text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH existing_drugs AS (
    SELECT DISTINCT
      COALESCE(df.inn, dp.custom_inn)              AS inn,
      COALESCE(df.trade_name, dp.custom_drug_name) AS name
    FROM public.drug_prescriptions dp
    LEFT JOIN public.drug_formulary df ON df.id = dp.drug_formulary_id
    WHERE dp.hospitalization_id = p_hospitalization_id
      AND dp.hospital_id        = p_hospital_id
      AND dp.status_code        <> 'cancelled'
      AND COALESCE(df.inn, dp.custom_inn) IS NOT NULL
      AND public.norm_inn(COALESCE(df.inn, dp.custom_inn))
            <> public.norm_inn(p_candidate_inn)
  )
  SELECT
    ed.name,
    ii.severity,
    COALESCE(ii.clinical_effect_ru,        ii.clinical_effect),
    ii.clinical_significance,
    COALESCE(ii.actions_recommendations_ru, ii.actions_recommendations)
  FROM existing_drugs ed
  JOIN public.inn_interactions ii
    ON (
      public.norm_inn(ii.inn_a) = public.norm_inn(ed.inn)
      AND public.norm_inn(ii.inn_b) = public.norm_inn(p_candidate_inn)
    )
    OR (
      public.norm_inn(ii.inn_b) = public.norm_inn(ed.inn)
      AND public.norm_inn(ii.inn_a) = public.norm_inn(p_candidate_inn)
    );
$$;
