-- =========================================================================
-- 1) Посмертный эпикриз (post_mortem_summary) -> План выписки
-- =========================================================================

-- "Общее состояние при выписке" (dc.general_condition) is shared with
-- discharge_summary, so relabeling it in place would relabel it there too.
-- New field scoped to post_mortem_summary only, labeled "Описание".
insert into field_definitions (id, attribute_code, label_ru, field_type, options, unit)
values ('f1000000-0000-0000-0000-000000000018', 'dc.general_condition_pm', 'Описание', 'textarea', null, null);

insert into document_type_fields (document_type_id, section_id, field_definition_id, is_mandatory, is_visible, sort_order)
values (
  'c1000000-0000-0000-0000-000000000018', -- post_mortem_summary
  'a1000000-0000-0000-0000-000000000008', -- discharge_plan
  'f1000000-0000-0000-0000-000000000018',
  false, true, 20
);

-- hide the old shared mapping + everything else removed from this tab
update document_type_fields set is_visible = false
where id in (
  '95d5adf8-5ec1-4fe2-b06c-0e3cf969511f', -- dc.general_condition (old, shared w/ discharge_summary)
  '5d695f69-9d80-4419-ae8e-a994e0f694cd', -- tx.diet (Диета)
  'fad0738e-4323-4f71-b268-2ad0355c3999', -- dc.warning_signs (Тревожные признаки)
  'bb780442-1566-47ec-bd9b-655271793803', -- dc.follow_up_date (Дата следующего визита)
  '6ea3924f-1eec-4367-9893-6f03058e2c1d', -- dc.continue_treatment (Где продолжить лечение после выписки)
  'ba8dea4d-19a6-4a5d-bef7-feaf302da844', -- tx.prescription (Медикаментозные назначения)
  '404287da-26f5-47a9-aa21-693c02790e8e'  -- tx.recommendations (Рекомендации)
);

-- =========================================================================
-- 2) Процедура высокого риска (high_risk_procedure)
-- =========================================================================

-- ---- 2a. Идентификация -> multiselect (verif.patient_id is shared with
--      pre_op_verification, so a new scoped field instead of mutating it) ----
insert into field_definitions (id, attribute_code, label_ru, field_type, options, unit)
values (
  'f1000000-0000-0000-0000-000000000017',
  'verif.patient_id_multi',
  'Идентификация',
  'multiselect',
  '[{"value":"verbal","label_ru":"Устно"},{"value":"bracelet","label_ru":"По браслету"},{"value":"documents","label_ru":"По документам"}]'::jsonb,
  null
);

insert into document_type_fields (document_type_id, section_id, field_definition_id, is_mandatory, is_visible, sort_order)
values (
  'c1000000-0000-0000-0000-000000000005', -- high_risk_procedure
  'a1000000-0000-0000-0000-000000000012', -- verification_checklist
  'f1000000-0000-0000-0000-000000000017',
  true, true, 10
);

update document_type_fields set is_visible = false
where id = '9c4fe3cf-421a-4c44-ae8d-bbc80d87621c'; -- old verif.patient_id (select) mapping

-- ---- 2b. remove the explicitly listed verification-checklist items ----
update document_type_fields set is_visible = false
where id in (
  '9c03a1b4-0b17-4951-bff2-4c6f1c6dc243', -- Проведены лабораторные исследования
  '9581412a-7086-4e65-907d-f959bef9c1a0', -- Проведена ЭКГ
  '6657a366-8391-4511-905b-6747656b46e5', -- Проведены рентген/КТ/МРТ
  '5240b909-ad54-4147-ae5b-af1b709f2357', -- Проведён осмотр анестезиолога
  '12d187f8-bcce-4297-9c7c-653148ca01fa', -- Определена и подготовлена премедикация
  'afe96c33-e190-49b1-bf73-f3c1d7bec7e0', -- Свежезамороженная плазма
  'f66e2e6c-1cc1-4d48-afe8-ca87fab00f35', -- Эритроцитсодержащая трансфузионная среда
  '5d860267-ce60-4a3d-ac6d-ae4b8d247f8c', -- Тромбоконцентрат
  'aedfcb7d-0558-4d64-9cb2-f181807542b6', -- Имплантируемые устройства заказаны
  '7577bafe-bbca-4510-93b1-8e349a6ff64c', -- Вид, название, размер имплантата
  '0efa0f9f-0ec2-405f-8222-1012b6b2eb55'  -- surg.urgency, Срочность операции
);

