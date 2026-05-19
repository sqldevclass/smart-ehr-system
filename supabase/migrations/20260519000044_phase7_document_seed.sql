-- Migration 044: Phase 7 â€” Document Seed Data
-- Sections, field definitions, document types, and their mappings
-- Based on 22 clinical document templates from Project Documents folder

-- ============================================================
-- PART 1: DOCUMENT SECTIONS (12 reusable sections)
-- ============================================================
INSERT INTO public.document_sections (id, code, name_ru, name_en) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'complaints_and_history',    'Ð–Ð°Ð»Ð¾Ð±Ñ‹ Ð¸ ÐÐ½Ð°Ð¼Ð½ÐµÐ·',                    'Complaints & History'),
  ('a1000000-0000-0000-0000-000000000002', 'vitals',                     'Ð¤Ð¸Ð·Ð¸ÐºÐ°Ð»ÑŒÐ½Ñ‹Ðµ Ð¿Ð¾ÐºÐ°Ð·Ð°Ñ‚ÐµÐ»Ð¸',               'Vitals'),
  ('a1000000-0000-0000-0000-000000000003', 'objective_assessment_full',  'ÐžÐ±ÑŠÐµÐºÑ‚Ð¸Ð²Ð½Ð°Ñ Ð¾Ñ†ÐµÐ½ÐºÐ°',                   'Objective Assessment'),
  ('a1000000-0000-0000-0000-000000000004', 'nutritional_screening',      'ÐÑƒÑ‚Ñ€Ð¸Ñ†Ð¸Ð¾Ð½Ð½Ñ‹Ð¹ ÑÐºÑ€Ð¸Ð½Ð¸Ð½Ð³',                'Nutritional Screening'),
  ('a1000000-0000-0000-0000-000000000005', 'local_status',               'Ð›Ð¾ÐºÐ°Ð»ÑŒÐ½Ñ‹Ð¹ ÑÑ‚Ð°Ñ‚ÑƒÑ',                     'Local Status'),
  ('a1000000-0000-0000-0000-000000000006', 'diagnosis',                  'Ð”Ð¸Ð°Ð³Ð½Ð¾Ð·',                              'Diagnosis'),
  ('a1000000-0000-0000-0000-000000000007', 'treatment_plan',             'ÐŸÐ»Ð°Ð½ Ð»ÐµÑ‡ÐµÐ½Ð¸Ñ',                         'Treatment Plan'),
  ('a1000000-0000-0000-0000-000000000008', 'discharge_plan',             'ÐŸÐ»Ð°Ð½ Ð²Ñ‹Ð¿Ð¸ÑÐºÐ¸',                         'Discharge Plan'),
  ('a1000000-0000-0000-0000-000000000009', 'surgical_plan',              'ÐŸÐ»Ð°Ð½ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸',                        'Surgical Plan'),
  ('a1000000-0000-0000-0000-000000000010', 'procedures_performed',       'ÐŸÑ€Ð¾Ð²ÐµÐ´Ñ‘Ð½Ð½Ñ‹Ðµ Ð²Ð¼ÐµÑˆÐ°Ñ‚ÐµÐ»ÑŒÑÑ‚Ð²Ð°',            'Procedures Performed'),
  ('a1000000-0000-0000-0000-000000000011', 'participants',               'Ð£Ñ‡Ð°ÑÑ‚Ð½Ð¸ÐºÐ¸',                            'Participants'),
  ('a1000000-0000-0000-0000-000000000012', 'verification_checklist',     'Ð’ÐµÑ€Ð¸Ñ„Ð¸ÐºÐ°Ñ†Ð¸Ñ',                          'Verification Checklist'),
  ('a1000000-0000-0000-0000-000000000013', 'conclusion',                 'Ð—Ð°ÐºÐ»ÑŽÑ‡ÐµÐ½Ð¸Ðµ',                           'Conclusion'),
  ('a1000000-0000-0000-0000-000000000014', 'transfer_criteria_scores',   'ÐšÑ€Ð¸Ñ‚ÐµÑ€Ð¸Ð¸ Ð¿ÐµÑ€ÐµÐ²Ð¾Ð´Ð°',                    'Transfer Criteria'),
  ('a1000000-0000-0000-0000-000000000015', 'perfusion_data',             'Ð”Ð°Ð½Ð½Ñ‹Ðµ Ð¿ÐµÑ€Ñ„ÑƒÐ·Ð¸Ð¸',                      'Perfusion Data'),
  ('a1000000-0000-0000-0000-000000000016', 'echo_m_mode',                'Ðœ-Ñ€ÐµÐ¶Ð¸Ð¼',                              'M-Mode'),
  ('a1000000-0000-0000-0000-000000000017', 'echo_b_mode',                'Ð’-Ñ€ÐµÐ¶Ð¸Ð¼',                              'B-Mode'),
  ('a1000000-0000-0000-0000-000000000018', 'echo_doppler',               'Ð”Ð¾Ð¿Ð¿Ð»ÐµÑ€Ð¾Ð³Ñ€Ð°Ñ„Ð¸Ñ',                       'Doppler'),
  ('a1000000-0000-0000-0000-000000000019', 'uzi_findings',               'Ð”Ð°Ð½Ð½Ñ‹Ðµ Ð£Ð—Ð˜',                           'Ultrasound Findings'),
  ('a1000000-0000-0000-0000-000000000020', 'ecg_findings',               'Ð”Ð°Ð½Ð½Ñ‹Ðµ Ð­ÐšÐ“',                           'ECG Findings'),
  ('a1000000-0000-0000-0000-000000000021', 'daily_note_main',            'Ð”Ð½ÐµÐ²Ð½Ð¸ÐºÐ¾Ð²Ð°Ñ Ð·Ð°Ð¿Ð¸ÑÑŒ',                   'Daily Note');

-- ============================================================
-- PART 2: FIELD DEFINITIONS
-- attribute_code is the permanent cross-document join key
-- NEVER change an attribute_code after it is seeded
-- ============================================================

-- â”€â”€ Complaints & History â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'history.complaints',         'Ð–Ð°Ð»Ð¾Ð±Ñ‹',                                          'Complaints',                    'textarea', 10),
  ('b1000000-0000-0000-0000-000000000002', 'history.anamnesis_morbi',    'ÐÐ½Ð°Ð¼Ð½ÐµÐ· Ð¼Ð¾Ñ€Ð±Ð¸',                                   'History of Present Illness',    'textarea', 20),
  ('b1000000-0000-0000-0000-000000000003', 'history.allergies',          'ÐÐ»Ð»ÐµÑ€Ð³Ð¸Ñ',                                        'Allergies',                     'textarea', 30),
  ('b1000000-0000-0000-0000-000000000004', 'history.past_illnesses',     'ÐŸÐµÑ€ÐµÐ½ÐµÑÑ‘Ð½Ð½Ñ‹Ðµ Ð·Ð°Ð±Ð¾Ð»ÐµÐ²Ð°Ð½Ð¸Ñ',                        'Past Illnesses',                'textarea', 40),
  ('b1000000-0000-0000-0000-000000000005', 'history.epidemiology',       'Ð­Ð¿Ð¸Ð´ÐµÐ¼Ð¸Ð¾Ð»Ð¾Ð³Ð¸Ñ‡ÐµÑÐºÐ¸Ð¹ Ð°Ð½Ð°Ð¼Ð½ÐµÐ· / Ð¿ÐµÑ€ÐµÐ»Ð¸Ð²Ð°Ð½Ð¸Ðµ ÐºÑ€Ð¾Ð²Ð¸',  'Epidemiological History',       'textarea', 50),
  ('b1000000-0000-0000-0000-000000000006', 'history.past_surgeries',     'ÐŸÐµÑ€ÐµÐ½ÐµÑÑ‘Ð½Ð½Ñ‹Ðµ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸',                           'Past Surgeries',                'textarea', 60),
  ('b1000000-0000-0000-0000-000000000007', 'history.medication_history', 'Ð›ÐµÐºÐ°Ñ€ÑÑ‚Ð²ÐµÐ½Ð½Ñ‹Ð¹ Ð°Ð½Ð°Ð¼Ð½ÐµÐ·',                           'Medication History',            'textarea', 70),
  ('b1000000-0000-0000-0000-000000000008', 'history.social_history',     'Ð¡Ð¾Ñ†Ð¸Ð°Ð»ÑŒÐ½Ñ‹Ð¹ Ð°Ð½Ð°Ð¼Ð½ÐµÐ·',                              'Social History',                'textarea', 80);

-- â”€â”€ Vitals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, unit, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000010', 'vitals.bp',          'ÐÑ€Ñ‚ÐµÑ€Ð¸Ð°Ð»ÑŒÐ½Ð¾Ðµ Ð´Ð°Ð²Ð»ÐµÐ½Ð¸Ðµ',  'Blood Pressure',    'text',   'Ð¼Ð¼ Ñ€Ñ‚.ÑÑ‚.', 10),
  ('b1000000-0000-0000-0000-000000000011', 'vitals.pulse',       'ÐŸÑƒÐ»ÑŒÑ',                  'Pulse',             'number', 'ÑƒÐ´/Ð¼Ð¸Ð½',    20),
  ('b1000000-0000-0000-0000-000000000012', 'vitals.heart_rate',  'Ð§Ð¡Ð¡',                    'Heart Rate',        'number', 'ÑƒÐ´/Ð¼Ð¸Ð½',    30),
  ('b1000000-0000-0000-0000-000000000013', 'vitals.rr',          'Ð§Ð°ÑÑ‚Ð¾Ñ‚Ð° Ð´Ñ‹Ñ…Ð°Ð½Ð¸Ñ',        'Respiratory Rate',  'number', 'Ð²/Ð¼Ð¸Ð½',     40),
  ('b1000000-0000-0000-0000-000000000014', 'vitals.spo2',        'Ð¡Ð°Ñ‚ÑƒÑ€Ð°Ñ†Ð¸Ñ SpO2',         'SpO2',              'number', '%',         50),
  ('b1000000-0000-0000-0000-000000000015', 'vitals.temperature', 'Ð¢ÐµÐ¼Ð¿ÐµÑ€Ð°Ñ‚ÑƒÑ€Ð° Ñ‚ÐµÐ»Ð°',       'Temperature',       'number', 'Â°C',        60),
  ('b1000000-0000-0000-0000-000000000016', 'vitals.height',      'Ð Ð¾ÑÑ‚',                   'Height',            'number', 'ÑÐ¼',        70),
  ('b1000000-0000-0000-0000-000000000017', 'vitals.weight',      'Ð’ÐµÑ',                    'Weight',            'number', 'ÐºÐ³',        80),
  ('b1000000-0000-0000-0000-000000000018', 'vitals.bmi',         'Ð˜ÐœÐ¢',                    'BMI',               'calculated', NULL,    90),
  ('b1000000-0000-0000-0000-000000000019', 'vitals.cvp',         'Ð¦ÐµÐ½Ñ‚Ñ€Ð°Ð»ÑŒÐ½Ð¾Ðµ Ð²ÐµÐ½Ð¾Ð·Ð½Ð¾Ðµ Ð´Ð°Ð²Ð»ÐµÐ½Ð¸Ðµ', 'CVP',        'number', 'Ð¼Ð¼ Ñ€Ñ‚.ÑÑ‚.', 100),
  ('b1000000-0000-0000-0000-000000000020', 'vitals.exam_time',   'Ð’Ñ€ÐµÐ¼Ñ Ð¾ÑÐ¼Ð¾Ñ‚Ñ€Ð° Ð¿Ð°Ñ†Ð¸ÐµÐ½Ñ‚Ð°', 'Exam Time',         'datetime', NULL,      5);

-- â”€â”€ Objective Assessment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000030', 'obj.general',        'ÐžÐ±Ñ‰ÐµÐµ ÑÐ¾ÑÑ‚Ð¾ÑÐ½Ð¸Ðµ',                'General Condition',       'textarea', 10),
  ('b1000000-0000-0000-0000-000000000031', 'obj.objective',      'ÐžÐ±ÑŠÐµÐºÑ‚Ð¸Ð²Ð½Ð°Ñ Ð¾Ñ†ÐµÐ½ÐºÐ°',             'Objective Assessment',    'textarea', 20),
  ('b1000000-0000-0000-0000-000000000032', 'obj.skin',           'ÐšÐ¾Ð¶Ð°',                           'Skin',                    'textarea', 30),
  ('b1000000-0000-0000-0000-000000000033', 'obj.cv',             'Ð¡ÐµÑ€Ð´ÐµÑ‡Ð½Ð¾-ÑÐ¾ÑÑƒÐ´Ð¸ÑÑ‚Ð°Ñ ÑÐ¸ÑÑ‚ÐµÐ¼Ð°',    'Cardiovascular',          'textarea', 40),
  ('b1000000-0000-0000-0000-000000000034', 'obj.resp',           'Ð ÐµÑÐ¿Ð¸Ñ€Ð°Ñ‚Ð¾Ñ€Ð½Ð°Ñ ÑÐ¸ÑÑ‚ÐµÐ¼Ð°',          'Respiratory',             'textarea', 50),
  ('b1000000-0000-0000-0000-000000000035', 'obj.musculoskeletal','ÐžÐ¿Ð¾Ñ€Ð½Ð¾-Ð´Ð²Ð¸Ð³Ð°Ñ‚ÐµÐ»ÑŒÐ½Ð°Ñ ÑÐ¸ÑÑ‚ÐµÐ¼Ð°',    'Musculoskeletal',         'textarea', 60),
  ('b1000000-0000-0000-0000-000000000036', 'obj.gu',             'ÐœÐ¾Ñ‡ÐµÐ¿Ð¾Ð»Ð¾Ð²Ð°Ñ ÑÐ¸ÑÑ‚ÐµÐ¼Ð°',            'Genitourinary',           'textarea', 70),
  ('b1000000-0000-0000-0000-000000000037', 'obj.gi',             'ÐŸÐ¸Ñ‰ÐµÐ²Ð°Ñ€Ð¸Ñ‚ÐµÐ»ÑŒÐ½Ð°Ñ ÑÐ¸ÑÑ‚ÐµÐ¼Ð°',        'Gastrointestinal',        'textarea', 80),
  ('b1000000-0000-0000-0000-000000000038', 'obj.neuro',          'ÐÐµÐ²Ñ€Ð¾Ð»Ð¾Ð³Ð¸Ñ‡ÐµÑÐºÐ°Ñ ÑÐ¸ÑÑ‚ÐµÐ¼Ð°',        'Neurological',            'textarea', 90),
  ('b1000000-0000-0000-0000-000000000039', 'obj.local_status',   'Ð›Ð¾ÐºÐ°Ð»ÑŒÐ½Ñ‹Ð¹ ÑÑ‚Ð°Ñ‚ÑƒÑ',               'Local Status',            'textarea', 100);

-- â”€â”€ Psychological Risk (part of objective in several docs) â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000040', 'psych.depression',         'Ð”ÐµÐ¿Ñ€ÐµÑÑÐ¸Ñ',                           'Depression',          'textarea', 10),
  ('b1000000-0000-0000-0000-000000000041', 'psych.anxiety',            'Ð’Ð·Ð²Ð¾Ð»Ð½Ð¾Ð²Ð°Ð½Ð½Ð¾ÑÑ‚ÑŒ / Ð¢Ñ€ÐµÐ²Ð¾Ð³Ð°',           'Anxiety',             'textarea', 20),
  ('b1000000-0000-0000-0000-000000000042', 'psych.thought_disorder',   'ÐÐ°Ñ€ÑƒÑˆÐµÐ½Ð¸Ðµ Ñ€Ð°Ñ†Ð¸Ð¾Ð½Ð°Ð»ÑŒÐ½Ð¾Ð³Ð¾ Ð¼Ñ‹ÑˆÐ»ÐµÐ½Ð¸Ñ',    'Thought Disorder',    'textarea', 30),
  ('b1000000-0000-0000-0000-000000000043', 'psych.social_support',     'ÐÐµÐ´Ð¾ÑÑ‚Ð°Ñ‚Ð¾Ðº ÑÐ¾Ñ†Ð¸Ð°Ð»ÑŒÐ½Ð¾Ð¹ Ð¿Ð¾Ð´Ð´ÐµÑ€Ð¶ÐºÐ¸',     'Social Support',      'textarea', 40),
  ('b1000000-0000-0000-0000-000000000044', 'psych.negative_thoughts',  'ÐÐµÐ³Ð°Ñ‚Ð¸Ð²Ð½Ñ‹Ðµ Ð¼Ñ‹ÑÐ»Ð¸',                    'Negative Thoughts',   'textarea', 50),
  ('b1000000-0000-0000-0000-000000000045', 'psych.mental_assessment',  'ÐžÑ†ÐµÐ½ÐºÐ° Ð¾Ð±Ñ‰ÐµÐ³Ð¾ Ð¿ÑÐ¸Ñ…Ð¸Ñ‡ÐµÑÐºÐ¾Ð³Ð¾ ÑÐ¾ÑÑ‚Ð¾ÑÐ½Ð¸Ñ','Mental Assessment',   'textarea', 60),
  ('b1000000-0000-0000-0000-000000000046', 'psych.self_harm_risk',     'Ð Ð¸ÑÐº ÑÐ°Ð¼Ð¾Ð¿Ð¾Ð²Ñ€ÐµÐ¶Ð´ÐµÐ½Ð¸Ñ',                'Self-harm Risk',      'textarea', 70),
  ('b1000000-0000-0000-0000-000000000047', 'psych.pathology',          'ÐŸÐ°Ñ‚Ð¾Ð»Ð¾Ð³Ð¸Ñ',                           'Pathology',           'textarea', 80);

