-- Migration 136: Drug groups and subgroups
--
-- Two new tables following the global + own pattern of units_of_measurement:
--   hospital_id = NULL  → global/system row (seeded from document, read-only in UI)
--   hospital_id = <id>  → hospital-specific addition
--
-- drug_formulary gets a nullable subgroup_id FK.
-- Group is derivable through subgroup → group, so only subgroup_id stored on formulary.

-- ============================================================
-- 1. drug_groups
-- ============================================================

CREATE TABLE public.drug_groups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ru     text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  hospital_id uuid        REFERENCES public.hospitals(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dg_hospital_idx ON public.drug_groups (hospital_id)
  WHERE hospital_id IS NOT NULL;

ALTER TABLE public.drug_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dg_select" ON public.drug_groups
  FOR SELECT TO authenticated
  USING (hospital_id IS NULL OR hospital_id = public.get_my_hospital_id());

CREATE POLICY "dg_insert" ON public.drug_groups
  FOR INSERT TO authenticated
  WITH CHECK (hospital_id = public.get_my_hospital_id());

CREATE POLICY "dg_update" ON public.drug_groups
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "dg_delete" ON public.drug_groups
  FOR DELETE TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

-- ============================================================
-- 2. drug_subgroups
-- ============================================================

CREATE TABLE public.drug_subgroups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid        NOT NULL REFERENCES public.drug_groups(id) ON DELETE CASCADE,
  name_ru     text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  hospital_id uuid        REFERENCES public.hospitals(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ds_group_idx    ON public.drug_subgroups (group_id);
CREATE INDEX ds_hospital_idx ON public.drug_subgroups (hospital_id)
  WHERE hospital_id IS NOT NULL;

ALTER TABLE public.drug_subgroups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ds_select" ON public.drug_subgroups
  FOR SELECT TO authenticated
  USING (hospital_id IS NULL OR hospital_id = public.get_my_hospital_id());

CREATE POLICY "ds_insert" ON public.drug_subgroups
  FOR INSERT TO authenticated
  WITH CHECK (hospital_id = public.get_my_hospital_id());

CREATE POLICY "ds_update" ON public.drug_subgroups
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "ds_delete" ON public.drug_subgroups
  FOR DELETE TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

-- ============================================================
-- 3. Add subgroup_id to drug_formulary
-- ============================================================

ALTER TABLE public.drug_formulary
  ADD COLUMN IF NOT EXISTS subgroup_id uuid
    REFERENCES public.drug_subgroups(id) ON DELETE SET NULL;

CREATE INDEX df_subgroup_idx ON public.drug_formulary (subgroup_id)
  WHERE subgroup_id IS NOT NULL;

-- ============================================================
-- 4. Seed global groups and subgroups
-- ============================================================

DO $$
DECLARE
  g_blood     uuid;
  g_antimicro uuid;
  g_cardio    uuid;
  g_neuro     uuid;
  g_inflam    uuid;
  g_gi        uuid;
BEGIN

-- Insert groups
INSERT INTO public.drug_groups (name_ru, sort_order, hospital_id) VALUES
  ('Препараты, влияющие на кровь и гемостаз',        1, NULL) RETURNING id INTO g_blood;
INSERT INTO public.drug_groups (name_ru, sort_order, hospital_id) VALUES
  ('Противомикробные и противопаразитарные средства', 2, NULL) RETURNING id INTO g_antimicro;
INSERT INTO public.drug_groups (name_ru, sort_order, hospital_id) VALUES
  ('Препараты для сердечно-сосудистой системы',       3, NULL) RETURNING id INTO g_cardio;
INSERT INTO public.drug_groups (name_ru, sort_order, hospital_id) VALUES
  ('Препараты, влияющие на нервную систему',          4, NULL) RETURNING id INTO g_neuro;
INSERT INTO public.drug_groups (name_ru, sort_order, hospital_id) VALUES
  ('Противовоспалительные и иммунотропные средства',  5, NULL) RETURNING id INTO g_inflam;
INSERT INTO public.drug_groups (name_ru, sort_order, hospital_id) VALUES
  ('Препараты для желудочно-кишечного тракта (ЖКТ)',  6, NULL) RETURNING id INTO g_gi;

-- Subgroups: blood/haemostasis
INSERT INTO public.drug_subgroups (group_id, name_ru, sort_order, hospital_id) VALUES
  (g_blood, 'Антикоагулянты',                   1, NULL),
  (g_blood, 'Антиагреганты',                    2, NULL),
  (g_blood, 'Тромболитики (фибринолитики)',      3, NULL),
  (g_blood, 'Гемостатики (коагулянты)',          4, NULL);

-- Subgroups: antimicrobials
INSERT INTO public.drug_subgroups (group_id, name_ru, sort_order, hospital_id) VALUES
  (g_antimicro, 'Антибиотики (антибактериальные)',         1, NULL),
  (g_antimicro, 'Противовирусные',                        2, NULL),
  (g_antimicro, 'Противогрибковые (антимикотики)',         3, NULL),
  (g_antimicro, 'Противопротозойные и антигельминтные',   4, NULL);

-- Subgroups: cardiovascular
INSERT INTO public.drug_subgroups (group_id, name_ru, sort_order, hospital_id) VALUES
  (g_cardio, 'Гипотензивные (антигипертензивные)', 1, NULL),
  (g_cardio, 'Антиаритмические',                   2, NULL),
  (g_cardio, 'Диуретики (мочегонные)',              3, NULL),
  (g_cardio, 'Гиполипидемические (статины)',        4, NULL);

-- Subgroups: nervous system
INSERT INTO public.drug_subgroups (group_id, name_ru, sort_order, hospital_id) VALUES
  (g_neuro, 'Анальгетики (болеутоляющие)',               1, NULL),
  (g_neuro, 'Психолептики (успокоительные и антипсихотики)', 2, NULL),
  (g_neuro, 'Психоаналептики',                           3, NULL),
  (g_neuro, 'Анестетики',                                4, NULL);

-- Subgroups: anti-inflammatory / immunotropic
INSERT INTO public.drug_subgroups (group_id, name_ru, sort_order, hospital_id) VALUES
  (g_inflam, 'НПВП (нестероидные противовоспалительные препараты)', 1, NULL),
  (g_inflam, 'Глюкокортикостероиды (ГКС)',                         2, NULL),
  (g_inflam, 'Антигистаминные',                                    3, NULL),
  (g_inflam, 'Иммуносупрессоры',                                   4, NULL);

-- Subgroups: GI
INSERT INTO public.drug_subgroups (group_id, name_ru, sort_order, hospital_id) VALUES
  (g_gi, 'Антациды и ингибиторы протонной помпы (ИПП)', 1, NULL),
  (g_gi, 'Спазмолитики',                                2, NULL),
  (g_gi, 'Пробиотики и пребиотики',                     3, NULL);

END;
$$;
