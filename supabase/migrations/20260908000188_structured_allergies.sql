-- Migration 188: allergies must come from documents, into the real
-- patient_allergies table (the one 5 display sites already read
-- from), not the two disconnected free-text fields
-- (history.allergies / daily.allergy) that went nowhere.
--
-- Confirmed before writing this:
--   - patient_allergies already has full INSERT/UPDATE/DELETE RLS,
--     gated by patients.edit -- but that permission is only granted
--     to admin + the 3 registrar roles. Neither physician nor nurse
--     has it. Adding a narrower permission for clinical roles
--     rather than over-granting patients.edit to them.
--   - Ward nurse role code is inpatient_nurse, not "nurse".
--   - Allergy is bundled inside larger sections (Жалобы и Анамнез,
--     etc.) alongside 3-17 unrelated fields for 11 of 13 other
--     document types -- removing only the one field link, not the
--     section.
--   - Первичный сестринский осмотр already has "Аллергия" as its
--     own dedicated section (d2000000-0000-0000-0000-000000000014)
--     -- reusing that same section as the shared allergy section
--     for all 14 document types, rendered by the new AllergyTab
--     component instead of a generic field.

-- ============================================================
-- 1. New permission for physician/nurse to manage allergies,
--    additive to patient_allergies' existing RLS (which stays
--    exactly as-is for registrars).
-- ============================================================

INSERT INTO public.permissions (code, name_ru, name_en, module)
VALUES ('patients.manage_allergies', 'Управление аллергиями пациента', 'Manage patient allergies', 'patients');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.code IN ('physician', 'inpatient_nurse', 'head_nurse')
  AND p.code = 'patients.manage_allergies';

CREATE POLICY "patient_allergies_insert_clinical" ON public.patient_allergies
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('patients.manage_allergies')
  );

CREATE POLICY "patient_allergies_update_clinical" ON public.patient_allergies
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('patients.manage_allergies')
  );

CREATE POLICY "patient_allergies_delete_clinical" ON public.patient_allergies
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('patients.manage_allergies')
  );

-- ============================================================
-- 2. Remove the disconnected free-text fields from all 14
--    document types that had them.
-- ============================================================

DELETE FROM public.document_type_fields
WHERE field_definition_id IN (
  'b1000000-0000-0000-0000-000000000003', -- history.allergies
  'b1000000-0000-0000-0000-000000000340'  -- daily.allergy
);

-- ============================================================
-- 3. Link the shared "Аллергия" section into the 13 document
--    types that don't already have it (Первичный сестринский
--    осмотр already does).
-- ============================================================

INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000014', 81), -- Выписной эпикриз
  ('c1000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000014', 41), -- Дневниковая запись
  ('c1000000-0000-0000-0000-000000000021', 'd2000000-0000-0000-0000-000000000014', 51), -- Карта первичного сестринского осмотра
  ('c1000000-0000-0000-0000-000000000003', 'd2000000-0000-0000-0000-000000000014', 71), -- Консилиум
  ('c1000000-0000-0000-0000-000000000023', 'd2000000-0000-0000-0000-000000000014', 51), -- Консультация Врача
  ('c1000000-0000-0000-0000-000000000013', 'd2000000-0000-0000-0000-000000000014', 31), -- Краткий осмотр в приёмном
  ('c1000000-0000-0000-0000-000000000014', 'd2000000-0000-0000-0000-000000000014', 71), -- Обоснование диагноза
  ('c1000000-0000-0000-0000-000000000015', 'd2000000-0000-0000-0000-000000000014', 71), -- Осмотр анестезиолога
  ('c1000000-0000-0000-0000-000000000016', 'd2000000-0000-0000-0000-000000000014', 71), -- Первичный осмотр врача
  ('c1000000-0000-0000-0000-000000000017', 'd2000000-0000-0000-0000-000000000014', 51), -- Переводной эпикриз
  ('c1000000-0000-0000-0000-000000000018', 'd2000000-0000-0000-0000-000000000014', 81), -- Посмертный эпикриз
  ('c1000000-0000-0000-0000-000000000020', 'd2000000-0000-0000-0000-000000000014', 71), -- Предоперационный эпикриз
  ('c1000000-0000-0000-0000-000000000005', 'd2000000-0000-0000-0000-000000000014', 41); -- Процедура высокого риска