-- â”€â”€ Nutritional Screening â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000050', 'nutri.weight_loss_3m',   'ÐŸÐ¾Ñ‚ÐµÑ€Ñ Ð²ÐµÑÐ° Ð·Ð° Ð¿Ð¾ÑÐ»ÐµÐ´Ð½Ð¸Ðµ 3 Ð¼ÐµÑÑÑ†Ð°',       'Weight Loss 3 Months',  'textarea', 10),
  ('b1000000-0000-0000-0000-000000000051', 'nutri.intake_reduction',  'Ð¡Ð½Ð¸Ð¶ÐµÐ½Ð¸Ðµ Ð¿Ñ€Ð¸Ñ‘Ð¼Ð° Ð¿Ð¸Ñ‰Ð¸ Ð·Ð° Ð¿Ð¾ÑÐ»ÐµÐ´Ð½Ð¸Ð¹ Ð¼ÐµÑÑÑ†','Food Intake Reduction',  'textarea', 20),
  ('b1000000-0000-0000-0000-000000000052', 'nutri.stress_factor',    'Ð¡Ñ‚Ñ€ÐµÑÑÐ¾Ð²Ñ‹Ð¹ Ñ„Ð°ÐºÑ‚Ð¾Ñ€ / Ñ‚ÑÐ¶ÐµÑÑ‚ÑŒ Ð·Ð°Ð±Ð¾Ð»ÐµÐ²Ð°Ð½Ð¸Ñ', 'Stress Factor',         'textarea', 30),
  ('b1000000-0000-0000-0000-000000000053', 'nutri.total_score',      'ÐžÐ±Ñ‰Ð¸Ð¹ Ð±Ð°Ð»Ð»',                               'Total Score',           'calculated', 40);

-- â”€â”€ Diagnosis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000060', 'diag.main',          'ÐžÑÐ½Ð¾Ð²Ð½Ð¾Ð¹ Ð´Ð¸Ð°Ð³Ð½Ð¾Ð·',                        'Main Diagnosis',              'textarea', 10),
  ('b1000000-0000-0000-0000-000000000061', 'diag.complication',  'ÐžÑÐ»Ð¾Ð¶Ð½ÐµÐ½Ð¸Ðµ Ð¾ÑÐ½Ð¾Ð²Ð½Ð¾Ð³Ð¾ Ð´Ð¸Ð°Ð³Ð½Ð¾Ð·Ð°',           'Complication',                'textarea', 20),
  ('b1000000-0000-0000-0000-000000000062', 'diag.competing',     'ÐšÐ¾Ð½ÐºÑƒÑ€Ð¸Ñ€ÑƒÑŽÑ‰Ð¸Ð¹ Ð´Ð¸Ð°Ð³Ð½Ð¾Ð·',                   'Competing Diagnosis',         'textarea', 30),
  ('b1000000-0000-0000-0000-000000000063', 'diag.background',    'Ð¤Ð¾Ð½Ð¾Ð²Ñ‹Ð¹ Ð´Ð¸Ð°Ð³Ð½Ð¾Ð·',                         'Background Diagnosis',        'textarea', 40),
  ('b1000000-0000-0000-0000-000000000064', 'diag.concomitant',   'Ð¡Ð¾Ð¿ÑƒÑ‚ÑÑ‚Ð²ÑƒÑŽÑ‰Ð¸Ð¹ Ð´Ð¸Ð°Ð³Ð½Ð¾Ð·',                   'Concomitant Diagnosis',       'textarea', 50),
  ('b1000000-0000-0000-0000-000000000065', 'diag.preop',         'ÐŸÑ€ÐµÐ´Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¾Ð½Ð½Ñ‹Ð¹ Ð´Ð¸Ð°Ð³Ð½Ð¾Ð· (ÐœÐšÐ‘-10)',        'Preoperative Diagnosis',      'textarea', 60),
  ('b1000000-0000-0000-0000-000000000066', 'diag.postop',        'ÐŸÐ¾ÑÑ‚Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¾Ð½Ð½Ñ‹Ð¹ Ð´Ð¸Ð°Ð³Ð½Ð¾Ð· (ÐœÐšÐ‘-10)',        'Postoperative Diagnosis',     'textarea', 70),
  ('b1000000-0000-0000-0000-000000000067', 'diag.preliminary',   'ÐŸÑ€ÐµÐ´Ð²Ð°Ñ€Ð¸Ñ‚ÐµÐ»ÑŒÐ½Ñ‹Ð¹ Ð´Ð¸Ð°Ð³Ð½Ð¾Ð·',                 'Preliminary Diagnosis',       'textarea', 80);

-- â”€â”€ Treatment Plan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000070', 'tx.plan',                  'ÐŸÐ»Ð°Ð½ Ð»ÐµÑ‡ÐµÐ½Ð¸Ñ',                    'Treatment Plan',              'textarea', 10),
  ('b1000000-0000-0000-0000-000000000071', 'tx.admission_check',       'ÐŸÑ€Ð¸ Ð³Ð¾ÑÐ¿Ð¸Ñ‚Ð°Ð»Ð¸Ð·Ð°Ñ†Ð¸Ð¸ Ð¿Ñ€Ð¾Ð²ÐµÑ€ÐµÐ½Ð¾',    'Admission Check',             'textarea', 20),
  ('b1000000-0000-0000-0000-000000000072', 'tx.goals',                 'Ð¦ÐµÐ»Ð¸ Ð³Ð¾ÑÐ¿Ð¸Ñ‚Ð°Ð»Ð¸Ð·Ð°Ñ†Ð¸Ð¸',             'Goals of Admission',          'textarea', 30),
  ('b1000000-0000-0000-0000-000000000073', 'tx.lab_diagnostics',       'Ð›Ð°Ð±Ð¾Ñ€Ð°Ñ‚Ð¾Ñ€Ð½Ð°Ñ Ð´Ð¸Ð°Ð³Ð½Ð¾ÑÑ‚Ð¸ÐºÐ°',        'Laboratory Diagnostics',      'textarea', 40),
  ('b1000000-0000-0000-0000-000000000074', 'tx.specialist_consult',    'ÐšÐ¾Ð½ÑÑƒÐ»ÑŒÑ‚Ð°Ñ†Ð¸Ñ ÑÐ¿ÐµÑ†Ð¸Ð°Ð»Ð¸ÑÑ‚Ð°',        'Specialist Consultation',     'textarea', 50),
  ('b1000000-0000-0000-0000-000000000075', 'tx.prescription',          'ÐœÐµÐ´Ð¸ÐºÐ°Ð¼ÐµÐ½Ñ‚Ð¾Ð·Ð½Ñ‹Ðµ Ð½Ð°Ð·Ð½Ð°Ñ‡ÐµÐ½Ð¸Ñ',      'Prescription',                'textarea', 60),
  ('b1000000-0000-0000-0000-000000000076', 'tx.recommendations',       'Ð ÐµÐºÐ¾Ð¼ÐµÐ½Ð´Ð°Ñ†Ð¸Ð¸',                    'Recommendations',             'textarea', 70);

-- â”€â”€ Diet (shared across many documents) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000080', 'tx.diet', 'Ð”Ð¸ÐµÑ‚Ð°', 'Diet', 'select', 10),
  ('b1000000-0000-0000-0000-000000000081', 'tx.special_diet', 'Ð¡Ð¿ÐµÑ†Ð¸Ð°Ð»ÑŒÐ½Ð°Ñ Ð´Ð¸ÐµÑ‚Ð°', 'Special Diet', 'textarea', 20);

UPDATE public.field_definitions SET options = '[
  {"value":"nco","label_ru":"NCO (Ð½Ð¾Ð»ÑŒ Ð´Ð»Ñ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¾Ð½Ð½Ð¾Ð¹ ÑÐ¸ÑÑ‚ÐµÐ¼Ñ‹)"},
  {"value":"diet_1","label_ru":"Ð”Ð¸ÐµÑ‚Ð° â„–1 â€” ÑÐ·Ð²ÐµÐ½Ð½Ð°Ñ Ð±Ð¾Ð»ÐµÐ·Ð½ÑŒ Ð¶ÐµÐ»ÑƒÐ´ÐºÐ°"},
  {"value":"diet_2","label_ru":"Ð”Ð¸ÐµÑ‚Ð° â„–2 â€” Ñ…Ñ€Ð¾Ð½Ð¸Ñ‡ÐµÑÐºÐ¸Ð¹ Ð³Ð¸Ð¿Ð¾Ð°Ñ†Ð¸Ð´Ð½Ñ‹Ð¹ Ð³Ð°ÑÑ‚Ñ€Ð¸Ñ‚"},
  {"value":"diet_3","label_ru":"Ð”Ð¸ÐµÑ‚Ð° â„–3 â€” Ð·Ð°Ð¿Ð¾Ñ€Ñ‹"},
  {"value":"diet_4","label_ru":"Ð”Ð¸ÐµÑ‚Ð° â„–4 â€” ÐºÐ¸ÑˆÐµÑ‡Ð½Ñ‹Ðµ Ð·Ð°Ð±Ð¾Ð»ÐµÐ²Ð°Ð½Ð¸Ñ Ñ Ð´Ð¸Ð°Ñ€ÐµÐµÐ¹"},
  {"value":"diet_5","label_ru":"Ð”Ð¸ÐµÑ‚Ð° â„–5 â€” Ð·Ð°Ð±Ð¾Ð»ÐµÐ²Ð°Ð½Ð¸Ñ Ð¿ÐµÑ‡ÐµÐ½Ð¸ Ð¸ Ð¶ÐµÐ»Ñ‡ÐµÐ²Ñ‹Ð²Ð¾Ð´ÑÑ‰Ð¸Ñ… Ð¿ÑƒÑ‚ÐµÐ¹"},
  {"value":"diet_6","label_ru":"Ð”Ð¸ÐµÑ‚Ð° â„–6 â€” Ð¿Ð¾Ð´Ð°Ð³Ñ€Ð°"},
  {"value":"diet_7","label_ru":"Ð”Ð¸ÐµÑ‚Ð° â„–7 â€” Ð¾ÑÑ‚Ñ€Ñ‹Ð¹ Ð¸ Ñ…Ñ€Ð¾Ð½Ð¸Ñ‡ÐµÑÐºÐ¸Ð¹ Ð½ÐµÑ„Ñ€Ð¸Ñ‚"},
  {"value":"diet_8","label_ru":"Ð”Ð¸ÐµÑ‚Ð° â„–8 â€” Ð¾Ð¶Ð¸Ñ€ÐµÐ½Ð¸Ðµ"},
  {"value":"diet_9","label_ru":"Ð”Ð¸ÐµÑ‚Ð° â„–9 â€” ÑÐ°Ñ…Ð°Ñ€Ð½Ñ‹Ð¹ Ð´Ð¸Ð°Ð±ÐµÑ‚"},
  {"value":"diet_10","label_ru":"Ð”Ð¸ÐµÑ‚Ð° â„–10 â€” ÑÐµÑ€Ð´ÐµÑ‡Ð½Ð¾-ÑÐ¾ÑÑƒÐ´Ð¸ÑÑ‚Ñ‹Ðµ Ð·Ð°Ð±Ð¾Ð»ÐµÐ²Ð°Ð½Ð¸Ñ"},
  {"value":"diet_13","label_ru":"Ð”Ð¸ÐµÑ‚Ð° â„–13 â€” Ð¾ÑÑ‚Ñ€Ñ‹Ðµ Ð¸Ð½Ñ„ÐµÐºÑ†Ð¸Ð¾Ð½Ð½Ñ‹Ðµ Ð·Ð°Ð±Ð¾Ð»ÐµÐ²Ð°Ð½Ð¸Ñ"},
  {"value":"diet_14","label_ru":"Ð”Ð¸ÐµÑ‚Ð° â„–14 â€” Ð¿Ð¾Ñ‡ÐµÑ‡Ð½Ð¾ÐºÐ°Ð¼ÐµÐ½Ð½Ð°Ñ Ð±Ð¾Ð»ÐµÐ·Ð½ÑŒ"},
  {"value":"diet_15","label_ru":"Ð”Ð¸ÐµÑ‚Ð° â„–15 â€” Ñ€Ð°Ð·Ð»Ð¸Ñ‡Ð½Ñ‹Ðµ Ð·Ð°Ð±Ð¾Ð»ÐµÐ²Ð°Ð½Ð¸Ñ"}
]'::jsonb WHERE attribute_code = 'tx.diet';

-- â”€â”€ Discharge Plan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000090', 'dc.dynamics',          'Ð’ Ð´Ð¸Ð½Ð°Ð¼Ð¸ÐºÐµ Ð¾Ð±Ñ‰ÐµÐµ ÑÐ¾ÑÑ‚Ð¾ÑÐ½Ð¸Ðµ Ð¿Ð°Ñ†Ð¸ÐµÐ½Ñ‚Ð°', 'Patient Dynamics',            'textarea', 10),
  ('b1000000-0000-0000-0000-000000000091', 'dc.general_condition', 'ÐžÐ±Ñ‰ÐµÐµ ÑÐ¾ÑÑ‚Ð¾ÑÐ½Ð¸Ðµ Ð¿Ñ€Ð¸ Ð²Ñ‹Ð¿Ð¸ÑÐºÐµ',         'Discharge Condition',         'textarea', 20),
  ('b1000000-0000-0000-0000-000000000092', 'dc.warning_signs',     'Ð¢Ñ€ÐµÐ²Ð¾Ð¶Ð½Ñ‹Ðµ Ð¿Ñ€Ð¸Ð·Ð½Ð°ÐºÐ¸',                  'Warning Signs',               'textarea', 30),
  ('b1000000-0000-0000-0000-000000000093', 'dc.follow_up_date',    'Ð”Ð°Ñ‚Ð° ÑÐ»ÐµÐ´ÑƒÑŽÑ‰ÐµÐ³Ð¾ Ð²Ð¸Ð·Ð¸Ñ‚Ð°',              'Follow-up Date',              'date',     40),
  ('b1000000-0000-0000-0000-000000000094', 'dc.continue_treatment','Ð“Ð´Ðµ Ð¿Ñ€Ð¾Ð´Ð¾Ð»Ð¶Ð¸Ñ‚ÑŒ Ð»ÐµÑ‡ÐµÐ½Ð¸Ðµ Ð¿Ð¾ÑÐ»Ðµ Ð²Ñ‹Ð¿Ð¸ÑÐºÐ¸','Where to Continue Treatment', 'textarea', 50),
  ('b1000000-0000-0000-0000-000000000095', 'dc.admission_date',    'Ð”Ð°Ñ‚Ð° Ð¿Ð¾ÑÑ‚ÑƒÐ¿Ð»ÐµÐ½Ð¸Ñ',                    'Admission Date',              'auto',     5),
  ('b1000000-0000-0000-0000-000000000096', 'dc.discharge_date',    'Ð”Ð°Ñ‚Ð° Ð²Ñ‹Ð¿Ð¸ÑÐºÐ¸',                        'Discharge Date',              'auto',     6),
  ('b1000000-0000-0000-0000-000000000097', 'dc.bed_days',          'ÐšÐ¾Ð»Ð¸Ñ‡ÐµÑÑ‚Ð²Ð¾ ÐºÐ¾Ð¹ÐºÐ¾-Ð´Ð½ÐµÐ¹',               'Bed Days',                    'calculated',7),
  ('b1000000-0000-0000-0000-000000000098', 'dc.performed_meds',    'ÐœÐµÐ´Ð¸ÐºÐ°Ð¼ÐµÐ½Ñ‚Ð¾Ð·Ð½Ñ‹Ðµ Ð½Ð°Ð·Ð½Ð°Ñ‡ÐµÐ½Ð¸Ñ (Ð¿Ñ€Ð¾Ð²ÐµÐ´Ñ‘Ð½Ð½Ñ‹Ðµ)', 'Medications Performed',   'textarea', 60),
  ('b1000000-0000-0000-0000-000000000099', 'dc.performed_surgery', 'ÐŸÑ€Ð¾Ð²ÐµÐ´Ñ‘Ð½Ð½Ð°Ñ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ñ',                'Surgery Performed',           'textarea', 70),
  ('b1000000-0000-0000-0000-000000000100', 'dc.performed_treatment','ÐŸÑ€Ð¾Ð²ÐµÐ´Ñ‘Ð½Ð½Ñ‹Ðµ Ð»ÐµÑ‡ÐµÐ½Ð¸Ñ, Ð»Ð°Ð±. Ð¸ Ð¸Ð½ÑÑ‚Ñ€. Ð¸ÑÑÐ»ÐµÐ´Ð¾Ð²Ð°Ð½Ð¸Ñ', 'Treatments Performed', 'textarea', 80);

