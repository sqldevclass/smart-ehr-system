-- "Центральное венозное давление" -> "ЦВД". vitals.cvp is used only by
-- daily_note, so this is a safe in-place rename with no cross-document
-- impact.
update field_definitions set label_ru = 'ЦВД'
where id = 'b1000000-0000-0000-0000-000000000019';
