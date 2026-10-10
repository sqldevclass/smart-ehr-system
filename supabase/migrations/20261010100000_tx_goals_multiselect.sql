-- "Цели госпитализации" (tx.goals) in primary_physician_exam is currently
-- a free textarea. tx.goals is only mapped into primary_physician_exam
-- (not shared with any other document type), so it's safe to convert it
-- in place rather than hide-and-recreate: reuse the existing "multiselect"
-- field_type (already checkbox-based, already used by 12 other fields)
-- with the 7 requested options. Horizontal layout for this field is a
-- frontend-only change (no schema impact).

update field_definitions
set field_type = 'multiselect',
    options = '[
      {"value":"prepare_surgery","label_ru":"Подготовиться к операции"},
      {"value":"prepare_examination","label_ru":"Подготовиться к исследованию"},
      {"value":"determine_treatment_tactics","label_ru":"Определение тактику лечения"},
      {"value":"establish_diagnosis","label_ru":"Установка диагноза"},
      {"value":"inpatient_treatment","label_ru":"Получение стационарного лечения"},
      {"value":"outpatient_treatment","label_ru":"Получение амбулаторного лечения"},
      {"value":"chemotherapy","label_ru":"Химиотерапия"}
    ]'::jsonb
where attribute_code = 'tx.goals';
