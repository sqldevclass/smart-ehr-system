-- Migration:
-- 1) Hide 3 fields (obj.objective "Объективная оценка", obj.skin "Кожа",
--    psych.pathology "Патология") everywhere they currently appear --
--    all have historical data, so is_visible=false (not deleted),
--    same pattern as tx.special_diet.
-- 2) Replace the 7 psych.* boolean fields (zero data, safe to remove)
--    with a new C-SSRS (Columbia-Suicide Severity Rating Scale) block,
--    rendered inside the existing "Объективная оценка" tab by a
--    dedicated frontend component (not the generic field renderer,
--    since it needs skip logic + a risk-alert banner). The 7 new
--    field_definitions are still mapped into document_type_fields
--    (is_visible=false) for the same 6 document types that had the
--    old psych section, so their values save/load through the normal
--    patient_document_field_values path.

-- ============================================================
-- 1) Hide obj.objective / obj.skin / psych.pathology everywhere
-- ============================================================
update document_type_fields
set is_visible = false
where field_definition_id in (
  select id from field_definitions
  where attribute_code in ('obj.objective', 'obj.skin', 'psych.pathology')
);

-- ============================================================
-- 2a) Remove the old psych.* mappings from the 6 document types
--     that had them -- zero data recorded against these, confirmed
--     safe to unmap outright rather than hide.
-- ============================================================
delete from document_type_fields
where field_definition_id in (
  select id from field_definitions
  where attribute_code in (
    'psych.depression', 'psych.anxiety', 'psych.thought_disorder',
    'psych.social_support', 'psych.negative_thoughts',
    'psych.mental_assessment', 'psych.self_harm_risk'
  )
)
and document_type_id in (
  select id from document_types
  where code in (
    'anesthesiologist_exam', 'diagnosis_justification', 'discharge_summary',
    'post_mortem_summary', 'pre_operative_summary', 'primary_physician_exam'
  )
);

-- ============================================================
-- 2b) New C-SSRS field_definitions (fixed UUIDs -- the frontend
--     component references these directly, same pattern as the
--     hardcoded nutrition-screening field IDs in DocumentSection.tsx).
-- ============================================================
insert into field_definitions (id, attribute_code, label_ru, field_type, is_mandatory, sort_order)
values
  ('e1000000-0000-0000-0000-000000000201', 'cssrs.q1_wish_dead',
   'Хотели ли Вы когда-нибудь умереть? Или уснуть и не проснуться?', 'boolean', false, 0),
  ('e1000000-0000-0000-0000-000000000202', 'cssrs.q2_suicidal_thoughts',
   'Были ли у Вас когда-либо мысли о самоубийстве?', 'boolean', false, 0),
  ('e1000000-0000-0000-0000-000000000203', 'cssrs.q3_method',
   'Обдумывали ли Вы о том как могли бы сделать это?', 'boolean', false, 0),
  ('e1000000-0000-0000-0000-000000000204', 'cssrs.q4_intent',
   'Были ли у Вас намерения эти мысли исполнить?', 'boolean', false, 0),
  ('e1000000-0000-0000-0000-000000000205', 'cssrs.q5_plan',
   'Обдумывали ли Вы детали как осуществить план или как покончить жизнь?', 'boolean', false, 0),
  ('e1000000-0000-0000-0000-000000000206', 'cssrs.q6_past_attempt',
   'Когда-то в прошлом, делали ли Вы что-то или готовы были сделать что-то чтобы покончить с собой?', 'boolean', false, 0),
  ('e1000000-0000-0000-0000-000000000207', 'cssrs.q7_recent_attempt',
   'В последние 3 месяца делали ли Вы что-то или готовы были сделать что-то чтобы покончить с собой?', 'boolean', false, 0)
on conflict (id) do nothing;

-- ============================================================
-- 2c) Map the 7 new fields into document_type_fields for the same
--     6 document types, in the objective_assessment_full section,
--     hidden from the generic renderer (is_visible=false) since the
--     dedicated CSSRSSection component renders them instead.
-- ============================================================
insert into document_type_fields (document_type_id, section_id, field_definition_id, sort_order, is_mandatory, is_visible)
select dt.id, 'a1000000-0000-0000-0000-000000000003', fd.id, ordering.sort_order_override, false, false
from document_types dt
cross join (
  values
    ('cssrs.q1_wish_dead', 100),
    ('cssrs.q2_suicidal_thoughts', 110),
    ('cssrs.q3_method', 120),
    ('cssrs.q4_intent', 130),
    ('cssrs.q5_plan', 140),
    ('cssrs.q6_past_attempt', 150),
    ('cssrs.q7_recent_attempt', 160)
) as ordering(attribute_code, sort_order_override)
join field_definitions fd on fd.attribute_code = ordering.attribute_code
where dt.code in (
  'anesthesiologist_exam', 'diagnosis_justification', 'discharge_summary',
  'post_mortem_summary', 'pre_operative_summary', 'primary_physician_exam'
)
on conflict (document_type_id, field_definition_id) do nothing;