-- â”€â”€ Transfer fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000110', 'transfer.datetime',    'Ð”Ð°Ñ‚Ð° Ð¸ Ð²Ñ€ÐµÐ¼Ñ Ð¿ÐµÑ€ÐµÐ²Ð¾Ð´Ð°',               'Transfer Date/Time',          'datetime', 10),
  ('b1000000-0000-0000-0000-000000000111', 'transfer.destination', 'ÐžÑ‚Ð´ÐµÐ»ÐµÐ½Ð¸Ðµ ÐºÑƒÐ´Ð° Ð¿ÐµÑ€ÐµÐ²Ð¾Ð´Ð¸Ñ‚ÑÑ Ð¿Ð°Ñ†Ð¸ÐµÐ½Ñ‚',  'Destination Department',      'text',     20),
  ('b1000000-0000-0000-0000-000000000112', 'transfer.handing_dr',  'Ð¡Ð´Ð°Ð²ÑˆÐ¸Ð¹ Ð²Ñ€Ð°Ñ‡',                        'Handing Physician',           'text',     30),
  ('b1000000-0000-0000-0000-000000000113', 'transfer.receiving_dr','ÐŸÑ€Ð¸Ð½Ð¸Ð¼Ð°ÑŽÑ‰Ð¸Ð¹ Ð²Ñ€Ð°Ñ‡',                    'Receiving Physician',         'text',     40);

-- â”€â”€ Surgical fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000120', 'surg.urgency',             'Ð¡Ñ€Ð¾Ñ‡Ð½Ð¾ÑÑ‚ÑŒ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸',                  'Surgery Urgency',         'select',   10),
  ('b1000000-0000-0000-0000-000000000121', 'surg.is_repeat',           'ÐŸÐ¾Ð²Ñ‚Ð¾Ñ€Ð½Ð°Ñ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ñ Ð¸Ð»Ð¸ Ð¾ÑÐ»Ð¾Ð¶Ð½ÐµÐ½Ð¸Ðµ',   'Repeat Surgery',          'boolean',  20),
  ('b1000000-0000-0000-0000-000000000122', 'surg.operating_block',     'ÐžÐ¿ÐµÑ€Ð°Ñ†Ð¸Ð¾Ð½Ð½Ñ‹Ð¹ Ð±Ð»Ð¾Ðº',                   'Operating Block',         'text',     30),
  ('b1000000-0000-0000-0000-000000000123', 'surg.anesthesia_type',     'Ð¢Ð¸Ð¿ Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ð¸',                       'Anesthesia Type',         'select',   40),
  ('b1000000-0000-0000-0000-000000000124', 'surg.start_datetime',      'Ð”Ð°Ñ‚Ð° Ð¸ Ð²Ñ€ÐµÐ¼Ñ Ð½Ð°Ñ‡Ð°Ð»Ð° Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸',        'Surgery Start',           'datetime', 50),
  ('b1000000-0000-0000-0000-000000000125', 'surg.end_datetime',        'Ð”Ð°Ñ‚Ð° Ð¸ Ð²Ñ€ÐµÐ¼Ñ Ð¾ÐºÐ¾Ð½Ñ‡Ð°Ð½Ð¸Ñ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸',     'Surgery End',             'datetime', 60),
  ('b1000000-0000-0000-0000-000000000126', 'surg.operation_name',      'ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸',                   'Operation Name',          'text',     70),
  ('b1000000-0000-0000-0000-000000000127', 'surg.procedure_course',    'Ð¥Ð¾Ð´ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸ / Ð¿Ñ€Ð¾Ñ†ÐµÐ´ÑƒÑ€Ñ‹',            'Procedure Course',        'textarea', 80),
  ('b1000000-0000-0000-0000-000000000128', 'surg.complications',       'ÐžÑÐ»Ð¾Ð¶Ð½ÐµÐ½Ð¸Ñ',                          'Complications',           'boolean',  90),
  ('b1000000-0000-0000-0000-000000000129', 'surg.blood_loss',          'ÐžÐ±ÑŠÑ‘Ð¼ ÐºÑ€Ð¾Ð²Ð¾Ð¿Ð¾Ñ‚ÐµÑ€Ð¸ (Ð¼Ð»)',              'Blood Loss',              'number',   100),
  ('b1000000-0000-0000-0000-000000000130', 'surg.macroscopic',         'ÐœÐ°ÐºÑ€Ð¾ÑÐºÐ¾Ð¿Ð¸Ñ‡ÐµÑÐºÐ¸Ð¹ Ð¿Ñ€ÐµÐ¿Ð°Ñ€Ð°Ñ‚',           'Macroscopic Specimen',    'textarea', 110),
  ('b1000000-0000-0000-0000-000000000131', 'surg.incision_class',      'ÐšÐ»Ð°ÑÑÐ¸Ñ„Ð¸ÐºÐ°Ñ†Ð¸Ñ Ñ…Ð¸Ñ€ÑƒÑ€Ð³Ð¸Ñ‡ÐµÑÐºÐ¾Ð³Ð¾ Ñ€Ð°Ð·Ñ€ÐµÐ·Ð°','Incision Class',          'select',   120),
  ('b1000000-0000-0000-0000-000000000132', 'surg.drainage',            'Ð”Ñ€ÐµÐ½Ð°Ð¶',                              'Drainage',                'textarea', 130),
  ('b1000000-0000-0000-0000-000000000133', 'surg.postop_management',   'ÐŸÐ¾ÑÐ»ÐµÐ¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¾Ð½Ð½Ð¾Ðµ Ð²ÐµÐ´ÐµÐ½Ð¸Ðµ',           'Postoperative Management','textarea', 140),
  ('b1000000-0000-0000-0000-000000000134', 'surg.protocol_number',     'ÐÐ¾Ð¼ÐµÑ€ Ð¿Ñ€Ð¾Ñ‚Ð¾ÐºÐ¾Ð»Ð° Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸',            'Protocol Number',         'text',     5),
  ('b1000000-0000-0000-0000-000000000135', 'surg.indication',          'ÐŸÐ¾ÐºÐ°Ð·Ð°Ð½Ð¸Ðµ Ðº Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸',                'Surgical Indication',     'textarea', 75);

UPDATE public.field_definitions SET options = '[
  {"value":"planned","label_ru":"ÐŸÐ»Ð°Ð½Ð¾Ð²Ð°Ñ"},
  {"value":"emergency","label_ru":"Ð­ÐºÑÑ‚Ñ€ÐµÐ½Ð½Ð°Ñ"}
]'::jsonb WHERE attribute_code = 'surg.urgency';

UPDATE public.field_definitions SET options = '[
  {"value":"combined_general","label_ru":"ÐšÐ¾Ð¼Ð±Ð¸Ð½Ð¸Ñ€Ð¾Ð²Ð°Ð½Ð½Ð°Ñ Ð¾Ð±Ñ‰Ð°Ñ Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ñ"},
  {"value":"general","label_ru":"ÐžÐ±Ñ‰Ð°Ñ Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ñ"},
  {"value":"spinal","label_ru":"Ð¡Ð¿Ð¸Ð½Ð°Ð»ÑŒÐ½Ð°Ñ Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ñ"},
  {"value":"epidural","label_ru":"ÐŸÐµÑ€Ð¸Ð´ÑƒÑ€Ð°Ð»ÑŒÐ½Ð°Ñ Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ñ"},
  {"value":"conductive","label_ru":"ÐŸÑ€Ð¾Ð²Ð¾Ð´Ð½Ð¸ÐºÐ¾Ð²Ð°Ñ Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ñ"},
  {"value":"local","label_ru":"ÐœÐµÑÑ‚Ð½Ð°Ñ Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ñ"},
  {"value":"regional","label_ru":"Ð ÐµÐ³Ð¸Ð¾Ð½Ð°Ð»ÑŒÐ½Ð°Ñ Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ñ"},
  {"value":"tiva","label_ru":"Ð¢Ð¾Ñ‚Ð°Ð»ÑŒÐ½Ð°Ñ Ð²Ð½ÑƒÑ‚Ñ€Ð¸Ð²ÐµÐ½Ð½Ð°Ñ Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ñ"},
  {"value":"brachial_block","label_ru":"Ð‘Ð»Ð¾ÐºÐ°Ð´Ð° Ð¿Ð»ÐµÑ‡ÐµÐ²Ð¾Ð³Ð¾ ÑÐ¿Ð»ÐµÑ‚ÐµÐ½Ð¸Ñ"},
  {"value":"femoral_block","label_ru":"Ð‘Ð»Ð¾ÐºÐ°Ð´Ð° Ð±ÐµÐ´Ñ€ÐµÐ½Ð½Ð¾Ð³Ð¾ Ð½ÐµÑ€Ð²Ð°"},
  {"value":"sciatic_block","label_ru":"Ð‘Ð»Ð¾ÐºÐ°Ð´Ð° ÑÐµÐ´Ð°Ð»Ð¸Ñ‰Ð½Ð¾Ð³Ð¾ Ð½ÐµÑ€Ð²Ð°"},
  {"value":"bier_block","label_ru":"Ð’Ð½ÑƒÑ‚Ñ€Ð¸Ð²ÐµÐ½Ð½Ð°Ñ Ñ€ÐµÐ³Ð¸Ð¾Ð½Ð°Ð»ÑŒÐ½Ð°Ñ Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ñ"},
  {"value":"mac","label_ru":"ÐœÐ¾Ð½Ð¸Ñ‚Ð¾Ñ€Ð¸Ð½Ð³Ð¾Ð²Ð°Ñ Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ñ"},
  {"value":"inhalational","label_ru":"Ð˜Ð½Ð³Ð°Ð»ÑÑ†Ð¸Ð¾Ð½Ð½Ð°Ñ Ð¾Ð±Ñ‰Ð°Ñ Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ñ"},
  {"value":"balanced","label_ru":"Ð¡Ð±Ð°Ð»Ð°Ð½ÑÐ¸Ñ€Ð¾Ð²Ð°Ð½Ð½Ð°Ñ Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ñ"}
]'::jsonb WHERE attribute_code = 'surg.anesthesia_type';

UPDATE public.field_definitions SET options = '[
  {"value":"class_1","label_ru":"I ÐšÐ»Ð°ÑÑ â€” Ð§Ð¸ÑÑ‚Ñ‹Ðµ"},
  {"value":"class_2","label_ru":"II ÐšÐ»Ð°ÑÑ â€” Ð£ÑÐ»Ð¾Ð²Ð½Ð¾-Ñ‡Ð¸ÑÑ‚Ñ‹Ðµ"},
  {"value":"class_3","label_ru":"III ÐšÐ»Ð°ÑÑ â€” Ð—Ð°Ð³Ñ€ÑÐ·Ð½Ñ‘Ð½Ð½Ñ‹Ðµ"},
  {"value":"class_4","label_ru":"IV ÐšÐ»Ð°ÑÑ â€” Ð“Ð½Ð¾Ð¹Ð½Ñ‹Ðµ"}
]'::jsonb WHERE attribute_code = 'surg.incision_class';

-- â”€â”€ Participants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000140', 'part.surgeon',         'ÐžÐ¿ÐµÑ€Ð¸Ñ€ÑƒÑŽÑ‰Ð¸Ð¹ Ð²Ñ€Ð°Ñ‡',                    'Surgeon',                 'text', 10),
  ('b1000000-0000-0000-0000-000000000141', 'part.assistant_1',     'ÐŸÐµÑ€Ð²Ñ‹Ð¹ Ð°ÑÑÐ¸ÑÑ‚ÐµÐ½Ñ‚',                    'First Assistant',         'text', 20),
  ('b1000000-0000-0000-0000-000000000142', 'part.assistant_2',     'Ð’Ñ‚Ð¾Ñ€Ð¾Ð¹ Ð°ÑÑÐ¸ÑÑ‚ÐµÐ½Ñ‚',                    'Second Assistant',        'text', 30),
  ('b1000000-0000-0000-0000-000000000143', 'part.scrub_nurse',     'ÐžÐ¿ÐµÑ€Ð°Ñ†Ð¸Ð¾Ð½Ð½Ð°Ñ Ð¼ÐµÐ´ÑÐµÑÑ‚Ñ€Ð°',              'Scrub Nurse',             'text', 40),
  ('b1000000-0000-0000-0000-000000000144', 'part.anesthesiologist','ÐÐ½ÐµÑÑ‚ÐµÐ·Ð¸Ð¾Ð»Ð¾Ð³',                        'Anesthesiologist',        'text', 50),
  ('b1000000-0000-0000-0000-000000000145', 'part.anesthesia_nurse','ÐÐ½ÐµÑÑ‚ÐµÐ·Ð¸ÑÑ‚ÐºÐ°',                        'Anesthesia Nurse',        'text', 60),
  ('b1000000-0000-0000-0000-000000000146', 'part.additional',      'Ð”Ð¾Ð¿Ð¾Ð»Ð½Ð¸Ñ‚ÐµÐ»ÑŒÐ½Ñ‹Ð¹ ÑƒÑ‡Ð°ÑÑ‚Ð½Ð¸Ðº',             'Additional Participant',  'text', 70),
  ('b1000000-0000-0000-0000-000000000147', 'part.invited_specialist','ÐŸÑ€Ð¸Ð³Ð»Ð°ÑˆÑ‘Ð½Ð½Ñ‹Ð¹ ÑÐ¿ÐµÑ†Ð¸Ð°Ð»Ð¸ÑÑ‚',           'Invited Specialist',      'text', 80),
  ('b1000000-0000-0000-0000-000000000148', 'part.chief_physician', 'Ð“Ð»Ð°Ð²Ð½Ñ‹Ð¹ Ð²Ñ€Ð°Ñ‡',                        'Chief Physician',         'text', 90),
  ('b1000000-0000-0000-0000-000000000149', 'part.dept_head',       'Ð—Ð°Ð²ÐµÐ´ÑƒÑŽÑ‰Ð¸Ð¹ Ð¾Ñ‚Ð´ÐµÐ»ÐµÐ½Ð¸ÐµÐ¼',               'Department Head',         'text', 100),
  ('b1000000-0000-0000-0000-000000000150', 'part.perfusionist',    'ÐŸÐµÑ€Ñ„ÑƒÐ·Ð¸Ð¾Ð»Ð¾Ð³',                         'Perfusionist',            'text', 110),
  ('b1000000-0000-0000-0000-000000000151', 'part.perfusion_nurse', 'ÐŸÐµÑ€Ñ„ÑƒÐ·Ð¸ÑÑ‚ÐºÐ°',                         'Perfusion Nurse',         'text', 120),
  ('b1000000-0000-0000-0000-000000000152', 'part.radiology_tech',  'Ð ÐµÐ½Ñ‚Ð³ÐµÐ½-Ð»Ð°Ð±Ð¾Ñ€Ð°Ð½Ñ‚',                    'Radiology Technician',    'text', 130),
  ('b1000000-0000-0000-0000-000000000153', 'part.receiving_dr',    'ÐŸÑ€Ð¸Ð½Ð¸Ð¼Ð°ÑŽÑ‰Ð¸Ð¹ Ð²Ñ€Ð°Ñ‡',                    'Receiving Physician',     'text', 140),
  ('b1000000-0000-0000-0000-000000000154', 'part.handing_dr',      'Ð¡Ð´Ð°Ð²ÑˆÐ¸Ð¹ Ð²Ñ€Ð°Ñ‡',                        'Handing Physician',       'text', 150);

