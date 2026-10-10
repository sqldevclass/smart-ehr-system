-- =========================================================================
-- Процедура высокого риска (high_risk_procedure)
-- =========================================================================

-- ---- 1) Rename "Верификация" -> "Верификация и Маркировка" ----
-- verification_checklist is shared with pre_op_verification, so renaming
-- it in place would relabel that document type's tab too. New section
-- scoped to high_risk_procedure only; move this doc type's field mappings
-- (visible and hidden) onto it, keep the same sort_order (10).
insert into document_sections (id, code, name_ru)
values ('a1000000-0000-0000-0000-000000000026', 'verification_marking', 'Верификация и Маркировка');

update document_type_sections set section_id = 'a1000000-0000-0000-0000-000000000026'
where document_type_id = 'c1000000-0000-0000-0000-000000000005'
  and section_id = 'a1000000-0000-0000-0000-000000000012'; -- verification_checklist

update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000026'
where document_type_id = 'c1000000-0000-0000-0000-000000000005'
  and section_id = 'a1000000-0000-0000-0000-000000000012';

-- ---- 2) Move "Добавить аллергию" (AllergyTab) into this tab, remove the
--      Аллергия tab entirely for this document type only ----
delete from document_type_sections
where document_type_id = 'c1000000-0000-0000-0000-000000000005'
  and section_id = 'd2000000-0000-0000-0000-000000000014'; -- allergy_assessment_nursing

-- ---- 3) Описание процедуры: hide 3 fields (already scoped to this doc
--      type only, so this hide has no effect on any other document type) ----
update document_type_fields set is_visible = false
where id in (
  '08bf1bee-139c-4804-8799-259df3f5963e', -- surg.is_repeat, Повторная операция или осложнение
  '46d53418-279e-4cb9-b9ae-250198d752d0', -- surg.operating_block, Операционный блок
  '3a4ad579-b9f4-46ef-a5e2-f15e2d549228'  -- surg.postop_management, Послеоперационное ведение
);
