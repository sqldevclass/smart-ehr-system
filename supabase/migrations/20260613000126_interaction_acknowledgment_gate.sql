-- Migration 126: Pre-insert interaction check + acknowledgment audit trail
--
-- Workflow: when a physician prescribes a new drug, the frontend checks
-- the candidate drug against the patient's active + pending (preliminary)
-- prescriptions BEFORE calling insert. If an interaction is found, the
-- physician must acknowledge it (optional free-text reason) before the
-- insert happens at all. Nothing is ever written to drug_prescriptions
-- for a candidate that gets cancelled at the popup — there is no held/
-- pending database state, only a client-side gate before the one
-- insert that already exists today.
--
-- If no interaction is found, or the check isn't applicable, the insert
-- proceeds exactly as before with no new column populated.
--
-- This migration adds only:
--   1. Audit columns on drug_prescriptions to record that an
--      interaction was acknowledged at insert time (who/when/why).
--   2. A new RPC, check_new_drug_interactions, which checks one
--      candidate INN against the patient's existing active + pending
--      drugs. Distinct from detect_patient_interactions (which checks
--      all-pairs among prescriptions that already exist in the DB).

-- ============================================================
-- 1. Acknowledgment audit columns on drug_prescriptions
-- ============================================================

ALTER TABLE public.drug_prescriptions
  ADD COLUMN IF NOT EXISTS interaction_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS interaction_acknowledged_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS interaction_ack_reason text;

-- ============================================================
-- 2. RPC: check a candidate drug (not yet inserted) against the
--    patient's active + pending prescriptions.
-- ============================================================

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
      AND dp.is_drafted = false
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

GRANT EXECUTE ON FUNCTION public.check_new_drug_interactions(uuid, uuid, text) TO authenticated;
