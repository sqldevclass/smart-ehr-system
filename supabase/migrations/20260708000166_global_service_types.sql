-- Migration 166: service_types becomes a hybrid global/hospital-
-- scoped table, mirroring release_forms/packaging_types exactly.
-- Eight platform-default categories become globally shared and
-- genuinely immutable (hospital_id IS NULL rows can never match
-- USING (hospital_id = get_my_hospital_id()), so RLS blocks any
-- UPDATE/DELETE against them automatically, for every hospital,
-- with no special-casing needed). Hospitals keep full ability to
-- create their own additional, hospital-specific service types.

-- ============================================================
-- 1. Make hospital_id nullable, fix uniqueness for the hybrid
--    shape (global codes unique among themselves; hospital-scoped
--    codes unique within their own hospital).
-- ============================================================
ALTER TABLE public.service_types
  ALTER COLUMN hospital_id DROP NOT NULL;

ALTER TABLE public.service_types
  DROP CONSTRAINT IF EXISTS service_types_hospital_id_code_key;

CREATE UNIQUE INDEX service_types_global_code_uidx
  ON public.service_types(code)
  WHERE hospital_id IS NULL;

CREATE UNIQUE INDEX service_types_hospital_code_uidx
  ON public.service_types(hospital_id, code)
  WHERE hospital_id IS NOT NULL;

-- ============================================================
-- 2. RLS — widen SELECT to include global rows; add DELETE
--    (didn't exist before); INSERT/UPDATE are already correctly
--    scoped to hospital_id = get_my_hospital_id(), which already
--    excludes NULL rows with no changes needed.
-- ============================================================
DROP POLICY IF EXISTS "service_types_select" ON public.service_types;

CREATE POLICY "service_types_select" ON public.service_types
  FOR SELECT TO authenticated
  USING (hospital_id IS NULL OR hospital_id = public.get_my_hospital_id());

CREATE POLICY "service_types_delete" ON public.service_types
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

-- ============================================================
-- 3. Promote the 5 already-correctly-coded rows to global, per
--    hospital that currently has them (in place — same row IDs,
--    zero FK repointing needed on `services`).
-- ============================================================
UPDATE public.service_types
SET hospital_id = NULL
WHERE code IN ('laboratory', 'consultation', 'surgery', 'inpatient', 'polyclinic');

-- ============================================================
-- 4. Merge spa + physiotherapy into one new global type. Handles
--    every hospital that has either, not just Kaiser Test.
-- ============================================================
INSERT INTO public.service_types (hospital_id, code, name_ru, name_en, sort_order)
VALUES (NULL, 'spa_physiotherapy', 'СПА/Физиотерапия', 'Spa/Physiotherapy', 8)
ON CONFLICT DO NOTHING;

WITH merged AS (
  SELECT id FROM public.service_types
  WHERE code = 'spa_physiotherapy' AND hospital_id IS NULL
),
old_types AS (
  SELECT id FROM public.service_types
  WHERE code IN ('spa', 'physiotherapy')
)
UPDATE public.services
SET service_type_id = (SELECT id FROM merged)
WHERE service_type_id IN (SELECT id FROM old_types);

DELETE FROM public.service_types
WHERE code IN ('spa', 'physiotherapy');

-- ============================================================
-- 5. New global-only categories with no prior data.
-- ============================================================
INSERT INTO public.service_types (hospital_id, code, name_ru, name_en, sort_order)
VALUES
  (NULL, 'instrumental', 'Инструментальные исследования', 'Instrumental', 12),
  (NULL, 'other',        'Другие',                        'Other',        13)
ON CONFLICT DO NOTHING;