-- ---- 2c. new sections (tabs), scoped to high_risk_procedure only ----
insert into document_sections (id, code, name_ru)
values
  ('a1000000-0000-0000-0000-000000000022', 'procedure_timeout', 'Таймаут'),
  ('a1000000-0000-0000-0000-000000000023', 'procedure_description', 'Описание процедуры'),
  ('a1000000-0000-0000-0000-000000000024', 'procedure_signout', 'Сайн-аут'),
  ('a1000000-0000-0000-0000-000000000025', 'care_recommendations', 'Рекомендации по уходу');

insert into document_type_sections (document_type_id, section_id, sort_order)
values
  ('c1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000022', 25), -- Таймаут
  ('c1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000023', 30), -- Описание процедуры (takes over the old "Проведённые вмешательства" slot)
  ('c1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000024', 35), -- Сайн-аут
  ('c1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000025', 45); -- Рекомендации по уходу

-- drop the shared "Проведённые вмешательства" tab mapping for this doc
-- type only (the 9 fields we're keeping move onto the new "Описание
-- процедуры" section below; the section itself, and its use by
-- anesthesia_protocol / discharge_summary / interventional_radiology /
-- operation_protocol / post_mortem_summary, is untouched).
delete from document_type_sections
where document_type_id = 'c1000000-0000-0000-0000-000000000005'
  and section_id = 'a1000000-0000-0000-0000-000000000010'; -- procedures_performed

-- push "Аллергия" to the end of the tab order (was 41, now after the 3 new tabs)
update document_type_sections set sort_order = 50
where document_type_id = 'c1000000-0000-0000-0000-000000000005'
  and section_id = 'd2000000-0000-0000-0000-000000000014'; -- allergy_assessment_nursing

-- ---- 2d. Таймаут fields (new, all boolean) ----
insert into field_definitions (id, attribute_code, label_ru, field_type, options, unit)
values
  ('f1000000-0000-0000-0000-000000000007', 'timeout.patient_id_confirmed',    'Идентификация пациента',                                   'boolean', null, null),
  ('f1000000-0000-0000-0000-000000000008', 'timeout.procedure_name_announced','Название процедуры озвучено',                              'boolean', null, null),
  ('f1000000-0000-0000-0000-000000000009', 'timeout.site_marking_confirmed',  'Маркировка участка и сторона подтверждены',                'boolean', null, null),
  ('f1000000-0000-0000-0000-000000000010', 'timeout.staff_equipment_ready',   'Готовность персонала, инструментов, ИМН подтверждена',     'boolean', null, null);

insert into document_type_fields (document_type_id, section_id, field_definition_id, is_mandatory, is_visible, sort_order)
values
  ('c1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000022', 'f1000000-0000-0000-0000-000000000007', false, true, 10),
  ('c1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000022', 'f1000000-0000-0000-0000-000000000008', false, true, 20),
  ('c1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000022', 'f1000000-0000-0000-0000-000000000009', false, true, 30),
  ('c1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000022', 'f1000000-0000-0000-0000-000000000010', false, true, 40);

-- ---- 2e. Описание процедуры: 3 new fields (surg.procedure_course /
--      surg.complications / surg.blood_loss are shared with
--      interventional_radiology + operation_protocol, so these are new
--      fields rather than relabeled/retyped shared ones) plus the 9
--      untouched fields moved over from "Проведённые вмешательства" ----
insert into field_definitions (id, attribute_code, label_ru, field_type, options, unit)
values
  ('f1000000-0000-0000-0000-000000000011', 'proc.course_hrp',      'Ход процедуры',             'textarea',      null, null),
  ('f1000000-0000-0000-0000-000000000012', 'proc.complication_hrp','Осложнение',                'checkbox_note', null, null),
  ('f1000000-0000-0000-0000-000000000013', 'proc.blood_loss_hrp',  'Объём кровопотери (мл)',    'text',          null, null);

