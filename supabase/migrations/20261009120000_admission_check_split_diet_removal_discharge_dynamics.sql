-- 1) Split "При госпитализации проверено" (tx.admission_check, free textarea)
--    into 5 independent Да/Нет (boolean) fields in Первичный осмотр врача
--    (primary_physician_exam), treatment_plan section. The old textarea
--    mapping is hidden (not deleted) per the established "hide, don't
--    delete" pattern, since it's a shared field_definition potentially
--    used elsewhere and may carry historical data.

insert into field_definitions (id, attribute_code, label_ru, field_type, options, unit)
values
  ('f1000000-0000-0000-0000-000000000001', 'tx.admission_rw',           'RW',                                              'boolean', null, null),
  ('f1000000-0000-0000-0000-000000000002', 'tx.admission_hiv',          'ВИЧ',                                             'boolean', null, null),
  ('f1000000-0000-0000-0000-000000000003', 'tx.admission_stool_culture','Посев кала',                                      'boolean', null, null),
  ('f1000000-0000-0000-0000-000000000004', 'tx.admission_pediculosis',  'Педикулёз',                                       'boolean', null, null),
  ('f1000000-0000-0000-0000-000000000005', 'tx.admission_covid',        'Ковид(или другие социальные заболевания)',       'boolean', null, null);

insert into document_type_fields (document_type_id, section_id, field_definition_id, is_mandatory, is_visible, sort_order)
values
  ('c1000000-0000-0000-0000-000000000016', 'a1000000-0000-0000-0000-000000000007', 'f1000000-0000-0000-0000-000000000001', false, true, 20),
  ('c1000000-0000-0000-0000-000000000016', 'a1000000-0000-0000-0000-000000000007', 'f1000000-0000-0000-0000-000000000002', false, true, 21),
  ('c1000000-0000-0000-0000-000000000016', 'a1000000-0000-0000-0000-000000000007', 'f1000000-0000-0000-0000-000000000003', false, true, 22),
  ('c1000000-0000-0000-0000-000000000016', 'a1000000-0000-0000-0000-000000000007', 'f1000000-0000-0000-0000-000000000004', false, true, 23),
  ('c1000000-0000-0000-0000-000000000016', 'a1000000-0000-0000-0000-000000000007', 'f1000000-0000-0000-0000-000000000005', false, true, 24);

-- hide the old free-text admission_check mapping in primary_physician_exam
update document_type_fields set is_visible = false
where id = 'ee9ade7c-e823-45f5-b953-c16200620b2c';

-- 2) Hide "Специальная диета" (tx.special_diet) everywhere it's still
--    visible: daily_note, post_mortem_summary, primary_nursing_assessment,
--    primary_physician_exam. (discharge_summary's mapping is already hidden.)
update document_type_fields set is_visible = false
where id in (
  'b1ffd851-59aa-401a-8c0f-23bc74da47e5', -- daily_note
  '548e9366-c835-4c05-bef2-3ed8579553e8', -- post_mortem_summary
  'e56cbb0a-723e-489d-a6af-554b205ece80', -- primary_nursing_assessment
  '8a5632ba-8738-4d26-97b1-6a49808a9da5'  -- primary_physician_exam
);

-- 3) "В динамике общее состояние пациента" (dc.dynamics) is shared between
--    discharge_summary and post_mortem_summary. discharge_summary gets a
--    NEW scoped field using a new reusable field_type, "radio_select"
--    (single-select over N options from the `options` JSON column,
--    rendered as radio buttons -- same options shape as the existing
--    "select" field_type, just a different widget). post_mortem_summary
--    gets no replacement field at all; its copy is hidden and the
--    frontend renders static, non-editable text "Ухудшением" instead,
--    since a post-mortem document inherently means the patient died.

-- field_definitions.field_type is whitelisted by a CHECK constraint --
-- widen it to allow the new "radio_select" type before using it below.
alter table field_definitions drop constraint field_definitions_field_type_check;
alter table field_definitions add constraint field_definitions_field_type_check
  check (field_type = any (array[
    'text', 'textarea', 'number', 'date', 'datetime', 'boolean',
    'select', 'multiselect', 'calculated', 'auto', 'checkbox_note',
    'radio_select'
  ]));

insert into field_definitions (id, attribute_code, label_ru, field_type, options, unit)
values (
  'f1000000-0000-0000-0000-000000000006',
  'dc.discharge_dynamics',
  'В динамике общее состояние пациента',
  'radio_select',
  '[{"value":"improved","label_ru":"Улучшением"},{"value":"unchanged","label_ru":"Без изменений"},{"value":"worsened","label_ru":"Ухудшением"}]'::jsonb,
  null
);

insert into document_type_fields (document_type_id, section_id, field_definition_id, is_mandatory, is_visible, sort_order)
values (
  'c1000000-0000-0000-0000-000000000001', -- discharge_summary
  'a1000000-0000-0000-0000-000000000008', -- discharge_plan
  'f1000000-0000-0000-0000-000000000006',
  false, true, 10
);

-- hide the old shared textarea mapping for both document types
update document_type_fields set is_visible = false
where id in (
  'deb74799-f7ca-4ab9-ad3e-b3ea97aae63a', -- dc.dynamics in discharge_summary
  'bad13d2c-90fa-4929-8dbc-dc5c582a8722'  -- dc.dynamics in post_mortem_summary
);
