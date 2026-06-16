-- Migration 125: Load curated drug interaction dataset from drug_interactions_staging
--
-- 1. Delete the 17 AI-generated placeholder seed rows from migration 122
--    (flagged needs_review=true, never clinician-verified, superseded by
--    this curated dataset).
-- 2. Clean staging: drop null inn_b, drop self-pairs, canonicalize pair
--    order via existing norm_inn(), map severity 'serious' -> 'major'.
-- 3. Collapse exact + reversed-pair duplicates, keeping the more severe
--    row when duplicates disagree.
-- 4. Insert into inn_interactions, source-tagged, needs_review=true
--    pending clinician sign-off.

-- ============================================================
-- 1. Remove placeholder seed rows
-- ============================================================

DELETE FROM public.inn_interactions
WHERE source = 'curated-seed';
-- Exact match on the source tag migration 122 used for its 17
-- AI-generated placeholder rows. Safe to re-run; idempotent.

-- ============================================================
-- 2-4. Clean, dedupe, canonicalize, map severity, insert
-- ============================================================

WITH cleaned AS (
  SELECT
    trim(inn_a) AS raw_a,
    trim(inn_b) AS raw_b,
    CASE lower(trim(severity))
      WHEN 'serious' THEN 'major'
      ELSE lower(trim(severity))
    END AS mapped_severity,
    trim(description) AS clinical_effect
  FROM public.drug_interactions_staging
  WHERE inn_a IS NOT NULL AND trim(inn_a) <> ''
    AND inn_b IS NOT NULL AND trim(inn_b) <> ''
    AND severity IS NOT NULL AND trim(severity) <> ''
    AND lower(trim(inn_a)) <> lower(trim(inn_b))
),
canonical AS (
  SELECT
    CASE WHEN public.norm_inn(raw_a) < public.norm_inn(raw_b) THEN raw_a ELSE raw_b END AS inn_a,
    CASE WHEN public.norm_inn(raw_a) < public.norm_inn(raw_b) THEN raw_b ELSE raw_a END AS inn_b,
    mapped_severity,
    clinical_effect
  FROM cleaned
  WHERE public.norm_inn(raw_a) <> public.norm_inn(raw_b)
),
ranked AS (
  -- Collapse exact + reversed-pair duplicates: keep the most severe row
  -- per canonical pair (contraindicated > major), breaking remaining
  -- ties arbitrarily but deterministically.
  SELECT
    inn_a, inn_b, mapped_severity, clinical_effect,
    row_number() OVER (
      PARTITION BY public.norm_inn(inn_a), public.norm_inn(inn_b)
      ORDER BY
        CASE mapped_severity WHEN 'contraindicated' THEN 0 ELSE 1 END,
        clinical_effect
    ) AS rn
  FROM canonical
)
INSERT INTO public.inn_interactions
  (inn_a, inn_b, severity, clinical_effect, clinical_significance, needs_review, source)
SELECT
  inn_a, inn_b, mapped_severity, clinical_effect,
  NULL,
  true,
  'список леарств.xlsx'
FROM ranked
WHERE rn = 1
ON CONFLICT (public.norm_inn(inn_a), public.norm_inn(inn_b)) DO NOTHING;