-- â”€â”€ Anesthesia specific â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000160', 'anest.start_datetime',   'Ð”Ð°Ñ‚Ð° Ð¸ Ð²Ñ€ÐµÐ¼Ñ Ð½Ð°Ñ‡Ð°Ð»Ð° Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ð¸',   'Anesthesia Start',        'datetime', 10),
  ('b1000000-0000-0000-0000-000000000161', 'anest.end_datetime',     'Ð”Ð°Ñ‚Ð° Ð¸ Ð²Ñ€ÐµÐ¼Ñ Ð¾ÐºÐ¾Ð½Ñ‡Ð°Ð½Ð¸Ñ Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ð¸','Anesthesia End',          'datetime', 20),
  ('b1000000-0000-0000-0000-000000000162', 'anest.description',      'ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ð¸',              'Anesthesia Description',  'textarea', 30),
  ('b1000000-0000-0000-0000-000000000163', 'anest.side_effects',     'ÐŸÐ¾Ð±Ð¾Ñ‡Ð½Ñ‹Ðµ ÑÑ„Ñ„ÐµÐºÑ‚Ñ‹ Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ð¸',      'Side Effects',            'boolean',  40),
  ('b1000000-0000-0000-0000-000000000164', 'anest.handover_state',   'Ð¡Ð¾ÑÑ‚Ð¾ÑÐ½Ð¸Ðµ Ð¿Ñ€Ð¸ ÑÐ´Ð°Ñ‡Ðµ',             'Handover Condition',      'textarea', 50),
  ('b1000000-0000-0000-0000-000000000165', 'anest.asa_class',        'Ð¨ÐºÐ°Ð»Ð° ASA',                       'ASA Class',               'select',   60),
  ('b1000000-0000-0000-0000-000000000166', 'anest.mallampati',       'Ð¢ÐµÑÑ‚ ÐœÐ°Ð»Ð»Ð°Ð¼Ð¿Ð°Ñ‚Ð¸',                 'Mallampati Test',         'select',   70);

UPDATE public.field_definitions SET options = '[
  {"value":"1","label_ru":"I ÐšÐ»Ð°ÑÑ â€” ÐÐ¾Ñ€Ð¼Ð°Ð»ÑŒÐ½Ñ‹Ð¹ Ð·Ð´Ð¾Ñ€Ð¾Ð²Ñ‹Ð¹ Ð¿Ð°Ñ†Ð¸ÐµÐ½Ñ‚"},
  {"value":"2","label_ru":"II ÐšÐ»Ð°ÑÑ â€” ÐšÐ¾Ð½Ñ‚Ñ€Ð¾Ð»Ð¸Ñ€ÑƒÐµÐ¼Ñ‹Ðµ ÑÐ¾Ð¿ÑƒÑ‚ÑÑ‚Ð²ÑƒÑŽÑ‰Ð¸Ðµ Ð·Ð°Ð±Ð¾Ð»ÐµÐ²Ð°Ð½Ð¸Ñ"},
  {"value":"3","label_ru":"III ÐšÐ»Ð°ÑÑ â€” Ð¥Ñ€Ð¾Ð½Ð¸Ñ‡ÐµÑÐºÐ¸Ðµ Ð·Ð°Ð±Ð¾Ð»ÐµÐ²Ð°Ð½Ð¸Ñ Ð² ÑÑ‚Ð°Ð´Ð¸Ð¸ ÐºÐ¾Ð¼Ð¿ÐµÐ½ÑÐ°Ñ†Ð¸Ð¸"},
  {"value":"4","label_ru":"IV ÐšÐ»Ð°ÑÑ â€” Ð‘Ð»Ð¸Ð·ÐºÐ¾ Ðº Ð´ÐµÐºÐ¾Ð¼Ð¿ÐµÐ½ÑÐ°Ñ†Ð¸Ð¸"}
]'::jsonb WHERE attribute_code = 'anest.asa_class';

UPDATE public.field_definitions SET options = '[
  {"value":"1","label_ru":"I-ÐºÐ»Ð°ÑÑ"},
  {"value":"2","label_ru":"II-ÐºÐ»Ð°ÑÑ"},
  {"value":"3","label_ru":"III-ÐºÐ»Ð°ÑÑ"},
  {"value":"4","label_ru":"IV-ÐºÐ»Ð°ÑÑ"}
]'::jsonb WHERE attribute_code = 'anest.mallampati';

-- â”€â”€ Anesthesiologist exam specific â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000167', 'anest.instrumental_diag', 'Ð˜Ð½ÑÑ‚Ñ€ÑƒÐ¼ÐµÐ½Ñ‚Ð°Ð»ÑŒÐ½Ð°Ñ Ð´Ð¸Ð°Ð³Ð½Ð¾ÑÑ‚Ð¸ÐºÐ°',    'Instrumental Diagnostics', 'textarea', 80),
  ('b1000000-0000-0000-0000-000000000168', 'anest.consult',           'ÐšÐ¾Ð½ÑÑƒÐ»ÑŒÑ‚Ð°Ñ†Ð¸Ð¸ ÑÐ¿ÐµÑ†Ð¸Ð°Ð»Ð¸ÑÑ‚Ð¾Ð²',       'Specialist Consultations', 'textarea', 90);

-- â”€â”€ Perfusion specific â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, unit, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000170', 'perf.description',       'ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ Ð¿ÐµÑ€Ñ„ÑƒÐ·Ð¸Ð¸',               'Perfusion Description',   'textarea', NULL,  10),
  ('b1000000-0000-0000-0000-000000000171', 'perf.weight',            'Ð’ÐµÑ',                             'Weight',                  'number',   'ÐºÐ³',  20),
  ('b1000000-0000-0000-0000-000000000172', 'perf.height',            'Ð Ð¾ÑÑ‚',                            'Height',                  'number',   'ÑÐ¼',  30),
  ('b1000000-0000-0000-0000-000000000173', 'perf.body_surface_area', 'ÐŸÐ»Ð¾Ñ‰Ð°Ð´ÑŒ Ð¿Ð¾Ð²ÐµÑ€Ñ…Ð½Ð¾ÑÑ‚Ð¸ Ñ‚ÐµÐ»Ð°',        'Body Surface Area',       'number',   'Ð¼Â²',  40),
  ('b1000000-0000-0000-0000-000000000174', 'perf.protocol_number',   'ÐÐ¾Ð¼ÐµÑ€ Ð¿Ñ€Ð¾Ñ‚Ð¾ÐºÐ¾Ð»Ð° Ð¿ÐµÑ€Ñ„ÑƒÐ·Ð¸Ð¸',        'Perfusion Protocol #',    'text',     NULL,  50),
  ('b1000000-0000-0000-0000-000000000175', 'perf.blood_type',        'Ð“Ñ€ÑƒÐ¿Ð¿Ð° ÐºÑ€Ð¾Ð²Ð¸ Ð¸ Ñ€ÐµÐ·ÑƒÑ-Ñ„Ð°ÐºÑ‚Ð¾Ñ€',     'Blood Type & Rh',         'select',   NULL,  60),
  ('b1000000-0000-0000-0000-000000000176', 'perf.arterial_cannula',  'ÐÑ€Ñ‚ÐµÑ€Ð¸Ð°Ð»ÑŒÐ½Ð°Ñ ÐºÐ°Ð½ÑŽÐ»Ñ',             'Arterial Cannula',        'text',     NULL,  70),
  ('b1000000-0000-0000-0000-000000000177', 'perf.svc_cannula',       'Ð’ÐŸÐ’ ÐºÐ°Ð½ÑŽÐ»Ñ',                      'SVC Cannula',             'text',     NULL,  80),
  ('b1000000-0000-0000-0000-000000000178', 'perf.ivc_cannula',       'ÐÐŸÐ’ ÐºÐ°Ð½ÑŽÐ»Ñ',                      'IVC Cannula',             'text',     NULL,  90),
  ('b1000000-0000-0000-0000-000000000179', 'perf.start_datetime',    'ÐÐ°Ñ‡Ð°Ð»Ð¾ Ð¿ÐµÑ€Ñ„ÑƒÐ·Ð¸Ð¸',                 'Perfusion Start',         'datetime', NULL,  100),
  ('b1000000-0000-0000-0000-000000000180', 'perf.end_datetime',      'ÐšÐ¾Ð½ÐµÑ† Ð¿ÐµÑ€Ñ„ÑƒÐ·Ð¸Ð¸',                  'Perfusion End',           'datetime', NULL,  110),
  ('b1000000-0000-0000-0000-000000000181', 'perf.duration',          'ÐŸÑ€Ð¾Ð´Ð¾Ð»Ð¶Ð¸Ñ‚ÐµÐ»ÑŒÐ½Ð¾ÑÑ‚ÑŒ Ð¿ÐµÑ€Ñ„ÑƒÐ·Ð¸Ð¸',      'Perfusion Duration',      'calculated',NULL, 120),
  ('b1000000-0000-0000-0000-000000000182', 'perf.ischemia_duration', 'ÐŸÑ€Ð¾Ð´Ð¾Ð»Ð¶Ð¸Ñ‚ÐµÐ»ÑŒÐ½Ð¾ÑÑ‚ÑŒ Ð¸ÑˆÐµÐ¼Ð¸Ð¸',        'Ischemia Duration',       'text',     NULL,  130),
  ('b1000000-0000-0000-0000-000000000183', 'perf.flow_max',          'ÐžÐ±ÑŠÑ‘Ð¼ Ð¸ ÑÐºÐ¾Ñ€Ð¾ÑÑ‚ÑŒ Ð¿ÐµÑ€Ñ„ÑƒÐ·Ð¸Ð¸ Ð¼Ð°ÐºÑ',  'Max Perfusion Flow',      'text',     NULL,  140),
  ('b1000000-0000-0000-0000-000000000184', 'perf.flow_min',          'ÐžÐ±ÑŠÑ‘Ð¼ Ð¸ ÑÐºÐ¾Ñ€Ð¾ÑÑ‚ÑŒ Ð¿ÐµÑ€Ñ„ÑƒÐ·Ð¸Ð¸ Ð¼Ð¸Ð½',   'Min Perfusion Flow',      'text',     NULL,  150),
  ('b1000000-0000-0000-0000-000000000185', 'perf.prime_volume',      'ÐŸÐµÑ€Ð²Ð¸Ñ‡Ð½Ñ‹Ð¹ Ð¾Ð±ÑŠÑ‘Ð¼ Ð·Ð°Ð¿Ð¾Ð»Ð½ÐµÐ½Ð¸Ñ',      'Prime Volume',            'text',     NULL,  160),
  ('b1000000-0000-0000-0000-000000000186', 'perf.cbv',               'ÐžÐ¦Ðš',                             'Circulating Blood Volume','text',     NULL,  170),
  ('b1000000-0000-0000-0000-000000000187', 'perf.blood_balance',     'Ð‘Ð°Ð»Ð°Ð½Ñ ÐºÑ€Ð¾Ð²Ð¸',                    'Blood Balance',           'text',     NULL,  180),
  ('b1000000-0000-0000-0000-000000000188', 'perf.total_balance',     'ÐžÐ±Ñ‰Ð¸Ð¹ Ð±Ð°Ð»Ð°Ð½Ñ',                    'Total Balance',           'text',     NULL,  190),
  ('b1000000-0000-0000-0000-000000000189', 'perf.hemoglobin',        'Ð“ÐµÐ¼Ð¾Ð³Ð»Ð¾Ð±Ð¸Ð½',                      'Hemoglobin',              'number',   NULL,  200),
  ('b1000000-0000-0000-0000-000000000190', 'perf.hematocrit',        'Ð“ÐµÐ¼Ð¾Ñ‚Ð¾ÐºÑ€Ð¸Ñ‚',                      'Hematocrit',              'number',   '%',   210),
  ('b1000000-0000-0000-0000-000000000191', 'perf.equipment',         'Ð˜ÑÐ¿Ð¾Ð»ÑŒÐ·ÑƒÐµÐ¼Ð¾Ðµ Ð¾Ð±Ð¾Ñ€ÑƒÐ´Ð¾Ð²Ð°Ð½Ð¸Ðµ',       'Equipment Used',          'textarea', NULL,  220);

UPDATE public.field_definitions SET options = '[
  {"value":"unknown","label_ru":"ÐÐµÐ¸Ð·Ð²ÐµÑÑ‚Ð½Ñ‹Ð¹"},
  {"value":"1_neg","label_ru":"I Ð¾Ñ‚Ñ€Ð¸Ñ†Ð°Ñ‚ÐµÐ»ÑŒÐ½Ñ‹Ð¹"},
  {"value":"1_pos","label_ru":"I Ð¿Ð¾Ð»Ð¾Ð¶Ð¸Ñ‚ÐµÐ»ÑŒÐ½Ñ‹Ð¹"},
  {"value":"2_neg","label_ru":"II Ð¾Ñ‚Ñ€Ð¸Ñ†Ð°Ñ‚ÐµÐ»ÑŒÐ½Ñ‹Ð¹"},
  {"value":"2_pos","label_ru":"II Ð¿Ð¾Ð»Ð¾Ð¶Ð¸Ñ‚ÐµÐ»ÑŒÐ½Ñ‹Ð¹"},
  {"value":"3_neg","label_ru":"III Ð¾Ñ‚Ñ€Ð¸Ñ†Ð°Ñ‚ÐµÐ»ÑŒÐ½Ñ‹Ð¹"},
  {"value":"3_pos","label_ru":"III Ð¿Ð¾Ð»Ð¾Ð¶Ð¸Ñ‚ÐµÐ»ÑŒÐ½Ñ‹Ð¹"},
  {"value":"4_neg","label_ru":"IV Ð¾Ñ‚Ñ€Ð¸Ñ†Ð°Ñ‚ÐµÐ»ÑŒÐ½Ñ‹Ð¹"},
  {"value":"4_pos","label_ru":"IV Ð¿Ð¾Ð»Ð¾Ð¶Ð¸Ñ‚ÐµÐ»ÑŒÐ½Ñ‹Ð¹"}
]'::jsonb WHERE attribute_code = 'perf.blood_type';

-- â”€â”€ Transfer Criteria Scores â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000200', 'tcrit.skin_color',     'Ð¦Ð²ÐµÑ‚ ÐºÐ¾Ð¶Ð¸ Ð¸ Ð²Ð¸Ð´Ð¸Ð¼Ñ‹Ñ… ÑÐ»Ð¸Ð·Ð¸ÑÑ‚Ñ‹Ñ…',     'Skin Color',              'select',     10),
  ('b1000000-0000-0000-0000-000000000201', 'tcrit.breathing',      'Ð”Ñ‹Ñ…Ð°Ð½Ð¸Ðµ',                            'Breathing',               'select',     20),
  ('b1000000-0000-0000-0000-000000000202', 'tcrit.circulation',    'ÐšÑ€Ð¾Ð²Ð¾Ð¾Ð±Ñ€Ð°Ñ‰ÐµÐ½Ð¸Ðµ',                     'Circulation',             'select',     30),
  ('b1000000-0000-0000-0000-000000000203', 'tcrit.consciousness',  'Ð¡Ð¾Ð·Ð½Ð°Ð½Ð¸Ðµ',                           'Consciousness',           'select',     40),
  ('b1000000-0000-0000-0000-000000000204', 'tcrit.lab_findings',   'Ð›Ð°Ð±Ð¾Ñ€Ð°Ñ‚Ð¾Ñ€Ð½Ð¾-Ð¸Ð½ÑÑ‚Ñ€ÑƒÐ¼ÐµÐ½Ñ‚Ð°Ð»ÑŒÐ½Ñ‹Ðµ Ð¿Ð¾ÐºÐ°Ð·Ð°Ñ‚ÐµÐ»Ð¸','Lab Findings',        'select',     50),
  ('b1000000-0000-0000-0000-000000000205', 'tcrit.total_score',    'Ð˜Ñ‚Ð¾Ð³Ð¾ Ð±Ð°Ð»Ð»Ð¾Ð²',                       'Total Score',             'calculated', 60),
  ('b1000000-0000-0000-0000-000000000206', 'tcrit.decision',       'Ð ÐµÑˆÐµÐ½Ð¸Ðµ Ð¾ Ð¿ÐµÑ€ÐµÐ²Ð¾Ð´Ðµ',                 'Transfer Decision',       'textarea',   70),
  ('b1000000-0000-0000-0000-000000000207', 'tcrit.comment',        'ÐšÐ¾Ð¼Ð¼ÐµÐ½Ñ‚Ð°Ñ€Ð¸Ð¹',                        'Comment',                 'textarea',   80),
  ('b1000000-0000-0000-0000-000000000208', 'tcrit.icu_head',       'Ð—Ð°Ð². Ð¾Ñ‚Ð´. ÐžÐ Ð˜Ð¢',                     'ICU Head',                'text',       90),
  ('b1000000-0000-0000-0000-000000000209', 'tcrit.anest_head',     'Ð—Ð°Ð². Ð¾Ñ‚Ð´. ÐÐ½ÐµÑÑ‚ÐµÐ·Ð¸Ð¾Ð»Ð¾Ð³Ð¸Ð¸',           'Anesthesiology Head',     'text',       100);

