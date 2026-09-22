-- Migration 186: Нутриционный скрининг (Nutritional Screening) scoring.
--
-- Confirmed before making any change: nutri.weight_loss_3m,
-- nutri.intake_reduction, nutri.stress_factor are shared across 7
-- document types (Предоперационный эпикриз, Посмертный эпикриз,
-- Первичный осмотр врача, Обоснование диагноза, Выписной эпикриз,
-- Осмотр анестезиолога, Карта первичного сестринского осмотра).
-- Only junk test values exist in patient_document_field_values for
-- them (checked directly) -- safe to convert type.
--
-- No "calculated" field anywhere in the app has ever had an actual
-- formula behind it (checked: zero references in the frontend, zero
-- DB triggers) -- nutri.total_score has been a dead read-only box.
-- The real computation is added in DocumentSection.tsx, not here --
-- this migration only fixes the data model it depends on.

-- ============================================================
-- 1. New field: BMI below 20.5 -- was missing entirely.
-- ============================================================

INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, options, unit, is_mandatory)
VALUES (
  'd3000000-0000-0000-0000-000000000100', 'nutri.bmi_low',
  'BMI ниже 20,5 кг/м2', 'BMI below 20.5 kg/m2', 'boolean', NULL, NULL, false
);

-- Link it into the same 7 document types that already use the
-- other nutrition-screening fields, at the same section, sorting
-- first (-1, so no existing sort_order needs renumbering).
INSERT INTO public.document_type_fields (document_type_id, section_id, field_definition_id, sort_order, is_mandatory, is_visible)
SELECT DISTINCT dtf.document_type_id, dtf.section_id, 'd3000000-0000-0000-0000-000000000100'::uuid, -1, false, true
FROM public.document_type_fields dtf
WHERE dtf.field_definition_id = 'b1000000-0000-0000-0000-000000000050';

-- ============================================================
-- 2. Convert the two Yes/No questions from free text to boolean.
-- ============================================================

UPDATE public.field_definitions
SET field_type = 'boolean'
WHERE id IN (
  'b1000000-0000-0000-0000-000000000050', -- nutri.weight_loss_3m
  'b1000000-0000-0000-0000-000000000051'  -- nutri.intake_reduction
);

-- ============================================================
-- 3. Convert the severity question from free text to a real select.
-- ============================================================

UPDATE public.field_definitions
SET field_type = 'select',
    options = '[
      {"value": "0", "label_ru": "0 - нет"},
      {"value": "1", "label_ru": "1 - умеренный (неосложненная операция, воспаления, хроническая болезнь, пролежни, инсульт, диабет, цирроз, воспалительные заболевания кишечника, хроническая обструктивная болезнь легких, почечная недостаточность)"},
      {"value": "2", "label_ru": "2 - тяжелый (сепсис, обширная операция, осложнения)"}
    ]'::jsonb
WHERE id = 'b1000000-0000-0000-0000-000000000052'; -- nutri.stress_factor

-- ============================================================
-- 4. Clear junk test values that no longer fit the new types.
-- ============================================================

DELETE FROM public.patient_document_field_values
WHERE field_definition_id IN (
  'b1000000-0000-0000-0000-000000000050',
  'b1000000-0000-0000-0000-000000000051',
  'b1000000-0000-0000-0000-000000000052'
);
