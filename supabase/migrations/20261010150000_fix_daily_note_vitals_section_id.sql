-- Fix: the previous migration (20261010140000) moved daily_note's vitals
-- fields onto the wrong section_id (complaints_and_history instead of
-- daily_note_main), which isn't even mapped to daily_note -- so the 9
-- fields became invisible. Correct the section_id to daily_note_main,
-- keeping the same sort_order placement (6-14, right after "Время
-- осмотра пациента" at sort_order 5).

update document_type_fields set section_id = 'a1000000-0000-0000-0000-000000000021'
where document_type_id = 'c1000000-0000-0000-0000-000000000002'
  and id in (
    '623f32cc-6282-4aef-91d8-af812b18527d', -- vitals.bp
    '90016538-907a-4eed-b30b-00c9050219c1', -- vitals.pulse
    'fe590881-ac32-4282-8afb-cfe69873c8c2', -- vitals.rr
    '2ead9aba-7e33-4eaa-ab76-7a19065392ba', -- vitals.spo2
    'bbb529e3-4d3b-4082-8f54-96597fdd591b', -- vitals.temperature
    '3bba98db-21ea-4046-8cbc-6491459e8b30', -- vitals.cvp
    '50668a60-0cc0-4d75-9b8d-68b43cbaf51a', -- vitals.height
    '7cc520f6-a3a7-42b2-bee3-c4df43e3efbb', -- vitals.weight
    '7b489a83-5c6b-4fbd-93ac-87617e1744fe'  -- vitals.bmi
  );