UPDATE public.field_definitions SET options = '[
  {"value":"2","label_ru":"Ð Ð¾Ð·Ð¾Ð²Ñ‹Ð¹ â€” 2 Ð±Ð°Ð»Ð»Ð°"},
  {"value":"1","label_ru":"Ð‘Ð»ÐµÐ´Ð½Ñ‹Ð¹ Ð¸Ð»Ð¸ ÑÐµÑ€Ñ‹Ð¹ â€” 1 Ð±Ð°Ð»Ð»"},
  {"value":"0","label_ru":"Ð¦Ð¸Ð°Ð½Ð¾Ñ‚Ð¸Ñ‡Ð½Ñ‹Ð¹ â€” 0 Ð±Ð°Ð»Ð»Ð¾Ð²"}
]'::jsonb WHERE attribute_code = 'tcrit.skin_color';

UPDATE public.field_definitions SET options = '[
  {"value":"2","label_ru":"Ð”Ñ‹ÑˆÐ¸Ñ‚ ÑÐ¿Ð¾Ð½Ñ‚Ð°Ð½Ð½Ð¾, ÑÑ‚Ð°Ð±Ð¸Ð»ÑŒÐ½Ñ‹Ðµ Ð´Ñ‹Ñ…Ð°Ñ‚ÐµÐ»ÑŒÐ½Ñ‹Ðµ Ð¿ÑƒÑ‚Ð¸ â€” 2 Ð±Ð°Ð»Ð»Ð°"},
  {"value":"1","label_ru":"Ð¡Ð¿Ð¾Ð½Ñ‚Ð°Ð½Ð½Ð¾Ðµ Ð´Ñ‹Ñ…Ð°Ð½Ð¸Ðµ, Ð½ÑƒÐ¶Ð½Ð° Ð¿ÐµÑ€Ð¸Ð¾Ð´Ð¸Ñ‡ÐµÑÐºÐ°Ñ ÑÐ°Ð½Ð°Ñ†Ð¸Ñ, Ðž2 Ð´Ð¾ 4 Ð»/Ð¼Ð¸Ð½ â€” 1 Ð±Ð°Ð»Ð»"},
  {"value":"0","label_ru":"ÐÑƒÐ¶Ð½Ð° Ñ€ÐµÑÐ¿Ð¸Ñ€Ð°Ñ‚Ð¾Ñ€Ð½Ð°Ñ Ð¿Ð¾Ð´Ð´ÐµÑ€Ð¶ÐºÐ° â€” 0 Ð±Ð°Ð»Ð»Ð¾Ð²"}
]'::jsonb WHERE attribute_code = 'tcrit.breathing';

UPDATE public.field_definitions SET options = '[
  {"value":"2","label_ru":"ÐÐ” Ð² Ð¿Ñ€ÐµÐ´ÐµÐ»Ð°Ñ… 20% Ð¾Ñ‚ Ð½Ð¾Ñ€Ð¼Ñ‹ â€” 2 Ð±Ð°Ð»Ð»Ð°"},
  {"value":"1","label_ru":"ÐÐ” Ð² Ð¿Ñ€ÐµÐ´ÐµÐ»Ð°Ñ… 20â€“50% Ð¾Ñ‚ Ð½Ð¾Ñ€Ð¼Ñ‹ â€” 1 Ð±Ð°Ð»Ð»"},
  {"value":"0","label_ru":"ÐÐ” Ð¾Ñ‚Ð»Ð¸Ñ‡Ð°ÐµÑ‚ÑÑ Ð¾Ñ‚ Ð½Ð¾Ñ€Ð¼Ñ‹ Ð±Ð¾Ð»ÐµÐµ Ñ‡ÐµÐ¼ Ð½Ð° 50% Ð¸Ð»Ð¸ Ð½ÐµÑÑ‚Ð°Ð±Ð¸Ð»ÑŒÐ½Ð¾Ðµ â€” 0 Ð±Ð°Ð»Ð»Ð¾Ð²"}
]'::jsonb WHERE attribute_code = 'tcrit.circulation';

UPDATE public.field_definitions SET options = '[
  {"value":"2","label_ru":"ÐŸÐ¾ Ð¨ÐšÐ“ 13â€“15 Ð±Ð°Ð»Ð»Ð¾Ð² â€” 2 Ð±Ð°Ð»Ð»Ð°"},
  {"value":"1","label_ru":"ÐŸÐ¾ Ð¨ÐšÐ“ 8â€“13 Ð±Ð°Ð»Ð»Ð¾Ð² â€” 1 Ð±Ð°Ð»Ð»"},
  {"value":"0","label_ru":"ÐŸÐ¾ Ð¨ÐšÐ“ Ð½Ð¸Ð¶Ðµ 8 Ð±Ð°Ð»Ð»Ð¾Ð² Ð¸Ð»Ð¸ Ð¿Ñ€Ð¾Ð³Ñ€ÐµÑÑÐ¸Ð²Ð½Ð¾Ðµ ÑÐ½Ð¸Ð¶ÐµÐ½Ð¸Ðµ â€” 0 Ð±Ð°Ð»Ð»Ð¾Ð²"}
]'::jsonb WHERE attribute_code = 'tcrit.consciousness';

UPDATE public.field_definitions SET options = '[
  {"value":"2","label_ru":"ÐŸÐ¾ÐºÐ°Ð·Ð°Ñ‚ÐµÐ»Ð¸ Ð² Ð¿Ñ€ÐµÐ´ÐµÐ»Ð°Ñ… Ð´Ð¾Ð¿ÑƒÑÑ‚Ð¸Ð¼Ñ‹Ñ… Ð·Ð½Ð°Ñ‡ÐµÐ½Ð¸Ð¹ â€” 2 Ð±Ð°Ð»Ð»Ð°"},
  {"value":"1","label_ru":"ÐÐµÐ·Ð½Ð°Ñ‡Ð¸Ñ‚ÐµÐ»ÑŒÐ½Ñ‹Ðµ Ð¸Ð·Ð¼ÐµÐ½ÐµÐ½Ð¸Ñ, Ñ‚Ñ€ÐµÐ±ÑƒÑŽÑ‚ Ð¿Ð»Ð°Ð½Ð¾Ð²Ð¾Ð¹ ÐºÐ¾Ñ€Ñ€ÐµÐºÑ†Ð¸Ð¸ â€” 1 Ð±Ð°Ð»Ð»"},
  {"value":"0","label_ru":"ÐšÑ€Ð¸Ñ‚Ð¸Ñ‡ÐµÑÐºÐ¸Ðµ Ð¸Ð·Ð¼ÐµÐ½ÐµÐ½Ð¸Ñ, Ñ‚Ñ€ÐµÐ±ÑƒÑŽÑ‚ Ð½ÐµÐ¼ÐµÐ´Ð»ÐµÐ½Ð½Ð¾Ð¹ ÐºÐ¾Ñ€Ñ€ÐµÐºÑ†Ð¸Ð¸ â€” 0 Ð±Ð°Ð»Ð»Ð¾Ð²"}
]'::jsonb WHERE attribute_code = 'tcrit.lab_findings';

-- â”€â”€ Pre-op Verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000210', 'verif.patient_id',          'Ð˜Ð´ÐµÐ½Ñ‚Ð¸Ñ„Ð¸ÐºÐ°Ñ†Ð¸Ñ Ð¿Ð°Ñ†Ð¸ÐµÐ½Ñ‚Ð°',              'Patient ID',              'select',   10),
  ('b1000000-0000-0000-0000-000000000211', 'verif.operation_name',      'ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸ (Ð²ÐºÑ€Ð°Ñ‚Ñ†Ðµ)',         'Operation Name',          'text',     20),
  ('b1000000-0000-0000-0000-000000000212', 'verif.ffp_ordered',         'Ð¡Ð²ÐµÐ¶ÐµÐ·Ð°Ð¼Ð¾Ñ€Ð¾Ð¶ÐµÐ½Ð½Ð°Ñ Ð¿Ð»Ð°Ð·Ð¼Ð°',            'FFP Ordered',             'boolean',  30),
  ('b1000000-0000-0000-0000-000000000213', 'verif.rbc_ordered',         'Ð­Ñ€Ð¸Ñ‚Ñ€Ð¾Ñ†Ð¸Ñ‚ÑÐ¾Ð´ÐµÑ€Ð¶Ð°Ñ‰Ð°Ñ Ñ‚Ñ€Ð°Ð½ÑÑ„ÑƒÐ·Ð¸Ð¾Ð½Ð½Ð°Ñ ÑÑ€ÐµÐ´Ð°','RBC Ordered',          'boolean',  40),
  ('b1000000-0000-0000-0000-000000000214', 'verif.platelets_ordered',   'Ð¢Ñ€Ð¾Ð¼Ð±Ð¾ÐºÐ¾Ð½Ñ†ÐµÐ½Ñ‚Ñ€Ð°Ñ‚',                    'Platelets Ordered',       'boolean',  50),
  ('b1000000-0000-0000-0000-000000000215', 'verif.implants_ordered',    'Ð˜Ð¼Ð¿Ð»Ð°Ð½Ñ‚Ð¸Ñ€ÑƒÐµÐ¼Ñ‹Ðµ ÑƒÑÑ‚Ñ€Ð¾Ð¹ÑÑ‚Ð²Ð° Ð·Ð°ÐºÐ°Ð·Ð°Ð½Ñ‹',  'Implants Ordered',        'boolean',  60),
  ('b1000000-0000-0000-0000-000000000216', 'verif.implant_details',     'Ð’Ð¸Ð´, Ð½Ð°Ð·Ð²Ð°Ð½Ð¸Ðµ, Ñ€Ð°Ð·Ð¼ÐµÑ€ Ð¸Ð¼Ð¿Ð»Ð°Ð½Ñ‚Ð°Ñ‚Ð°',    'Implant Details',         'text',     70),
  ('b1000000-0000-0000-0000-000000000217', 'verif.preop_diagnosis_set', 'Ð’Ñ‹ÑÑ‚Ð°Ð²Ð»ÐµÐ½ Ð¿Ñ€ÐµÐ´Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¾Ð½Ð½Ñ‹Ð¹ Ð´Ð¸Ð°Ð³Ð½Ð¾Ð·', 'Preop Diagnosis Set',     'boolean',  80),
  ('b1000000-0000-0000-0000-000000000218', 'verif.consent_surgery',     'ÐŸÐ¾Ð»ÑƒÑ‡ÐµÐ½Ð¾ ÑÐ¾Ð³Ð»Ð°ÑÐ¸Ðµ Ð½Ð° Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸ÑŽ',       'Surgery Consent',         'boolean',  90),
  ('b1000000-0000-0000-0000-000000000219', 'verif.consent_anesthesia',  'ÐŸÐ¾Ð»ÑƒÑ‡ÐµÐ½Ð¾ ÑÐ¾Ð³Ð»Ð°ÑÐ¸Ðµ Ð½Ð° Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸ÑŽ',      'Anesthesia Consent',      'boolean',  100),
  ('b1000000-0000-0000-0000-000000000220', 'verif.labs_done',           'ÐŸÑ€Ð¾Ð²ÐµÐ´ÐµÐ½Ñ‹ Ð»Ð°Ð±Ð¾Ñ€Ð°Ñ‚Ð¾Ñ€Ð½Ñ‹Ðµ Ð¸ÑÑÐ»ÐµÐ´Ð¾Ð²Ð°Ð½Ð¸Ñ', 'Labs Done',               'boolean',  110),
  ('b1000000-0000-0000-0000-000000000221', 'verif.ecg_done',            'ÐŸÑ€Ð¾Ð²ÐµÐ´ÐµÐ½Ð° Ð­ÐšÐ“',                       'ECG Done',                'boolean',  120),
  ('b1000000-0000-0000-0000-000000000222', 'verif.imaging_done',        'ÐŸÑ€Ð¾Ð²ÐµÐ´ÐµÐ½Ñ‹ Ñ€ÐµÐ½Ñ‚Ð³ÐµÐ½/ÐšÐ¢/ÐœÐ Ð¢',            'Imaging Done',            'boolean',  130),
  ('b1000000-0000-0000-0000-000000000223', 'verif.anest_exam_done',     'ÐŸÑ€Ð¾Ð²ÐµÐ´Ñ‘Ð½ Ð¾ÑÐ¼Ð¾Ñ‚Ñ€ Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ð¾Ð»Ð¾Ð³Ð°',       'Anesthesia Exam Done',    'boolean',  140),
  ('b1000000-0000-0000-0000-000000000224', 'verif.premedication',       'ÐžÐ¿Ñ€ÐµÐ´ÐµÐ»ÐµÐ½Ð° Ð¸ Ð¿Ð¾Ð´Ð³Ð¾Ñ‚Ð¾Ð²Ð»ÐµÐ½Ð° Ð¿Ñ€ÐµÐ¼ÐµÐ´Ð¸ÐºÐ°Ñ†Ð¸Ñ','Premedication',          'boolean',  150),
  ('b1000000-0000-0000-0000-000000000225', 'verif.cvc',                 'ÐšÐ°Ñ‚ÐµÑ‚ÐµÑ€Ð¸Ð·Ð°Ñ†Ð¸Ñ Ñ†ÐµÐ½Ñ‚Ñ€Ð°Ð»ÑŒÐ½Ñ‹Ñ… Ð²ÐµÐ½',        'CVC',                     'boolean',  160),
  ('b1000000-0000-0000-0000-000000000226', 'verif.max_contrast_dose',   'ÐœÐ°ÐºÑÐ¸Ð¼Ð°Ð»ÑŒÐ½Ð°Ñ Ð´Ð¾Ð·Ð° ÐºÐ¾Ð½Ñ‚Ñ€Ð°ÑÑ‚Ð° (Ð¼Ð»)',     'Max Contrast Dose',       'number',   170),
  ('b1000000-0000-0000-0000-000000000227', 'verif.body_marking',        'ÐœÐ°Ñ€ÐºÐ¸Ñ€Ð¾Ð²ÐºÐ° Ñ‚ÐµÐ»Ð°',                     'Body Marking',            'textarea', 180);

UPDATE public.field_definitions SET options = '[
  {"value":"verbal","label_ru":"Ð£ÑÑ‚Ð½Ð¾"},
  {"value":"bracelet","label_ru":"ÐŸÐ¾ Ð±Ñ€Ð°ÑÐ»ÐµÑ‚Ñƒ"},
  {"value":"documents","label_ru":"ÐŸÐ¾ Ð´Ð¾ÐºÑƒÐ¼ÐµÐ½Ñ‚Ð°Ð¼"}
]'::jsonb WHERE attribute_code = 'verif.patient_id';

