-- Migration 007: ICD-10 Seed Data
-- 12,879 codes from WHO ICD-10 classification
-- Platform-level reference data, read-only via UI

CREATE TABLE public.icd10_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL,
  level       int NOT NULL CHECK (level BETWEEN 1 AND 4),
  parent_code text REFERENCES public.icd10_codes(code),
  name_ru     text NOT NULL,
  is_leaf     boolean NOT NULL DEFAULT false
);

CREATE INDEX icd10_parent_idx ON public.icd10_codes(parent_code);
CREATE INDEX icd10_level_idx ON public.icd10_codes(level);
CREATE INDEX icd10_name_search_idx ON public.icd10_codes USING gin(to_tsvector('russian', name_ru));

-- RLS
ALTER TABLE public.icd10_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "icd10_select" ON public.icd10_codes
  FOR SELECT TO authenticated USING (true);

-- Insert all codes (ordered by level so parent FK is satisfied)

-- Seed data moved to migration 20260519000040_icd10_full_seed.sql