insert into document_type_fields (document_type_id, section_id, field_definition_id, is_mandatory, is_visible, sort_order)
values
  ('c1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000023', 'f1000000-0000-0000-0000-000000000011', true,  true, 5),
  ('c1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000023', 'f1000000-0000-0000-0000-000000000012', false, true, 60),
  ('c1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000023', 'f1000000-0000-0000-0000-000000000013', false, true, 70);

-- hide the old (replaced) mappings -- surg.procedure_course / surg.complications / surg.blood_loss
update document_type_fields set is_visible = false
where id in (
  '88acec97-8072-4157-a955-06c5cc7176d9', -- surg.procedure_course (old, Ход операции / процедуры)
  'd3a14425-f3bc-4c0d-96bf-19b09968fad3', -- surg.complications (old, Осложнения)
  'ba8fce31-9d91-468f-8d3d-dd87f95d0b87'  -- surg.blood_loss (old, Объём кровопотери, number)
);

-- move the 9 untouched fields onto the new "Описание процедуры" section
-- (kept visible exactly as they are, just relocated + reordered to flow
-- around the 3 new fields above)
update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000023', sort_order = 10
where id = '08bf1bee-139c-4804-8799-259df3f5963e'; -- surg.is_repeat
update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000023', sort_order = 20
where id = '46d53418-279e-4cb9-b9ae-250198d752d0'; -- surg.operating_block
update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000023', sort_order = 30
where id = '20182d3d-f9cb-4ae4-8839-743bb327e34b'; -- surg.anesthesia_type
update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000023', sort_order = 40
where id = '679bec6f-5012-4b89-9a01-9b7290ff4419'; -- surg.start_datetime
update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000023', sort_order = 50
where id = '606918b0-b25c-48b2-85c0-d4792b9733db'; -- surg.end_datetime
update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000023', sort_order = 80
where id = '75aeec3a-b0fd-4843-a51a-b76b1c601ffd'; -- surg.macroscopic
update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000023', sort_order = 90
where id = 'c64a26aa-4fe1-41dd-80f1-0b8387c7fce5'; -- surg.incision_class
update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000023', sort_order = 100
where id = '7cb23eeb-f045-478c-99e8-d520b32ef423'; -- surg.drainage
update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000023', sort_order = 110
where id = '3a4ad579-b9f4-46ef-a5e2-f15e2d549228'; -- surg.postop_management

-- ---- 2f. Сайн-аут fields (new) ----
insert into field_definitions (id, attribute_code, label_ru, field_type, options, unit)
values
  ('f1000000-0000-0000-0000-000000000014', 'signout.histology_marking', 'Материал на гистологию маркирован правильно',
    'radio_select',
    '[{"value":"yes","label_ru":"Да"},{"value":"no","label_ru":"Нет"},{"value":"na","label_ru":"Не применимо"}]'::jsonb,
    null),
  ('f1000000-0000-0000-0000-000000000015', 'signout.incident_occurred', 'Был ли инцидент', 'boolean', null, null);

insert into document_type_fields (document_type_id, section_id, field_definition_id, is_mandatory, is_visible, sort_order)
values
  ('c1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000024', 'f1000000-0000-0000-0000-000000000014', false, true, 10),
  ('c1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000024', 'f1000000-0000-0000-0000-000000000015', false, true, 20);

-- ---- 2g. Рекомендации по уходу (new) ----
insert into field_definitions (id, attribute_code, label_ru, field_type, options, unit)
values ('f1000000-0000-0000-0000-000000000016', 'care.recommendations_hrp', 'Рекомендации по уходу', 'textarea', null, null);

insert into document_type_fields (document_type_id, section_id, field_definition_id, is_mandatory, is_visible, sort_order)
values (
  'c1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000025', 'f1000000-0000-0000-0000-000000000016', false, true, 10
);