-- â”€â”€ Brief Admission Exam specific â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000230', 'admit.language',           'Ð¯Ð·Ñ‹Ðº Ð¾Ð±Ñ‰ÐµÐ½Ð¸Ñ Ð¿Ð°Ñ†Ð¸ÐµÐ½Ñ‚Ð°',               'Patient Language',        'text',     10),
  ('b1000000-0000-0000-0000-000000000231', 'admit.triage',             'Ð¢Ñ€Ð¸Ð°Ð¶',                               'Triage',                  'text',     20),
  ('b1000000-0000-0000-0000-000000000232', 'admit.fall_risk',          'Ð Ð¸ÑÐº Ð¿Ð°Ð´ÐµÐ½Ð¸Ñ Ð¿Ð°Ñ†Ð¸ÐµÐ½Ñ‚Ð°',               'Fall Risk',               'text',     30),
  ('b1000000-0000-0000-0000-000000000233', 'admit.disability',         'Ð˜Ð½Ð²Ð°Ð»Ð¸Ð´Ð½Ð¾ÑÑ‚ÑŒ',                        'Disability',              'textarea', 40),
  ('b1000000-0000-0000-0000-000000000234', 'admit.pain_present',       'ÐŸÐ°Ñ†Ð¸ÐµÐ½Ñ‚ Ð¶Ð°Ð»ÑƒÐµÑ‚ÑÑ Ð½Ð° Ð±Ð¾Ð»ÑŒ',            'Pain Present',            'boolean',  50),
  ('b1000000-0000-0000-0000-000000000235', 'admit.pain_score',         'ÐžÑ†ÐµÐ½ÐºÐ° Ð±Ð¾Ð»Ð¸ (0â€“10)',                  'Pain Score',              'number',   60),
  ('b1000000-0000-0000-0000-000000000236', 'admit.infection_screening','Ð¡ÐºÑ€Ð¸Ð½Ð¸Ð½Ð³ Ð½Ð° Ð¸Ð½Ñ„ÐµÐºÑ†Ð¸Ð¾Ð½Ð½ÑƒÑŽ Ð¿Ð°Ñ‚Ð¾Ð»Ð¾Ð³Ð¸ÑŽ',  'Infection Screening',     'textarea', 70),
  ('b1000000-0000-0000-0000-000000000237', 'admit.pediculosis',        'ÐžÐ±Ð½Ð°Ñ€ÑƒÐ¶ÐµÐ½ Ð¿ÐµÐ´Ð¸ÐºÑƒÐ»Ñ‘Ð·',                 'Pediculosis',             'boolean',  80),
  ('b1000000-0000-0000-0000-000000000238', 'admit.preliminary_diag',   'ÐŸÑ€ÐµÐ´Ð²Ð°Ñ€Ð¸Ñ‚ÐµÐ»ÑŒÐ½Ñ‹Ð¹ Ð´Ð¸Ð°Ð³Ð½Ð¾Ð·',             'Preliminary Diagnosis',   'textarea', 90),
  ('b1000000-0000-0000-0000-000000000239', 'admit.decision',           'Ð ÐµÑˆÐµÐ½Ð¸Ðµ Ð¾ Ð³Ð¾ÑÐ¿Ð¸Ñ‚Ð°Ð»Ð¸Ð·Ð°Ñ†Ð¸Ð¸',            'Admission Decision',      'textarea', 100),
  ('b1000000-0000-0000-0000-000000000240', 'admit.transfer_org',       'ÐŸÐµÑ€ÐµÐ²Ð¾Ð´ Ð² Ð´Ñ€ÑƒÐ³ÑƒÑŽ Ð¼ÐµÐ´ Ð¾Ñ€Ð³Ð°Ð½Ð¸Ð·Ð°Ñ†Ð¸ÑŽ',    'Transfer to Other Org',   'textarea', 110),
  ('b1000000-0000-0000-0000-000000000241', 'admit.refusal',            'ÐžÑ‚ÐºÐ°Ð· Ð¾Ñ‚ Ð³Ð¾ÑÐ¿Ð¸Ñ‚Ð°Ð»Ð¸Ð·Ð°Ñ†Ð¸Ð¸',             'Admission Refusal',       'textarea', 120),
  ('b1000000-0000-0000-0000-000000000242', 'admit.admitting_nurse',    'ÐœÐµÐ´ÑÐµÑÑ‚Ñ€Ð° Ð¿Ñ€Ð¸Ñ‘Ð¼Ð½Ð¾Ð³Ð¾ Ð¾Ñ‚Ð´ÐµÐ»ÐµÐ½Ð¸Ñ',       'Admitting Nurse',         'text',     130);

-- â”€â”€ Consilium specific â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000250', 'cons.conclusion',           'Ð—Ð°ÐºÐ»ÑŽÑ‡ÐµÐ½Ð¸Ðµ',                          'Conclusion',              'textarea', 10),
  ('b1000000-0000-0000-0000-000000000251', 'cons.surg_strategy',        'Ð¡Ñ‚Ñ€Ð°Ñ‚ÐµÐ³Ð¸Ñ Ñ…Ð¸Ñ€ÑƒÑ€Ð³Ð¸Ñ‡ÐµÑÐºÐ¾Ð³Ð¾ Ð»ÐµÑ‡ÐµÐ½Ð¸Ñ',    'Surgical Strategy',       'textarea', 20),
  ('b1000000-0000-0000-0000-000000000252', 'cons.anest_strategy',       'Ð¡Ñ‚Ñ€Ð°Ñ‚ÐµÐ³Ð¸Ñ Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ð¾Ð»Ð¾Ð³Ð¸Ñ‡ÐµÑÐºÐ¾Ð³Ð¾ Ð¾Ð±ÐµÑÐ¿ÐµÑ‡ÐµÐ½Ð¸Ñ','Anesthesia Strategy','textarea', 30),
  ('b1000000-0000-0000-0000-000000000253', 'cons.postop_strategy',      'Ð¡Ñ‚Ñ€Ð°Ñ‚ÐµÐ³Ð¸Ñ Ð¿Ð¾ÑÐ»Ðµ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸',            'Post-op Strategy',        'textarea', 40),
  ('b1000000-0000-0000-0000-000000000254', 'cons.discharge_planning',   'ÐŸÐ»Ð°Ð½Ð¸Ñ€Ð¾Ð²Ð°Ð½Ð¸Ðµ Ð²Ñ‹Ð¿Ð¸ÑÐºÐ¸',                'Discharge Planning',      'textarea', 50),
  ('b1000000-0000-0000-0000-000000000255', 'cons.participants',         'Ð£Ñ‡Ð°ÑÑ‚Ð²Ð¾Ð²Ð°Ð»Ð¸',                         'Participants',            'textarea', 60),
  ('b1000000-0000-0000-0000-000000000256', 'cons.datetime',             'Ð”Ð°Ñ‚Ð° Ð¸ Ð²Ñ€ÐµÐ¼Ñ',                        'Date and Time',           'datetime', 70);

-- â”€â”€ Interventional Radiology specific â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000260', 'ir.protocol_number',       'ÐÐ¾Ð¼ÐµÑ€ Ð¿Ñ€Ð¾Ñ‚Ð¾ÐºÐ¾Ð»Ð° Ð²Ð¼ÐµÑˆÐ°Ñ‚ÐµÐ»ÑŒÑÑ‚Ð²Ð°',       'Intervention Protocol #', 'text',     10),
  ('b1000000-0000-0000-0000-000000000261', 'ir.procedure_name',        'ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ Ð¿Ñ€Ð¾Ñ†ÐµÐ´ÑƒÑ€Ñ‹',                  'Procedure Name',          'text',     20),
  ('b1000000-0000-0000-0000-000000000262', 'ir.puncture_site',         'ÐœÐµÑÑ‚Ð¾ Ð¿ÑƒÐ½ÐºÑ†Ð¸Ð¸',                       'Puncture Site',           'select',   30),
  ('b1000000-0000-0000-0000-000000000263', 'ir.conclusion',            'Ð—Ð°ÐºÐ»ÑŽÑ‡ÐµÐ½Ð¸Ðµ',                          'Conclusion',              'textarea', 40);

UPDATE public.field_definitions SET options = '[
  {"value":"radial","label_ru":"Ð›ÑƒÑ‡ÐµÐ²Ð°Ñ"},
  {"value":"femoral","label_ru":"Ð‘ÐµÐ´Ñ€ÐµÐ½Ð½Ð°Ñ"},
  {"value":"jugular","label_ru":"Ð¯Ñ€ÐµÐ¼Ð½Ð°Ñ"},
  {"value":"subclavian","label_ru":"ÐŸÐ¾Ð´ÐºÐ»ÑŽÑ‡Ð¸Ñ‡Ð½Ð°Ñ"},
  {"value":"local","label_ru":"ÐœÐµÑÑ‚Ð½Ð°Ñ (Ð›Ð¾ÐºÐ°Ð»ÑŒÐ½Ð¾)"}
]'::jsonb WHERE attribute_code = 'ir.puncture_site';

-- â”€â”€ Pre-op Summary specific â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000270', 'preop.indication',          'ÐŸÐ¾ÐºÐ°Ð·Ð°Ð½Ð¸Ðµ Ðº Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸',                'Surgical Indication',     'textarea', 10),
  ('b1000000-0000-0000-0000-000000000271', 'preop.operation_name',      'ÐÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸',                   'Operation Name',          'text',     20),
  ('b1000000-0000-0000-0000-000000000272', 'preop.surgery_time',        'Ð’Ñ€ÐµÐ¼Ñ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸',                      'Surgery Time',            'datetime', 30),
  ('b1000000-0000-0000-0000-000000000273', 'preop.surgery_plan',        'Ð¢Ð°ÐºÑ‚Ð¸ÐºÐ° Ð¸ Ð¾Ð±ÑŠÑ‘Ð¼ Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸',            'Surgery Plan',            'textarea', 40),
  ('b1000000-0000-0000-0000-000000000274', 'preop.technical_difficulties','ÐžÐ¶Ð¸Ð´Ð°ÐµÐ¼Ñ‹Ðµ Ñ‚ÐµÑ…Ð½Ð¸Ñ‡ÐµÑÐºÐ¸Ðµ ÑÐ»Ð¾Ð¶Ð½Ð¾ÑÑ‚Ð¸',   'Technical Difficulties',  'textarea', 50),
  ('b1000000-0000-0000-0000-000000000275', 'preop.postop_complications','Ð’ÐµÑ€Ð¾ÑÑ‚Ð½Ñ‹Ðµ Ð¿Ð¾ÑÐ»ÐµÐ¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¾Ð½Ð½Ñ‹Ðµ Ð¾ÑÐ»Ð¾Ð¶Ð½ÐµÐ½Ð¸Ñ','Postop Complications',   'textarea', 60),
  ('b1000000-0000-0000-0000-000000000276', 'preop.complication_prevention','ÐŸÑ€Ð¾Ñ„Ð¸Ð»Ð°ÐºÑ‚Ð¸ÐºÐ° Ð¿Ð¾ÑÑ‚Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¾Ð½Ð½Ñ‹Ñ… Ð¾ÑÐ»Ð¾Ð¶Ð½ÐµÐ½Ð¸Ð¹','Prevention',        'textarea', 70),
  ('b1000000-0000-0000-0000-000000000277', 'preop.anesthesia_type',     'Ð¢Ð¸Ð¿ Ð¾Ð±ÐµÐ·Ð±Ð¾Ð»Ð¸Ð²Ð°Ð½Ð¸Ñ',                   'Anesthesia Type',         'textarea', 80),
  ('b1000000-0000-0000-0000-000000000278', 'preop.expected_blood_loss', 'ÐžÐ¶Ð¸Ð´Ð°ÐµÐ¼Ñ‹Ð¹ Ð¾Ð±ÑŠÑ‘Ð¼ ÐºÑ€Ð¾Ð²Ð¾Ð¿Ð¾Ñ‚ÐµÑ€Ð¸',         'Expected Blood Loss',     'text',     90);

-- â”€â”€ EchoKG fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000280', 'echo.heart_rate',           'Ð§Ð¡Ð¡ (ÑƒÐ´/Ð¼Ð¸Ð½)',                'Heart Rate',              'number', 10),
  ('b1000000-0000-0000-0000-000000000281', 'echo.aorta',                'ÐÐ¾Ñ€Ñ‚Ð° (Ao)',                  'Aorta',                   'text',   20),
  ('b1000000-0000-0000-0000-000000000282', 'echo.left_atrium',          'Ð›ÐµÐ²Ð¾Ðµ Ð¿Ñ€ÐµÐ´ÑÐµÑ€Ð´Ð¸Ðµ (LA)',       'Left Atrium',             'text',   30),
  ('b1000000-0000-0000-0000-000000000283', 'echo.aortic_valve',         'ÐÐ¾Ñ€Ñ‚Ð°Ð»ÑŒÐ½Ñ‹Ð¹ ÐºÐ»Ð°Ð¿Ð°Ð½',           'Aortic Valve',            'text',   40),
  ('b1000000-0000-0000-0000-000000000284', 'echo.mitral_valve',         'ÐœÐ¸Ñ‚Ñ€Ð°Ð»ÑŒÐ½Ñ‹Ð¹ ÐºÐ»Ð°Ð¿Ð°Ð½',           'Mitral Valve',            'text',   50),
  ('b1000000-0000-0000-0000-000000000285', 'echo.right_ventricle',      'ÐŸÑ€Ð°Ð²Ñ‹Ð¹ Ð¶ÐµÐ»ÑƒÐ´Ð¾Ñ‡ÐµÐº',            'Right Ventricle',         'text',   60),
  ('b1000000-0000-0000-0000-000000000286', 'echo.ivs',                  'ÐœÐ–ÐŸ (IVS)',                   'Interventricular Septum', 'text',   70),
  ('b1000000-0000-0000-0000-000000000287', 'echo.lv_edd',               'ÐšÐ”Ð  (EDD) ÑÐ¼',               'LV EDD',                  'number', 80),
  ('b1000000-0000-0000-0000-000000000288', 'echo.lv_esd',               'ÐšÐ¡Ð  (ESD) ÑÐ¼',               'LV ESD',                  'number', 90),
  ('b1000000-0000-0000-0000-000000000289', 'echo.ef',                   'Ð¤Ð’ (EF) %',                  'Ejection Fraction',       'number', 100),
  ('b1000000-0000-0000-0000-000000000290', 'echo.fs',                   'Ð¤Ð£ (FS) %',                  'Fractional Shortening',   'number', 110),
  ('b1000000-0000-0000-0000-000000000291', 'echo.lv_posterior_wall',    'Ð—Ð¡Ð›Ð– (LVMD) ÑÐ¼',             'LV Posterior Wall',       'text',   120),
  ('b1000000-0000-0000-0000-000000000292', 'echo.edv',                  'ÐšÐ”Ðž (EDV) Ð¼Ð»',               'EDV',                     'number', 130),
  ('b1000000-0000-0000-0000-000000000293', 'echo.esv',                  'ÐšÐ¡Ðž (ESV) Ð¼Ð»',               'ESV',                     'number', 140),
  ('b1000000-0000-0000-0000-000000000294', 'echo.sv',                   'Ð£Ðž (SV) Ð¼Ð»',                 'Stroke Volume',           'number', 150),
  ('b1000000-0000-0000-0000-000000000295', 'echo.lv_mass',              'ÐœÐœÐ›Ð– (MW) Ð³',                'LV Mass',                 'number', 160),
  ('b1000000-0000-0000-0000-000000000296', 'echo.lv_mass_index',        'Ð˜ÐœÐœÐ›Ð– (MI) Ð³/Ð¼Â²',           'LV Mass Index',           'number', 170),
  ('b1000000-0000-0000-0000-000000000297', 'echo.doppler_mitral',       'ÐœÐ¸Ñ‚Ñ€Ð°Ð»ÑŒÐ½Ñ‹Ð¹ ÐºÐ»Ð°Ð¿Ð°Ð½ (Ð”Ð¾Ð¿Ð»ÐµÑ€)', 'Mitral Doppler',          'text',   180),
  ('b1000000-0000-0000-0000-000000000298', 'echo.doppler_tricuspid',    'Ð¢Ñ€Ñ‘Ñ…ÑÑ‚Ð²Ð¾Ñ€Ñ‡Ð°Ñ‚Ñ‹Ð¹ ÐºÐ»Ð°Ð¿Ð°Ð½',      'Tricuspid Doppler',       'text',   190),
  ('b1000000-0000-0000-0000-000000000299', 'echo.doppler_aorta',        'ÐÐ¾Ñ€Ñ‚Ð° (Ð”Ð¾Ð¿Ð»ÐµÑ€)',             'Aortic Doppler',          'text',   200),
  ('b1000000-0000-0000-0000-000000000300', 'echo.doppler_pulmonary',    'Ð›Ñ‘Ð³Ð¾Ñ‡Ð½Ð°Ñ Ð°Ñ€Ñ‚ÐµÑ€Ð¸Ñ (Ð”Ð¾Ð¿Ð»ÐµÑ€)', 'Pulmonary Doppler',       'text',   210),
  ('b1000000-0000-0000-0000-000000000301', 'echo.rvsp',                 'Ð¡Ð¸ÑÑ‚Ð¾Ð»Ð¸Ñ‡ÐµÑÐºÐ¾Ðµ Ð´Ð°Ð²Ð»ÐµÐ½Ð¸Ðµ Ð² ÐŸÐ–','RVSP',                    'number', 220),
  ('b1000000-0000-0000-0000-000000000302', 'echo.description',          'ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ',                   'Description',             'textarea',230),
  ('b1000000-0000-0000-0000-000000000303', 'echo.conclusion',           'Ð—Ð°ÐºÐ»ÑŽÑ‡ÐµÐ½Ð¸Ðµ',                 'Conclusion',              'textarea',240);

-- â”€â”€ ECG fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000310', 'ecg.rhythm',      'Ð Ð¸Ñ‚Ð¼ ÑÐµÑ€Ð´Ñ†Ð°',   'Heart Rhythm', 'select',   10),
  ('b1000000-0000-0000-0000-000000000311', 'ecg.description', 'ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ',      'Description',  'textarea', 20),
  ('b1000000-0000-0000-0000-000000000312', 'ecg.conclusion',  'Ð—Ð°ÐºÐ»ÑŽÑ‡ÐµÐ½Ð¸Ðµ',    'Conclusion',   'textarea', 30);

