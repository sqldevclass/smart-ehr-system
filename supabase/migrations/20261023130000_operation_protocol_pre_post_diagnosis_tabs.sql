-- Протокол операции: replace the shared "Диагноз" tab (hospitalization diagnosis list,
-- not tied to the protocol) with two tabs that use the protocol's OWN coded fields:
--   Предоперационный диагноз  -> diag.preop   (mandatory)
--   Послеоперационный диагноз -> diag.postop  (mandatory)
-- Each renders the shared ICD-10 picker and is stored per document as "CODE — название",
-- which is what the pre/post diagnosis discrepancy report needs.
-- Only the operation_protocol document type changes; the field definitions stay shared
-- with interventional_radiology / high_risk_procedure, which keep their own "Диагноз" tab.
-- Existing protocols have no value in these fields and will show "Не заполнено".

insert into public.document_sections (id, code, name_ru, name_en)
select v.id, v.code, v.name_ru, v.name_en
from (values
  ('d2000000-0000-0000-0000-000000000015'::uuid, 'preop_diagnosis',  'Предоперационный диагноз',  'Pre-operative diagnosis'),
  ('d2000000-0000-0000-0000-000000000016'::uuid, 'postop_diagnosis', 'Послеоперационный диагноз', 'Post-operative diagnosis')
) as v(id, code, name_ru, name_en)
where not exists (select 1 from public.document_sections s where s.code = v.code);

-- Tab order: Предоперационный (10), Послеоперационный (15), then the existing tabs (20, 30).
insert into public.document_type_sections (document_type_id, section_id, sort_order)
select dt.id, s.id, case s.code when 'preop_diagnosis' then 10 else 15 end
from public.document_types dt
join public.document_sections s on s.code in ('preop_diagnosis', 'postop_diagnosis')
where dt.code = 'operation_protocol'
on conflict (document_type_id, section_id) do nothing;

-- Move the two fields into their own tabs and make them mandatory.
update public.document_type_fields dtf
   set section_id = (select id from public.document_sections where code = 'preop_diagnosis'),
       is_mandatory = true,
       is_visible = true,
       sort_order = 10
  from public.document_types dt, public.field_definitions fd
 where dt.code = 'operation_protocol'
   and dtf.document_type_id = dt.id
   and fd.id = dtf.field_definition_id
   and fd.attribute_code = 'diag.preop';

update public.document_type_fields dtf
   set section_id = (select id from public.document_sections where code = 'postop_diagnosis'),
       is_mandatory = true,
       is_visible = true,
       sort_order = 10
  from public.document_types dt, public.field_definitions fd
 where dt.code = 'operation_protocol'
   and dtf.document_type_id = dt.id
   and fd.id = dtf.field_definition_id
   and fd.attribute_code = 'diag.postop';

-- The old shared "Диагноз" tab is no longer part of this document type.
delete from public.document_type_sections dts
 using public.document_types dt, public.document_sections s
 where dt.code = 'operation_protocol'
   and dts.document_type_id = dt.id
   and s.id = dts.section_id
   and s.code = 'diagnosis';
