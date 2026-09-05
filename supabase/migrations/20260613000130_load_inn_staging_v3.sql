-- Migration 130: Load third curated DDI dataset from inn_interactions_staging
--
-- Same pattern as migration 129. inn_interactions_staging was dropped
-- and recreated with 22,783 new rows, same schema as inn_interactions
-- (no severity mapping needed: contraindicated/major/moderate already
-- match the target CHECK constraint).
--
-- Diagnostics confirmed: 0 nulls, 0 self-pairs, 0 exact dupes, 0
-- reversed-pair dupes within staging. 225 rows overlap with pairs
-- already in inn_interactions (21,691 rows from migrations 125+129).
-- Same policy: existing rows win, ON CONFLICT DO NOTHING.

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