UPDATE public.field_definitions SET options = '[
  {"value":"sinus","label_ru":"Ð¡Ð¸Ð½ÑƒÑÐ¾Ð²Ñ‹Ð¹"},
  {"value":"sinus_arrhythmia","label_ru":"Ð¡Ð¸Ð½ÑƒÑÐ¾Ð²Ð°Ñ Ð°Ñ€Ð¸Ñ‚Ð¼Ð¸Ñ"},
  {"value":"afib","label_ru":"Ð¤Ð¸Ð±Ñ€Ð¸Ð»Ð»ÑÑ†Ð¸Ñ Ð¿Ñ€ÐµÐ´ÑÐµÑ€Ð´Ð¸Ð¹"},
  {"value":"aflutter","label_ru":"Ð¢Ñ€ÐµÐ¿ÐµÑ‚Ð°Ð½Ð¸Ðµ Ð¿Ñ€ÐµÐ´ÑÐµÑ€Ð´Ð¸Ð¹"},
  {"value":"av_block_1","label_ru":"ÐÐ’ Ð±Ð»Ð¾ÐºÐ°Ð´Ð° I-ÑÑ‚ÐµÐ¿ÐµÐ½Ð¸"},
  {"value":"av_block_2_m1","label_ru":"ÐÐ’ Ð±Ð»Ð¾ÐºÐ°Ð´Ð° II-ÑÑ‚ÐµÐ¿ÐµÐ½Ð¸ (ÐœÐ¾Ð±Ð¸Ñ‚Ñ† 1)"},
  {"value":"av_block_2_m2","label_ru":"ÐÐ’ Ð±Ð»Ð¾ÐºÐ°Ð´Ð° II-ÑÑ‚ÐµÐ¿ÐµÐ½Ð¸ (ÐœÐ¾Ð±Ð¸Ñ‚Ñ† 2)"},
  {"value":"complete_av_block","label_ru":"ÐŸÐ¾Ð»Ð½Ð°Ñ ÐÐ’-Ð±Ð»Ð¾ÐºÐ°Ð´Ð°"}
]'::jsonb WHERE attribute_code = 'ecg.rhythm';

-- â”€â”€ UZI fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000320', 'uzi.liver',               'ÐŸÐµÑ‡ÐµÐ½ÑŒ',                   'Liver',               'textarea', 10),
  ('b1000000-0000-0000-0000-000000000321', 'uzi.gallbladder',         'Ð–ÐµÐ»Ñ‡Ð½Ñ‹Ð¹ Ð¿ÑƒÐ·Ñ‹Ñ€ÑŒ',           'Gallbladder',         'textarea', 20),
  ('b1000000-0000-0000-0000-000000000322', 'uzi.pancreas',            'ÐŸÐ¾Ð´Ð¶ÐµÐ»ÑƒÐ´Ð¾Ñ‡Ð½Ð°Ñ Ð¶ÐµÐ»ÐµÐ·Ð°',     'Pancreas',            'textarea', 30),
  ('b1000000-0000-0000-0000-000000000323', 'uzi.spleen',              'Ð¡ÐµÐ»ÐµÐ·Ñ‘Ð½ÐºÐ°',                'Spleen',              'textarea', 40),
  ('b1000000-0000-0000-0000-000000000324', 'uzi.right_kidney',        'ÐŸÑ€Ð°Ð²Ð°Ñ Ð¿Ð¾Ñ‡ÐºÐ°',             'Right Kidney',        'textarea', 50),
  ('b1000000-0000-0000-0000-000000000325', 'uzi.left_kidney',         'Ð›ÐµÐ²Ð°Ñ Ð¿Ð¾Ñ‡ÐºÐ°',              'Left Kidney',         'textarea', 60),
  ('b1000000-0000-0000-0000-000000000326', 'uzi.uterus',              'ÐœÐ°Ñ‚ÐºÐ°',                    'Uterus',              'textarea', 70),
  ('b1000000-0000-0000-0000-000000000327', 'uzi.cervix',              'Ð¨ÐµÐ¹ÐºÐ° Ð¼Ð°Ñ‚ÐºÐ¸',              'Cervix',              'textarea', 80),
  ('b1000000-0000-0000-0000-000000000328', 'uzi.ovaries',             'Ð¯Ð¸Ñ‡Ð½Ð¸ÐºÐ¸',                  'Ovaries',             'textarea', 90),
  ('b1000000-0000-0000-0000-000000000329', 'uzi.bladder',             'ÐœÐ¾Ñ‡ÐµÐ²Ð¾Ð¹ Ð¿ÑƒÐ·Ñ‹Ñ€ÑŒ',           'Bladder',             'textarea', 100),
  ('b1000000-0000-0000-0000-000000000330', 'uzi.prostate',            'ÐŸÑ€ÐµÐ´ÑÑ‚Ð°Ñ‚ÐµÐ»ÑŒÐ½Ð°Ñ Ð¶ÐµÐ»ÐµÐ·Ð°',    'Prostate',            'textarea', 110),
  ('b1000000-0000-0000-0000-000000000331', 'uzi.description',         'ÐžÐ¿Ð¸ÑÐ°Ð½Ð¸Ðµ',                 'Description',         'textarea', 120),
  ('b1000000-0000-0000-0000-000000000332', 'uzi.conclusion',          'Ð—Ð°ÐºÐ»ÑŽÑ‡ÐµÐ½Ð¸Ðµ',               'Conclusion',          'textarea', 130);

-- â”€â”€ Daily Note specific â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.field_definitions (id, attribute_code, label_ru, label_en, field_type, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000340', 'daily.allergy',           'ÐÐ»Ð»ÐµÑ€Ð³Ð¸Ñ',                         'Allergies',       'textarea', 10),
  ('b1000000-0000-0000-0000-000000000341', 'daily.general_condition', 'ÐžÐ±Ñ‰ÐµÐµ ÑÐ¾ÑÑ‚Ð¾ÑÐ½Ð¸Ðµ',                   'General Condition','textarea',20),
  ('b1000000-0000-0000-0000-000000000342', 'daily.diag_complication', 'ÐžÑÐ»Ð¾Ð¶Ð½ÐµÐ½Ð¸Ðµ Ð¾ÑÐ½Ð¾Ð²Ð½Ð¾Ð³Ð¾ Ð´Ð¸Ð°Ð³Ð½Ð¾Ð·Ð°',     'Complication',    'textarea', 30),
  ('b1000000-0000-0000-0000-000000000343', 'daily.concomitant',       'Ð¡Ð¾Ð¿ÑƒÑ‚ÑÑ‚Ð²ÑƒÑŽÑ‰Ð¸Ð¹ Ð´Ð¸Ð°Ð³Ð½Ð¾Ð·',             'Concomitant',     'textarea', 40),
  ('b1000000-0000-0000-0000-000000000344', 'daily.treatment_plan',    'ÐŸÐ»Ð°Ð½ Ð»ÐµÑ‡ÐµÐ½Ð¸Ñ',                      'Treatment Plan',  'textarea', 50);

-- ============================================================
-- PART 3: DOCUMENT TYPES (22 types)
-- ============================================================
INSERT INTO public.document_types (id, code, name_ru, name_en, color, setting, is_system_default, requires_second_sig) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'discharge_summary',          'Ð’Ñ‹Ð¿Ð¸ÑÐ½Ð¾Ð¹ ÑÐ¿Ð¸ÐºÑ€Ð¸Ð·',                           'Discharge Summary',                  '#4CAF50', 'inpatient', true, false),
  ('c1000000-0000-0000-0000-000000000002', 'daily_note',                 'Ð”Ð½ÐµÐ²Ð½Ð¸ÐºÐ¾Ð²Ð°Ñ Ð·Ð°Ð¿Ð¸ÑÑŒ',                          'Daily Note',                         '#2196F3', 'inpatient', true, false),
  ('c1000000-0000-0000-0000-000000000003', 'consilium',                  'ÐšÐ¾Ð½ÑÐ¸Ð»Ð¸ÑƒÐ¼',                                   'Consilium',                          '#9C27B0', 'both',      true, true),
  ('c1000000-0000-0000-0000-000000000004', 'perfusion_protocol',         'ÐŸÑ€Ð¾Ñ‚Ð¾ÐºÐ¾Ð» Ð¿ÐµÑ€Ñ„ÑƒÐ·Ð¸Ð¸',                           'Perfusion Protocol',                 '#FF5722', 'inpatient', true, false),
  ('c1000000-0000-0000-0000-000000000005', 'high_risk_procedure',        'ÐŸÑ€Ð¾Ñ†ÐµÐ´ÑƒÑ€Ð° Ð²Ñ‹ÑÐ¾ÐºÐ¾Ð³Ð¾ Ñ€Ð¸ÑÐºÐ°',                    'High Risk Procedure',                '#F44336', 'inpatient', true, false),
  ('c1000000-0000-0000-0000-000000000006', 'interventional_radiology',   'Ð ÐµÐ½Ñ‚Ð³ÐµÐ½Ð¾Ñ…Ð¸Ñ€ÑƒÑ€Ð³Ð¸Ñ‡ÐµÑÐºÐ¾Ðµ Ð²Ð¼ÐµÑˆÐ°Ñ‚ÐµÐ»ÑŒÑÑ‚Ð²Ð¾',         'Interventional Radiology',           '#FF9800', 'both',      true, false),
  ('c1000000-0000-0000-0000-000000000007', 'ultrasound',                 'Ð£Ð—Ð˜',                                         'Ultrasound',                         '#00BCD4', 'both',      true, false),
  ('c1000000-0000-0000-0000-000000000008', 'ecg',                        'Ð­ÐšÐ“',                                         'ECG',                                '#607D8B', 'both',      true, false),
  ('c1000000-0000-0000-0000-000000000009', 'echocardiography',           'Ð­Ñ…Ð¾ÐšÐ“',                                       'Echocardiography',                   '#009688', 'both',      true, false),
  ('c1000000-0000-0000-0000-000000000010', 'anesthesia_protocol',        'ÐŸÑ€Ð¾Ñ‚Ð¾ÐºÐ¾Ð» Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ð¸',                          'Anesthesia Protocol',                '#795548', 'inpatient', true, false),
  ('c1000000-0000-0000-0000-000000000011', 'operation_protocol',         'ÐŸÑ€Ð¾Ñ‚Ð¾ÐºÐ¾Ð» Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¸',                           'Operation Protocol',                 '#E91E63', 'inpatient', true, false),
  ('c1000000-0000-0000-0000-000000000012', 'transfer_criteria',          'ÐšÑ€Ð¸Ñ‚ÐµÑ€Ð¸Ð¸ Ð¿ÐµÑ€ÐµÐ²Ð¾Ð´Ð°',                           'Transfer Criteria',                  '#FF5722', 'inpatient', true, true),
  ('c1000000-0000-0000-0000-000000000013', 'brief_admission_exam',       'ÐšÑ€Ð°Ñ‚ÐºÐ¸Ð¹ Ð¾ÑÐ¼Ð¾Ñ‚Ñ€ Ð² Ð¿Ñ€Ð¸Ñ‘Ð¼Ð½Ð¾Ð¼',                   'Brief Admission Exam',               '#3F51B5', 'inpatient', true, false),
  ('c1000000-0000-0000-0000-000000000014', 'diagnosis_justification',    'ÐžÐ±Ð¾ÑÐ½Ð¾Ð²Ð°Ð½Ð¸Ðµ Ð´Ð¸Ð°Ð³Ð½Ð¾Ð·Ð°',                        'Diagnosis Justification',            '#8BC34A', 'inpatient', true, false),
  ('c1000000-0000-0000-0000-000000000015', 'anesthesiologist_exam',      'ÐžÑÐ¼Ð¾Ñ‚Ñ€ Ð°Ð½ÐµÑÑ‚ÐµÐ·Ð¸Ð¾Ð»Ð¾Ð³Ð°',                        'Anesthesiologist Exam',              '#FFC107', 'inpatient', true, false),
  ('c1000000-0000-0000-0000-000000000016', 'primary_physician_exam',     'ÐŸÐµÑ€Ð²Ð¸Ñ‡Ð½Ñ‹Ð¹ Ð¾ÑÐ¼Ð¾Ñ‚Ñ€ Ð²Ñ€Ð°Ñ‡Ð°',                      'Primary Physician Exam',             '#03A9F4', 'inpatient', true, false),
  ('c1000000-0000-0000-0000-000000000017', 'transfer_summary',           'ÐŸÐµÑ€ÐµÐ²Ð¾Ð´Ð½Ð¾Ð¹ ÑÐ¿Ð¸ÐºÑ€Ð¸Ð·',                          'Transfer Summary',                   '#9E9E9E', 'inpatient', true, false),
  ('c1000000-0000-0000-0000-000000000018', 'post_mortem_summary',        'ÐŸÐ¾ÑÐ¼ÐµÑ€Ñ‚Ð½Ñ‹Ð¹ ÑÐ¿Ð¸ÐºÑ€Ð¸Ð·',                          'Post-mortem Summary',                '#424242', 'inpatient', true, false),
  ('c1000000-0000-0000-0000-000000000019', 'pre_op_verification',        'ÐŸÑ€ÐµÐ´Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¾Ð½Ð½Ð°Ñ Ð²ÐµÑ€Ð¸Ñ„Ð¸ÐºÐ°Ñ†Ð¸Ñ',                'Pre-op Verification',                '#FF9800', 'inpatient', true, false),
  ('c1000000-0000-0000-0000-000000000020', 'pre_operative_summary',      'ÐŸÑ€ÐµÐ´Ð¾Ð¿ÐµÑ€Ð°Ñ†Ð¸Ð¾Ð½Ð½Ñ‹Ð¹ ÑÐ¿Ð¸ÐºÑ€Ð¸Ð·',                   'Pre-operative Summary',              '#E91E63', 'inpatient', true, false),
  ('c1000000-0000-0000-0000-000000000021', 'primary_nursing_assessment', 'ÐšÐ°Ñ€Ñ‚Ð° Ð¿ÐµÑ€Ð²Ð¸Ñ‡Ð½Ð¾Ð³Ð¾ ÑÐµÑÑ‚Ñ€Ð¸Ð½ÑÐºÐ¾Ð³Ð¾ Ð¾ÑÐ¼Ð¾Ñ‚Ñ€Ð°',       'Primary Nursing Assessment',         '#4DB6AC', 'inpatient', true, false),
  ('c1000000-0000-0000-0000-000000000022', 'physician_orders_sheet',     'Ð›Ð¸ÑÑ‚ Ð²Ñ€Ð°Ñ‡ÐµÐ±Ð½Ñ‹Ñ… Ð½Ð°Ð·Ð½Ð°Ñ‡ÐµÐ½Ð¸Ð¹',                   'Physician Orders Sheet',             '#7986CB', 'inpatient', true, false);

-- ============================================================
-- PART 4: DOCUMENT TYPE â†’ SECTIONS MAPPING
-- ============================================================

-- discharge_summary
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',10), -- complaints_and_history
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002',20), -- vitals
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003',30), -- objective_assessment_full
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004',40), -- nutritional_screening
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000005',50), -- local_status
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000006',60), -- diagnosis
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000010',70), -- procedures_performed
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008',80); -- discharge_plan

-- daily_note
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000021',10), -- daily_note_main
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002',20), -- vitals
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000006',30), -- diagnosis
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000007',40); -- treatment_plan

-- consilium
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000001',10),
  ('c1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000002',20),
  ('c1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000003',30),
  ('c1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000005',40),
  ('c1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000006',50),
  ('c1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000013',60), -- conclusion
  ('c1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000011',70); -- participants

-- perfusion_protocol
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015',10), -- perfusion_data
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000011',20); -- participants

-- high_risk_procedure
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000012',10), -- verification_checklist
  ('c1000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000006',20), -- diagnosis
  ('c1000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000010',30), -- procedures_performed
  ('c1000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000011',40); -- participants

-- interventional_radiology
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000006',10),
  ('c1000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000010',20),
  ('c1000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000011',30);

-- ultrasound
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000019',10), -- uzi_findings
  ('c1000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000013',20); -- conclusion

-- ecg
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000008','a1000000-0000-0000-0000-000000000020',10), -- ecg_findings
  ('c1000000-0000-0000-0000-000000000008','a1000000-0000-0000-0000-000000000013',20);

-- echocardiography
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000016',10), -- echo_m_mode
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000017',20), -- echo_b_mode
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000018',30), -- echo_doppler
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000013',40);

-- anesthesia_protocol
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000010','a1000000-0000-0000-0000-000000000010',10),
  ('c1000000-0000-0000-0000-000000000010','a1000000-0000-0000-0000-000000000011',20);

-- operation_protocol
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000006',10),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000010',20),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000011',30);

-- transfer_criteria
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000012','a1000000-0000-0000-0000-000000000014',10), -- transfer_criteria_scores
  ('c1000000-0000-0000-0000-000000000012','a1000000-0000-0000-0000-000000000011',20);

