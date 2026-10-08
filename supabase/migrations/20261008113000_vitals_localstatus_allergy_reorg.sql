-- Migration: Reorganize Объективная оценка tab layout
--
-- 1) Move the 9 "Физикальные показатели" (vitals) fields into the top of
--    objective_assessment_full, above "Общее состояние", for every document
--    type where vitals was a separate tab AND an Объективная оценка tab
--    exists. Negative sort_order guarantees they render first regardless of
--    each document type's own numbering scheme (10/20/30... or 1/2/3...).
--    discharge_summary already had these fields in objective_assessment_full
--    (from an earlier migration) but at the bottom (sort 180-260) -- this
--    repositions them to the top too.
--    Excluded per explicit decision: brief_admission_exam, transfer_summary,
--    daily_note -- none of these have an objective_assessment_full tab.
--
-- 2) Delete the now-empty "vitals" document_type_sections rows for the same
--    document types (including discharge_summary's stale empty tab left
--    over from the earlier migration).
--
-- 3) Move "Локальный статус" (obj.local_status) into objective_assessment_full,
--    positioned just above the C-SSRS block (sort_order 95, between the
--    systems-review fields ending at 90 and C-SSRS starting at 100).
--    Excluded per explicit decision: transfer_summary (no objective_assessment_full
--    tab, and its local_status tab also bundles obj.general + tx.recommendations).
--    consultation and primary_nursing_assessment already have this field inside
--    objective_assessment_full -- no action needed for them.
--
-- 4) Delete the now-empty "local_status" document_type_sections rows for the
--    same 7 document types (not transfer_summary).
--
-- 5) Move "Аллергия" tab to immediately follow "Объективная оценка" for every
--    document type that has both tabs. primary_nursing_exam needs a full
--    renumber since its scheme is tightly packed (1-16) with allergy
--    originally positioned before objective_assessment_full.

-- ============================================================
-- 1) Vitals fields -> top of objective_assessment_full
-- ============================================================
update document_type_fields dtf
set section_id = 'a1000000-0000-0000-0000-000000000003', -- objective_assessment_full
    sort_order = case fd.attribute_code
      when 'vitals.bp' then -90
      when 'vitals.pulse' then -80
      when 'vitals.heart_rate' then -70
      when 'vitals.rr' then -60
      when 'vitals.spo2' then -50
      when 'vitals.temperature' then -40
      when 'vitals.height' then -30
      when 'vitals.weight' then -20
      when 'vitals.bmi' then -10
      when 'bmi_nursing' then -10
    end
from field_definitions fd
where dtf.field_definition_id = fd.id
and dtf.document_type_id in (
  select id from document_types where code in (
    'anesthesiologist_exam', 'consilium', 'consultation', 'diagnosis_justification',
    'post_mortem_summary', 'pre_operative_summary', 'primary_nursing_assessment',
    'primary_nursing_exam', 'primary_physician_exam', 'discharge_summary'
  )
)
and fd.attribute_code in (
  'vitals.bp', 'vitals.pulse', 'vitals.heart_rate', 'vitals.rr', 'vitals.spo2',
  'vitals.temperature', 'vitals.height', 'vitals.weight', 'vitals.bmi', 'bmi_nursing'
);

-- ============================================================
-- 2) Remove the now-empty "vitals" tab for those same document types
-- ============================================================
delete from document_type_sections
where section_id = (select id from document_sections where code = 'vitals')
and document_type_id in (
  select id from document_types where code in (
    'anesthesiologist_exam', 'consilium', 'consultation', 'diagnosis_justification',
    'post_mortem_summary', 'pre_operative_summary', 'primary_nursing_assessment',
    'primary_nursing_exam', 'primary_physician_exam', 'discharge_summary'
  )
);

-- ============================================================
-- 3) Локальный статус -> inside objective_assessment_full, above C-SSRS
-- ============================================================
update document_type_fields dtf
set section_id = 'a1000000-0000-0000-0000-000000000003',
    sort_order = 95
from field_definitions fd
where dtf.field_definition_id = fd.id
and fd.attribute_code = 'obj.local_status'
and dtf.document_type_id in (
  select id from document_types where code in (
    'anesthesiologist_exam', 'consilium', 'diagnosis_justification', 'discharge_summary',
    'post_mortem_summary', 'pre_operative_summary', 'primary_physician_exam'
  )
);

-- ============================================================
-- 4) Remove the now-empty "local_status" tab for those same 7 document types
-- ============================================================
delete from document_type_sections
where section_id = (select id from document_sections where code = 'local_status')
and document_type_id in (
  select id from document_types where code in (
    'anesthesiologist_exam', 'consilium', 'diagnosis_justification', 'discharge_summary',
    'post_mortem_summary', 'pre_operative_summary', 'primary_physician_exam'
  )
);

-- ============================================================
-- 5a) Move Аллергия tab to immediately follow Объективная оценка (sort 30)
--     for the 9 document types that use the 10/20/30... scheme and now have
--     a free slot at 31.
-- ============================================================
update document_type_sections
set sort_order = 31
where section_id = (select id from document_sections where code = 'allergy_assessment_nursing')
and document_type_id in (
  select id from document_types where code in (
    'anesthesiologist_exam', 'consilium', 'consultation', 'diagnosis_justification',
    'discharge_summary', 'post_mortem_summary', 'pre_operative_summary',
    'primary_nursing_assessment', 'primary_physician_exam'
  )
);

-- ============================================================
-- 5b) primary_nursing_exam: tight 1-16 scheme with allergy originally before
--     objective_assessment_full -- full explicit renumber to move allergy
--     to right after it.
-- ============================================================
update document_type_sections dts
set sort_order = v.new_sort
from (
  values
    ('patient_arrival', 1),
    ('functional_status_assessment', 2),
    ('communication_management', 3),
    ('spiritual_cultural_needs', 4),
    ('pain_assessment_nursing', 5),
    ('medications_brought', 6),
    ('morse_fall_scale', 7),
    ('behavior_assessment', 8),
    ('objective_assessment_full', 9),
    ('allergy_assessment_nursing', 10),
    ('nutrition_assessment_nursing', 11),
    ('nursing_care_plan', 12),
    ('discharge_readiness_check', 13),
    ('sick_leave_certificate', 14),
    ('head_nurse_note', 15)
) as v(section_code, new_sort)
join document_sections ds on ds.code = v.section_code
where dts.section_id = ds.id
and dts.document_type_id = (select id from document_types where code = 'primary_nursing_exam');
