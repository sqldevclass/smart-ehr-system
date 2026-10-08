-- Migration: convert 7 psych.* fields to boolean (global — these
-- field_definitions are shared across anesthesiologist_exam,
-- diagnosis_justification, discharge_summary, post_mortem_summary,
-- pre_operative_summary, primary_physician_exam) and discard the
-- historical free-text values that are incompatible with a boolean.
--
-- psych.pathology ("Патология") is intentionally NOT touched -- stays
-- textarea, was not requested.

-- ============================================================
-- 1) Delete historical free-text values for these 7 fields -- they
--    predate the boolean switch and can't be mapped to true/false
--    automatically. Confirmed with the user to discard rather than
--    guess at a mapping.
-- ============================================================
delete from patient_document_field_values
where field_definition_id in (
  select id from field_definitions
  where attribute_code in (
    'psych.depression',
    'psych.anxiety',
    'psych.thought_disorder',
    'psych.social_support',
    'psych.negative_thoughts',
    'psych.mental_assessment',
    'psych.self_harm_risk'
  )
);

-- ============================================================
-- 2) Flip field_type to boolean -- applies everywhere these field
--    definitions are used (field_type lives on field_definitions,
--    not per document type).
-- ============================================================
update field_definitions
set field_type = 'boolean'
where attribute_code in (
  'psych.depression',
  'psych.anxiety',
  'psych.thought_disorder',
  'psych.social_support',
  'psych.negative_thoughts',
  'psych.mental_assessment',
  'psych.self_harm_risk'
);
