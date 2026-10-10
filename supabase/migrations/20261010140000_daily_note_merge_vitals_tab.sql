-- Move daily_note's "Физикальные показатели" fields onto the "Дневниковая
-- запись" tab, right after "Время осмотра пациента" (sort_order 5) and
-- before "Общее состояние" (sort_order 20). Scoped to daily_note only --
-- the "vitals" section is shared with other document types, which keep
-- their own separate Физикальные показатели tab untouched.

update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000001', sort_order = 6
where document_type_id = 'c1000000-0000-0000-0000-000000000002' and id = '623f32cc-6282-4aef-91d8-af812b18527d'; -- vitals.bp

update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000001', sort_order = 7
where document_type_id = 'c1000000-0000-0000-0000-000000000002' and id = '90016538-907a-4eed-b30b-00c9050219c1'; -- vitals.pulse

update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000001', sort_order = 8
where document_type_id = 'c1000000-0000-0000-0000-000000000002' and id = 'fe590881-ac32-4282-8afb-cfe69873c8c2'; -- vitals.rr

update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000001', sort_order = 9
where document_type_id = 'c1000000-0000-0000-0000-000000000002' and id = '2ead9aba-7e33-4eaa-ab76-7a19065392ba'; -- vitals.spo2

update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000001', sort_order = 10
where document_type_id = 'c1000000-0000-0000-0000-000000000002' and id = 'bbb529e3-4d3b-4082-8f54-96597fdd591b'; -- vitals.temperature

update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000001', sort_order = 11
where document_type_id = 'c1000000-0000-0000-0000-000000000002' and id = '3bba98db-21ea-4046-8cbc-6491459e8b30'; -- vitals.cvp

update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000001', sort_order = 12
where document_type_id = 'c1000000-0000-0000-0000-000000000002' and id = '50668a60-0cc0-4d75-9b8d-68b43cbaf51a'; -- vitals.height

update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000001', sort_order = 13
where document_type_id = 'c1000000-0000-0000-0000-000000000002' and id = '7cc520f6-a3a7-42b2-bee3-c4df43e3efbb'; -- vitals.weight

update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000001', sort_order = 14
where document_type_id = 'c1000000-0000-0000-0000-000000000002' and id = '7b489a83-5c6b-4fbd-93ac-87617e1744fe'; -- vitals.bmi

-- remove the now-empty "Физикальные показатели" tab for daily_note only
delete from document_type_sections
where document_type_id = 'c1000000-0000-0000-0000-000000000002'
  and section_id = 'a1000000-0000-0000-0000-000000000002'; -- vitals