-- brief_admission_exam
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000002',10),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000006',20),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000013',30);

-- diagnosis_justification
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000014','a1000000-0000-0000-0000-000000000001',10),
  ('c1000000-0000-0000-0000-000000000014','a1000000-0000-0000-0000-000000000002',20),
  ('c1000000-0000-0000-0000-000000000014','a1000000-0000-0000-0000-000000000003',30),
  ('c1000000-0000-0000-0000-000000000014','a1000000-0000-0000-0000-000000000004',40),
  ('c1000000-0000-0000-0000-000000000014','a1000000-0000-0000-0000-000000000005',50),
  ('c1000000-0000-0000-0000-000000000014','a1000000-0000-0000-0000-000000000006',60),
  ('c1000000-0000-0000-0000-000000000014','a1000000-0000-0000-0000-000000000013',70);

-- anesthesiologist_exam
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000015','a1000000-0000-0000-0000-000000000001',10),
  ('c1000000-0000-0000-0000-000000000015','a1000000-0000-0000-0000-000000000002',20),
  ('c1000000-0000-0000-0000-000000000015','a1000000-0000-0000-0000-000000000003',30),
  ('c1000000-0000-0000-0000-000000000015','a1000000-0000-0000-0000-000000000004',40),
  ('c1000000-0000-0000-0000-000000000015','a1000000-0000-0000-0000-000000000005',50),
  ('c1000000-0000-0000-0000-000000000015','a1000000-0000-0000-0000-000000000006',60),
  ('c1000000-0000-0000-0000-000000000015','a1000000-0000-0000-0000-000000000013',70);

-- primary_physician_exam
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000016','a1000000-0000-0000-0000-000000000001',10),
  ('c1000000-0000-0000-0000-000000000016','a1000000-0000-0000-0000-000000000002',20),
  ('c1000000-0000-0000-0000-000000000016','a1000000-0000-0000-0000-000000000003',30),
  ('c1000000-0000-0000-0000-000000000016','a1000000-0000-0000-0000-000000000004',40),
  ('c1000000-0000-0000-0000-000000000016','a1000000-0000-0000-0000-000000000005',50),
  ('c1000000-0000-0000-0000-000000000016','a1000000-0000-0000-0000-000000000006',60),
  ('c1000000-0000-0000-0000-000000000016','a1000000-0000-0000-0000-000000000007',70);

-- transfer_summary
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000002',10),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000001',20),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000005',30),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000006',40),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000011',50);

-- post_mortem_summary (same structure as discharge_summary)
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000018','a1000000-0000-0000-0000-000000000001',10),
  ('c1000000-0000-0000-0000-000000000018','a1000000-0000-0000-0000-000000000002',20),
  ('c1000000-0000-0000-0000-000000000018','a1000000-0000-0000-0000-000000000003',30),
  ('c1000000-0000-0000-0000-000000000018','a1000000-0000-0000-0000-000000000004',40),
  ('c1000000-0000-0000-0000-000000000018','a1000000-0000-0000-0000-000000000005',50),
  ('c1000000-0000-0000-0000-000000000018','a1000000-0000-0000-0000-000000000006',60),
  ('c1000000-0000-0000-0000-000000000018','a1000000-0000-0000-0000-000000000010',70),
  ('c1000000-0000-0000-0000-000000000018','a1000000-0000-0000-0000-000000000008',80);

-- pre_op_verification
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000012',10),
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000006',20);

-- pre_operative_summary
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000020','a1000000-0000-0000-0000-000000000001',10),
  ('c1000000-0000-0000-0000-000000000020','a1000000-0000-0000-0000-000000000002',20),
  ('c1000000-0000-0000-0000-000000000020','a1000000-0000-0000-0000-000000000003',30),
  ('c1000000-0000-0000-0000-000000000020','a1000000-0000-0000-0000-000000000004',40),
  ('c1000000-0000-0000-0000-000000000020','a1000000-0000-0000-0000-000000000005',50),
  ('c1000000-0000-0000-0000-000000000020','a1000000-0000-0000-0000-000000000006',60),
  ('c1000000-0000-0000-0000-000000000020','a1000000-0000-0000-0000-000000000009',70); -- surgical_plan

-- primary_nursing_assessment (CO-01 paediatric â€” adult to be added later)
INSERT INTO public.document_type_sections (document_type_id, section_id, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000021','a1000000-0000-0000-0000-000000000001',10),
  ('c1000000-0000-0000-0000-000000000021','a1000000-0000-0000-0000-000000000002',20),
  ('c1000000-0000-0000-0000-000000000021','a1000000-0000-0000-0000-000000000003',30),
  ('c1000000-0000-0000-0000-000000000021','a1000000-0000-0000-0000-000000000004',40),
  ('c1000000-0000-0000-0000-000000000021','a1000000-0000-0000-0000-000000000007',50);

-- physician_orders_sheet (no sections needed â€” rendered separately as order grid)
-- document_type_sections intentionally empty for this type

-- ============================================================
-- PART 5: DOCUMENT TYPE FIELDS (field â†’ section â†’ document mapping)
-- Only key mandatory fields per document for initial seed.
-- All textarea fields are non-mandatory by default.
-- ============================================================

-- â”€â”€ discharge_summary fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.document_type_fields (document_type_id, section_id, field_definition_id, sort_order, is_mandatory) VALUES
  -- complaints_and_history
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001',10,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002',20,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000003',30,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000004',40,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000005',50,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000006',60,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000007',70,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000008',80,false),
  -- vitals
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000010',10,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000011',20,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000012',30,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000013',40,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000014',50,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000015',60,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000016',70,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000017',80,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000018',90,false),
  -- objective
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000030',10,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000031',20,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000032',30,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000033',40,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000034',50,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000035',60,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000036',70,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000037',80,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000038',90,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000040',100,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000041',110,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000042',120,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000043',130,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000044',140,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000045',150,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000046',160,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000047',170,false),
  -- nutritional_screening
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','b1000000-0000-0000-0000-000000000050',20,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','b1000000-0000-0000-0000-000000000051',30,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','b1000000-0000-0000-0000-000000000052',40,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004','b1000000-0000-0000-0000-000000000053',50,false),
  -- local_status
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000039',10,false),
  -- diagnosis
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000060',10,true),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000061',20,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000062',30,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000063',40,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000064',50,false),
  -- procedures_performed
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000100',10,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000098',20,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000099',30,false),
  -- discharge_plan
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000095',5,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000096',6,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000097',7,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000090',10,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000091',20,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000080',30,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000081',40,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000092',50,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000093',60,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000094',70,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000075',80,false),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000076',90,false);

-- â”€â”€ ECG fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.document_type_fields (document_type_id, section_id, field_definition_id, sort_order, is_mandatory) VALUES
  ('c1000000-0000-0000-0000-000000000008','a1000000-0000-0000-0000-000000000020','b1000000-0000-0000-0000-000000000310',10,false),
  ('c1000000-0000-0000-0000-000000000008','a1000000-0000-0000-0000-000000000020','b1000000-0000-0000-0000-000000000311',20,false),
  ('c1000000-0000-0000-0000-000000000008','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000312',10,true);

-- â”€â”€ EchoKG fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.document_type_fields (document_type_id, section_id, field_definition_id, sort_order, is_mandatory) VALUES
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000016','b1000000-0000-0000-0000-000000000280',10,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000016','b1000000-0000-0000-0000-000000000281',20,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000016','b1000000-0000-0000-0000-000000000282',30,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000016','b1000000-0000-0000-0000-000000000283',40,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000016','b1000000-0000-0000-0000-000000000284',50,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000016','b1000000-0000-0000-0000-000000000286',60,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000016','b1000000-0000-0000-0000-000000000287',70,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000016','b1000000-0000-0000-0000-000000000288',80,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000016','b1000000-0000-0000-0000-000000000289',90,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000016','b1000000-0000-0000-0000-000000000290',100,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000016','b1000000-0000-0000-0000-000000000291',110,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000016','b1000000-0000-0000-0000-000000000292',120,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000016','b1000000-0000-0000-0000-000000000293',130,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000016','b1000000-0000-0000-0000-000000000294',140,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000016','b1000000-0000-0000-0000-000000000295',150,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000016','b1000000-0000-0000-0000-000000000296',160,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000017','b1000000-0000-0000-0000-000000000285',10,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000018','b1000000-0000-0000-0000-000000000297',10,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000018','b1000000-0000-0000-0000-000000000298',20,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000018','b1000000-0000-0000-0000-000000000299',30,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000018','b1000000-0000-0000-0000-000000000300',40,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000018','b1000000-0000-0000-0000-000000000301',50,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000302',10,false),
  ('c1000000-0000-0000-0000-000000000009','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000303',20,true);

-- â”€â”€ UZI fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.document_type_fields (document_type_id, section_id, field_definition_id, sort_order, is_mandatory) VALUES
  ('c1000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000019','b1000000-0000-0000-0000-000000000320',10,false),
  ('c1000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000019','b1000000-0000-0000-0000-000000000321',20,false),
  ('c1000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000019','b1000000-0000-0000-0000-000000000322',30,false),
  ('c1000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000019','b1000000-0000-0000-0000-000000000323',40,false),
  ('c1000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000019','b1000000-0000-0000-0000-000000000324',50,false),
  ('c1000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000019','b1000000-0000-0000-0000-000000000325',60,false),
  ('c1000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000019','b1000000-0000-0000-0000-000000000326',70,false),
  ('c1000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000019','b1000000-0000-0000-0000-000000000327',80,false),
  ('c1000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000019','b1000000-0000-0000-0000-000000000328',90,false),
  ('c1000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000019','b1000000-0000-0000-0000-000000000329',100,false),
  ('c1000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000019','b1000000-0000-0000-0000-000000000330',110,false),
  ('c1000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000331',10,false),
  ('c1000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000332',20,true);

-- â”€â”€ Transfer criteria fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.document_type_fields (document_type_id, section_id, field_definition_id, sort_order, is_mandatory) VALUES
  ('c1000000-0000-0000-0000-000000000012','a1000000-0000-0000-0000-000000000014','b1000000-0000-0000-0000-000000000200',10,true),
  ('c1000000-0000-0000-0000-000000000012','a1000000-0000-0000-0000-000000000014','b1000000-0000-0000-0000-000000000201',20,true),
  ('c1000000-0000-0000-0000-000000000012','a1000000-0000-0000-0000-000000000014','b1000000-0000-0000-0000-000000000202',30,true),
  ('c1000000-0000-0000-0000-000000000012','a1000000-0000-0000-0000-000000000014','b1000000-0000-0000-0000-000000000203',40,true),
  ('c1000000-0000-0000-0000-000000000012','a1000000-0000-0000-0000-000000000014','b1000000-0000-0000-0000-000000000204',50,true),
  ('c1000000-0000-0000-0000-000000000012','a1000000-0000-0000-0000-000000000014','b1000000-0000-0000-0000-000000000205',60,false),
  ('c1000000-0000-0000-0000-000000000012','a1000000-0000-0000-0000-000000000014','b1000000-0000-0000-0000-000000000206',70,false),
  ('c1000000-0000-0000-0000-000000000012','a1000000-0000-0000-0000-000000000014','b1000000-0000-0000-0000-000000000207',80,false),
  ('c1000000-0000-0000-0000-000000000012','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000148',10,true),
  ('c1000000-0000-0000-0000-000000000012','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000208',20,false),
  ('c1000000-0000-0000-0000-000000000012','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000209',30,false);

-- â”€â”€ Transfer summary fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.document_type_fields (document_type_id, section_id, field_definition_id, sort_order, is_mandatory) VALUES
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000010',10,false),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000011',20,false),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000013',30,false),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000014',40,false),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000015',50,false),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000016',60,false),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000017',70,false),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000018',80,false),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002',10,false),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000003',20,false),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001',30,false),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000039',10,false),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000030',20,false),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000076',30,false),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000060',10,true),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000061',20,false),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000062',30,false),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000063',40,false),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000064',50,false),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000110',10,true),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000111',20,true),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000154',30,false),
  ('c1000000-0000-0000-0000-000000000017','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000153',40,false);

-- â”€â”€ Perfusion protocol fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.document_type_fields (document_type_id, section_id, field_definition_id, sort_order, is_mandatory) VALUES
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000170',10,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000171',20,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000172',30,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000173',40,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000174',50,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000175',60,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000176',70,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000177',80,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000178',90,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000179',100,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000180',110,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000181',120,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000182',130,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000183',140,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000184',150,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000185',160,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000186',170,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000187',180,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000188',190,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000189',200,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000190',210,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000015','b1000000-0000-0000-0000-000000000191',220,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000150',10,false),
  ('c1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000151',20,false);

-- â”€â”€ Anesthesia protocol fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.document_type_fields (document_type_id, section_id, field_definition_id, sort_order, is_mandatory) VALUES
  ('c1000000-0000-0000-0000-000000000010','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000160',10,false),
  ('c1000000-0000-0000-0000-000000000010','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000161',20,false),
  ('c1000000-0000-0000-0000-000000000010','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000124',30,false),
  ('c1000000-0000-0000-0000-000000000010','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000125',40,false),
  ('c1000000-0000-0000-0000-000000000010','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000123',50,false),
  ('c1000000-0000-0000-0000-000000000010','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000162',60,false),
  ('c1000000-0000-0000-0000-000000000010','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000163',70,false),
  ('c1000000-0000-0000-0000-000000000010','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000164',80,false),
  ('c1000000-0000-0000-0000-000000000010','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000144',10,false),
  ('c1000000-0000-0000-0000-000000000010','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000145',20,false),
  ('c1000000-0000-0000-0000-000000000010','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000154',30,false),
  ('c1000000-0000-0000-0000-000000000010','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000153',40,false);

-- â”€â”€ Operation protocol fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.document_type_fields (document_type_id, section_id, field_definition_id, sort_order, is_mandatory) VALUES
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000065',10,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000066',20,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000134',5,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000120',10,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000121',20,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000122',30,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000123',40,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000124',50,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000125',60,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000126',70,true),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000127',80,true),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000128',90,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000129',100,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000130',110,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000131',120,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000132',130,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000010','b1000000-0000-0000-0000-000000000133',140,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000140',10,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000141',20,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000142',30,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000147',40,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000143',50,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000144',60,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000145',70,false),
  ('c1000000-0000-0000-0000-000000000011','a1000000-0000-0000-0000-000000000011','b1000000-0000-0000-0000-000000000146',80,false);

-- â”€â”€ Pre-op verification fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.document_type_fields (document_type_id, section_id, field_definition_id, sort_order, is_mandatory) VALUES
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000210',10,true),
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000211',20,true),
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000212',30,false),
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000213',40,false),
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000214',50,false),
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000215',60,false),
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000216',70,false),
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000217',80,true),
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000218',90,true),
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000219',100,true),
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000220',110,false),
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000221',120,false),
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000222',130,false),
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000223',140,false),
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000224',150,false),
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000225',160,false),
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000226',170,false),
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000012','b1000000-0000-0000-0000-000000000227',180,false),
  ('c1000000-0000-0000-0000-000000000019','a1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000067',10,true);

-- â”€â”€ Brief admission exam fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.document_type_fields (document_type_id, section_id, field_definition_id, sort_order, is_mandatory) VALUES
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000010',10,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000011',20,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000013',30,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000014',40,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000015',50,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000016',60,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000017',70,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000018',80,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000060',10,true),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000230',10,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000231',20,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000232',30,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000001',40,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000003',50,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000039',60,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000030',70,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000233',80,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000234',90,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000235',100,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000236',110,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000237',120,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000238',130,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000239',140,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000240',150,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000241',160,false),
  ('c1000000-0000-0000-0000-000000000013','a1000000-0000-0000-0000-000000000013','b1000000-0000-0000-0000-000000000242',170,false);

-- â”€â”€ Daily note fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
INSERT INTO public.document_type_fields (document_type_id, section_id, field_definition_id, sort_order, is_mandatory) VALUES
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000021','b1000000-0000-0000-0000-000000000020',5,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000021','b1000000-0000-0000-0000-000000000340',10,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000021','b1000000-0000-0000-0000-000000000341',20,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000021','b1000000-0000-0000-0000-000000000039',30,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000010',10,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000011',20,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000013',30,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000014',40,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000015',50,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000019',60,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000016',70,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000017',80,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000018',90,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000060',10,true),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000061',20,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000062',30,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000063',40,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000007','b1000000-0000-0000-0000-000000000080',10,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000007','b1000000-0000-0000-0000-000000000081',20,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000007','b1000000-0000-0000-0000-000000000076',30,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000007','b1000000-0000-0000-0000-000000000154',40,false),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000007','b1000000-0000-0000-0000-000000000153',50,false);