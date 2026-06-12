-- Migration 122: Global INN-based drug interaction knowledge base
--
-- Interactions are a property of active substances (INN), not trade names
-- or per-hospital formulary rows. This table is GLOBAL reference data
-- (hospital_id IS NULL), seeded once, applying to every hospital.
--
-- Matching is case-insensitive on normalized INN (trim + lower).
-- The existing per-hospital drug_interactions table remains for
-- hospital-specific custom overrides.
--
-- CLINICAL NOTE: The seed below is a curated starting set for functional
-- testing. It is NOT a substitute for a licensed clinical interaction
-- database. Every row is flagged needs_review = true for licensed
-- clinician verification before production use.

-- ============================================================
-- 1. Normalized INN helper (immutable for index use)
-- ============================================================

CREATE OR REPLACE FUNCTION public.norm_inn(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(p));
$$;

-- ============================================================
-- 2. inn_interactions reference table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inn_interactions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inn_a                   text NOT NULL,
  inn_b                   text NOT NULL,
  severity                text NOT NULL DEFAULT 'moderate'
                            CHECK (severity IN ('contraindicated', 'major', 'moderate', 'minor')),
  clinical_effect         text,
  clinical_significance   text,
  actions_recommendations text,
  needs_review            boolean NOT NULL DEFAULT true,
  source                  text,
  created_at              timestamptz DEFAULT now(),
  -- canonical order on normalized INN so each pair stored once
  CONSTRAINT inn_no_self      CHECK (public.norm_inn(inn_a) <> public.norm_inn(inn_b)),
  CONSTRAINT inn_canonical    CHECK (public.norm_inn(inn_a) < public.norm_inn(inn_b))
);

CREATE UNIQUE INDEX IF NOT EXISTS inn_interactions_pair_idx
  ON public.inn_interactions (public.norm_inn(inn_a), public.norm_inn(inn_b));

ALTER TABLE public.inn_interactions ENABLE ROW LEVEL SECURITY;

-- Global reference data: readable by all authenticated users
CREATE POLICY "inn_interactions_select" ON public.inn_interactions
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- 3. Seed — curated, canonical-ordered on normalized INN
--    Helper to insert in canonical order regardless of input order
-- ============================================================

