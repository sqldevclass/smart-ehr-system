-- Migration 129: Load second curated DDI dataset from inn_interactions_staging
--
-- inn_interactions_staging (20,000 rows) already matches inn_interactions'
-- schema exactly (inn_a, inn_b, severity, clinical_effect,
-- clinical_significance, actions_recommendations, needs_review, source).
-- Severity vocabulary already matches the target CHECK constraint
-- (contraindicated/major/moderate/minor) — no mapping needed.
--
-- Diagnostics confirmed: 0 nulls, 0 self-pairs, 0 exact dupes, 0
-- reversed-pair dupes within staging. 449 rows overlap with pairs
-- already in inn_interactions from the first load (migration 125).
-- Policy: existing rows win, ON CONFLICT DO NOTHING — new data is
-- skipped for any pair that already exists, never overwrites.
--
-- needs_review / source carried through as-is from staging (trusting
-- whatever values were already set there) rather than overridden,
-- since this dataset already populated those columns deliberately.

INSERT INTO public.inn_interactions
  (inn_a, inn_b, severity, clinical_effect, clinical_significance,
   actions_recommendations, needs_review, source)
SELECT
  CASE WHEN public.norm_inn(inn_a) < public.norm_inn(inn_b) THEN inn_a ELSE inn_b END,
  CASE WHEN public.norm_inn(inn_a) < public.norm_inn(inn_b) THEN inn_b ELSE inn_a END,
  lower(trim(severity)),
  clinical_effect,
  clinical_significance,
  actions_recommendations,
  COALESCE(needs_review, true),
  COALESCE(source, 'inn_interactions_staging')
FROM public.inn_interactions_staging
WHERE public.norm_inn(inn_a) <> public.norm_inn(inn_b)
ON CONFLICT (public.norm_inn(inn_a), public.norm_inn(inn_b)) DO NOTHING;
