-- Migration 127: Include drafts in interaction check scope
--
-- Correction to check_new_drug_interactions (migration 126): a draft
-- prescription represents intent to order, so it must be included when
-- checking a new candidate drug for interactions — not excluded.
-- Previously filtered is_drafted = false, which silently missed
-- interactions against drugs still sitting in the physician's draft
-- list.

CREATE OR REPLACE FUNCTION public.check_new_drug_interactions(
  p_hospitalization_id uuid,
  p_hospital_id         uuid,
  p_candidate_inn       text
)
RETURNS TABLE (
  existing_drug_name     text,
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
      COALESCE(df.inn, dp.custom_inn) AS inn,
      COALESCE(df.trade_name, dp.custom_drug_name) AS name
    FROM public.drug_prescriptions dp
    LEFT JOIN public.drug_formulary df ON df.id = dp.drug_formulary_id
    WHERE dp.hospitalization_id = p_hospitalization_id
      AND dp.hospital_id = p_hospital_id
      AND dp.status_code <> 'cancelled'
      AND COALESCE(df.inn, dp.custom_inn) IS NOT NULL
      AND public.norm_inn(COALESCE(df.inn, dp.custom_inn)) <> public.norm_inn(p_candidate_inn)
  )
  SELECT
    ed.name,
    ii.severity,
    ii.clinical_effect,
    ii.clinical_significance,
    ii.actions_recommendations
  FROM existing_drugs ed
  JOIN public.inn_interactions ii
    ON  (public.norm_inn(ii.inn_a) = public.norm_inn(ed.inn) AND public.norm_inn(ii.inn_b) = public.norm_inn(p_candidate_inn))
    OR  (public.norm_inn(ii.inn_b) = public.norm_inn(ed.inn) AND public.norm_inn(ii.inn_a) = public.norm_inn(p_candidate_inn));
$$;
