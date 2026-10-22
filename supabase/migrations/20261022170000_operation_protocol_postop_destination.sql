-- Протокол операции: add mandatory radio "Перевод" (where the patient goes after
-- surgery) directly above "Послеоперационное ведение".
-- Used by the upcoming "Перевод в реанимацию" report: an ICU entry right after
-- surgery is a regular placement only when the protocol says ICU; patients sent to
-- the profile department / recovery room who later go to ICU are counted.
--
-- Data-only change: the radio_select field type is already rendered by the document
-- editor and read-only viewer. Existing completed protocols simply have no value.

insert into public.field_definitions (id, attribute_code, label_ru, label_en, field_type, options, is_mandatory)
values (
  'f1000000-0000-0000-0000-000000000019',
  'surg.postop_destination',
  'Перевод',
  'Post-operative transfer',
  'radio_select',
  '[{"value":"icu","label_ru":"ICU"},{"value":"ward","label_ru":"Профильное отделение"},{"value":"recovery","label_ru":"Палата пробуждения"}]'::jsonb,
  true
)
on conflict (attribute_code) do nothing;

-- sort_order 135: between Дренаж (130) and Послеоперационное ведение (140).
insert into public.document_type_fields (document_type_id, section_id, field_definition_id, is_mandatory, is_visible, sort_order)
select 'c1000000-0000-0000-0000-000000000011', dtf.section_id, fd.id, true, true, 135
from public.field_definitions fd
join public.document_type_fields dtf
  on dtf.document_type_id = 'c1000000-0000-0000-0000-000000000011'
 and dtf.field_definition_id = (select id from public.field_definitions where attribute_code = 'surg.postop_management')
where fd.attribute_code = 'surg.postop_destination'
on conflict (document_type_id, field_definition_id) do nothing;