CREATE OR REPLACE FUNCTION public._seed_inn_interaction(
  p_a text, p_b text, p_sev text,
  p_effect text, p_sig text, p_action text, p_source text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_a text := p_a;
  v_b text := p_b;
BEGIN
  IF public.norm_inn(p_a) > public.norm_inn(p_b) THEN
    v_a := p_b; v_b := p_a;
  END IF;
  INSERT INTO public.inn_interactions
    (inn_a, inn_b, severity, clinical_effect, clinical_significance,
     actions_recommendations, needs_review, source)
  VALUES
    (v_a, v_b, p_sev, p_effect, p_sig, p_action, true, p_source)
  ON CONFLICT (public.norm_inn(inn_a), public.norm_inn(inn_b)) DO NOTHING;
END;
$$;

SELECT public._seed_inn_interaction(
  'acetaminophen','paracetamol','contraindicated',
  'Терапевтическое дублирование — это один и тот же препарат (МНН идентичны).',
  'Риск передозировки парацетамолом и гепатотоксичности.',
  'Не назначать одновременно. Суммарная суточная доза не должна превышать максимум для парацетамола.',
  'curated-seed');

SELECT public._seed_inn_interaction(
  'aspirin','ibuprofen','major',
  'Ибупрофен снижает антиагрегантный эффект аспирина; повышен риск ЖКТ-кровотечения.',
  'Снижение кардиопротекции аспирина при совместном приёме.',
  'Разнести приём по времени (аспирин за 2 ч до ибупрофена) или пересмотреть терапию.',
  'curated-seed');

SELECT public._seed_inn_interaction(
  'aspirin','warfarin','major',
  'Аддитивный антикоагулянтный/антиагрегантный эффект.',
  'Значительно повышен риск кровотечения.',
  'Избегать комбинации; при необходимости — контроль МНО и признаков кровотечения.',
  'curated-seed');

SELECT public._seed_inn_interaction(
  'ibuprofen','warfarin','major',
  'НПВП повышают риск кровотечения и усиливают эффект варфарина.',
  'Высокий риск ЖКТ-кровотечения.',
  'Избегать; предпочесть парацетамол для анальгезии.',
  'curated-seed');

SELECT public._seed_inn_interaction(
  'amlodipine','ibuprofen','moderate',
  'НПВП снижают антигипертензивный эффект амлодипина (задержка натрия/жидкости).',
  'Ухудшение контроля АД.',
  'Мониторинг АД; ограничить длительность НПВП.',
  'curated-seed');

SELECT public._seed_inn_interaction(
  'amlodipine','atorvastatin','moderate',
  'Амлодипин повышает концентрацию аторвастатина (ингибирование CYP3A4).',
  'Повышен риск миопатии/рабдомиолиза.',
  'Доза аторвастатина не выше 20 мг/сут при совместном приёме; контроль симптомов миопатии.',
  'curated-seed');

SELECT public._seed_inn_interaction(
  'atorvastatin','clarithromycin','major',
  'Кларитромицин (ингибитор CYP3A4) резко повышает концентрацию аторвастатина.',
  'Высокий риск рабдомиолиза.',
  'Приостановить статин на время курса кларитромицина.',
  'curated-seed');

SELECT public._seed_inn_interaction(
  'insulin','salbutamol','moderate',
  'Сальбутамол (бета-2-агонист) повышает уровень глюкозы крови, противодействуя инсулину.',
  'Возможна гипергликемия, особенно при высоких дозах сальбутамола.',
  'Мониторинг гликемии; коррекция дозы инсулина при необходимости.',
  'curated-seed');

SELECT public._seed_inn_interaction(
  'insulin','metoprolol','moderate',
  'Неселективные/высокие дозы бета-блокаторов маскируют симптомы гипогликемии.',
  'Скрытая гипогликемия.',
  'Информировать пациента; предпочесть кардиоселективные ББ; контроль гликемии.',
  'curated-seed');

SELECT public._seed_inn_interaction(
  'lisinopril','ibuprofen','moderate',
  'НПВП снижают эффект ИАПФ и повышают риск нефротоксичности.',
  'Ухудшение контроля АД и функции почек ("тройной удар" с диуретиком).',
  'Избегать длительного совместного приёма; контроль креатинина и АД.',
  'curated-seed');

SELECT public._seed_inn_interaction(
  'lisinopril','spironolactone','major',
  'Аддитивная гиперкалиемия (ИАПФ + калийсберегающий диуретик).',
  'Риск опасной гиперкалиемии.',
  'Контроль калия и функции почек; избегать у пациентов с почечной недостаточностью.',
  'curated-seed');

SELECT public._seed_inn_interaction(
  'warfarin','paracetamol','moderate',
  'Парацетамол в высоких дозах может усиливать эффект варфарина.',
  'Повышение МНО при регулярном приёме высоких доз.',
  'Контроль МНО при длительном приёме парацетамола >2 г/сут.',
  'curated-seed');

SELECT public._seed_inn_interaction(
  'omeprazole','clopidogrel','major',
  'Омепразол (ингибитор CYP2C19) снижает активацию клопидогрела.',
  'Снижение антиагрегантного эффекта, риск тромбоза.',
  'Предпочесть пантопразол; избегать омепразола с клопидогрелом.',
  'curated-seed');

SELECT public._seed_inn_interaction(
  'digoxin','furosemide','moderate',
  'Фуросемид вызывает гипокалиемию, повышая токсичность дигоксина.',
  'Риск дигоксиновой интоксикации/аритмий.',
  'Контроль калия и уровня дигоксина; восполнение калия.',
  'curated-seed');

SELECT public._seed_inn_interaction(
  'ciprofloxacin','tizanidine','contraindicated',
  'Ципрофлоксацин (ингибитор CYP1A2) резко повышает концентрацию тизанидина.',
  'Выраженная гипотензия и седация.',
  'Комбинация противопоказана.',
  'curated-seed');

SELECT public._seed_inn_interaction(
  'metformin','contrast media','major',
  'Йодсодержащий контраст повышает риск лактоацидоза на фоне метформина.',
  'Риск лактоацидоза при нарушении функции почек.',
  'Отменить метформин до и 48 ч после введения контраста; контроль почек.',
  'curated-seed');

SELECT public._seed_inn_interaction(
  'tramadol','sertraline','major',
  'Аддитивный серотонинергический эффект.',
  'Риск серотонинового синдрома и снижения порога судорог.',
  'Избегать комбинации; мониторинг симптомов серотонинового синдрома.',
  'curated-seed');

-- Drop the seed helper (keep norm_inn — used by detection + index)
DROP FUNCTION public._seed_inn_interaction(text, text, text, text, text, text, text);

-- ============================================================
-- 4. Detection RPC — interactions among a patient's active drugs
--    Matches the patient's active (non-cancelled, non-administered-only)
--    prescription INNs against inn_interactions, plus hospital-specific
--    drug_interactions overrides.
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
      COALESCE(df.inn, dp.custom_inn) AS inn,
      COALESCE(df.trade_name, dp.custom_drug_name) AS name
    FROM public.drug_prescriptions dp
    LEFT JOIN public.drug_formulary df ON df.id = dp.drug_formulary_id
    WHERE dp.hospitalization_id = p_hospitalization_id
      AND dp.hospital_id = p_hospital_id
      AND dp.is_drafted = false
      AND dp.status_code <> 'cancelled'
      AND COALESCE(df.inn, dp.custom_inn) IS NOT NULL
  )
  SELECT
    da.name, db.name,
    da.name, db.name,
    ii.severity,
    ii.clinical_effect,
    ii.clinical_significance,
    ii.actions_recommendations
  FROM active_drugs da
  JOIN active_drugs db
    ON public.norm_inn(da.inn) < public.norm_inn(db.inn)
  JOIN public.inn_interactions ii
    ON  public.norm_inn(ii.inn_a) = public.norm_inn(da.inn)
    AND public.norm_inn(ii.inn_b) = public.norm_inn(db.inn);
$$;
