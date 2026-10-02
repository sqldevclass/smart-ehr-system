-- Migration 191: two fixes, both the same class of mistake as the
-- severity constraint before -- AllergyTab.tsx's UI was designed
-- without checking what the existing schema actually allowed.
--
-- 1. drug_id had NO foreign key to drug_formulary at all. AllergyTab's
--    list query embeds drug_formulary(trade_name), which requires
--    PostgREST to know about a real relationship -- with none
--    existing, the whole query fails. Silently: AllergyTab only
--    destructures `data: allergies = []` and never checks the
--    query's error state, so nothing on screen indicated a problem.
--    This is why the list has never shown anything, not just the
--    newest entry. Confirmed zero orphaned drug_id values before
--    adding this -- safe to add.
--
-- 2. allergy_type only allowed 'drug'/'environmental'. AllergyTab's
--    dropdown has 4 options (drug/food/environmental/other).
--    Widening to match, same reasoning as the severity fix: food
--    and "other" allergies are real and clinically relevant.

ALTER TABLE public.patient_allergies
  ADD CONSTRAINT patient_allergies_drug_id_fkey
  FOREIGN KEY (drug_id) REFERENCES public.drug_formulary(id) ON DELETE SET NULL;

ALTER TABLE public.patient_allergies DROP CONSTRAINT patient_allergies_allergy_type_check;
ALTER TABLE public.patient_allergies ADD CONSTRAINT patient_allergies_allergy_type_check
  CHECK (allergy_type = ANY (ARRAY['drug', 'food', 'environmental', 'other']::text[]));
