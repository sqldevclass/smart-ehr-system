-- Migration 071: EWS (Early Warning Score) System
-- Covers NEWS2 (adults ≥16y) and PEWS (children <16y)
-- Includes schema + full seed data

-- ============================================================
-- 1. EWS SCALES
-- ============================================================
CREATE TABLE public.ews_scales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,
  name            text NOT NULL,
  min_age_months  integer NOT NULL,
  max_age_months  integer, -- NULL means no upper limit
  is_active       boolean DEFAULT true
);

INSERT INTO public.ews_scales
  (code, name, min_age_months, max_age_months) VALUES
  ('pews_0_11m',  'PEWS 0-11 Months',    0,   11),
  ('pews_12_23m', 'PEWS 12-23 Months',   12,  23),
  ('pews_2_4y',   'PEWS 2-4 Years',      24,  59),
  ('pews_5_11y',  'PEWS 5-11 Years',     60,  143),
  ('pews_12_16y', 'PEWS 12-16 Years',    144, 191),
  ('news2',       'NEWS2',               192, NULL);

-- ============================================================
-- 2. EWS PARAMETERS
-- ============================================================
CREATE TABLE public.ews_parameters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scale_id        uuid NOT NULL REFERENCES public.ews_scales(id)
    ON DELETE CASCADE,
  code            text NOT NULL,
  name_ru         text NOT NULL,
  unit            text,
  input_type      text NOT NULL CHECK (input_type IN
    ('numeric', 'integer', 'enum')),
  display_order   integer NOT NULL DEFAULT 0,
  is_active       boolean DEFAULT true,
  UNIQUE (scale_id, code)
);

-- NEWS2 parameters
INSERT INTO public.ews_parameters
  (scale_id, code, name_ru, unit, input_type, display_order)
SELECT s.id, p.code, p.name_ru, p.unit,
       p.input_type, p.display_order
FROM public.ews_scales s,
(VALUES
  ('respiratory_rate', 'Частота дыхания', 'уд/мин', 'integer', 1),
  ('spo2_scale1', 'SpO2 Шкала 1', '%', 'numeric', 2),
  ('spo2_scale2', 'SpO2 Шкала 2', '%', 'numeric', 3),
  ('oxygen',      'Кислород', '', 'enum', 4),
  ('systolic_bp', 'АД систолическое', 'мм рт.ст.', 'integer', 5),
  ('pulse',       'Пульс', 'уд/мин', 'integer', 6),
  ('consciousness','Сознание', '', 'enum', 7),
  ('temperature', 'Температура', '°C', 'numeric', 8)
) AS p(code, name_ru, unit, input_type, display_order)
WHERE s.code = 'news2';

-- PEWS parameters (all 5 age groups get same params)
DO $$
DECLARE
  v_scale record;
BEGIN
  FOR v_scale IN
    SELECT id, code FROM public.ews_scales
    WHERE code LIKE 'pews%'
  LOOP
    INSERT INTO public.ews_parameters
      (scale_id, code, name_ru, unit,
       input_type, display_order)
    VALUES
      (v_scale.id, 'respiratory_rate',
        'Частота дыхания', 'уд/мин', 'integer', 1),
      (v_scale.id, 'spo2',
        'SpO2', '%', 'numeric', 2),
      (v_scale.id, 'heart_rate',
        'ЧСС', 'уд/мин', 'integer', 3),
      (v_scale.id, 'systolic_bp',
        'АД систолическое', 'мм рт.ст.', 'integer', 4),
      (v_scale.id, 'crt',
        'Время капиллярного наполнения', 'сек', 'numeric', 5),
      (v_scale.id, 'consciousness',
        'Сознание (AVPU)', '', 'enum', 6),
      (v_scale.id, 'temperature',
        'Температура', '°C', 'numeric', 7);
  END LOOP;
END $$;

-- ============================================================
-- 3. EWS THRESHOLDS
-- ============================================================
CREATE TABLE public.ews_thresholds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_id  uuid NOT NULL REFERENCES public.ews_parameters(id)
    ON DELETE CASCADE,
  min_value     numeric, -- NULL means no lower bound
  max_value     numeric, -- NULL means no upper bound
  text_value    text,    -- for enum params (air/o2, alert/confusion etc)
  score         integer NOT NULL CHECK (score IN (0,1,2,3)),
  color         text NOT NULL CHECK (color IN
    ('white','yellow','pink','red'))
);

-- Helper function to insert thresholds by parameter code+scale
CREATE OR REPLACE FUNCTION insert_ews_threshold(
  p_scale_code text,
  p_param_code text,
  p_min        numeric,
  p_max        numeric,
  p_text       text,
  p_score      integer,
  p_color      text
) RETURNS void AS $$
BEGIN
  INSERT INTO public.ews_thresholds
    (parameter_id, min_value, max_value,
     text_value, score, color)
  SELECT p.id, p_min, p_max, p_text, p_score, p_color
  FROM public.ews_parameters p
  JOIN public.ews_scales s ON s.id = p.scale_id
  WHERE s.code = p_scale_code
    AND p.code = p_param_code;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- NEWS2 THRESHOLDS
-- ============================================================

-- Respiratory Rate
SELECT insert_ews_threshold('news2','respiratory_rate', NULL,8,  NULL,3,'pink');
SELECT insert_ews_threshold('news2','respiratory_rate', 9,  11,  NULL,1,'yellow');
SELECT insert_ews_threshold('news2','respiratory_rate', 12, 20,  NULL,0,'white');
SELECT insert_ews_threshold('news2','respiratory_rate', 21, 24,  NULL,1,'yellow');
SELECT insert_ews_threshold('news2','respiratory_rate', 25, NULL,NULL,3,'pink');

-- SpO2 Scale 1
SELECT insert_ews_threshold('news2','spo2_scale1', NULL,91.9,NULL,3,'pink');
SELECT insert_ews_threshold('news2','spo2_scale1', 92,  93.9, NULL,2,'pink');
SELECT insert_ews_threshold('news2','spo2_scale1', 94,  95.9, NULL,1,'yellow');
SELECT insert_ews_threshold('news2','spo2_scale1', 96,  NULL, NULL,0,'white');

-- SpO2 Scale 2 (hypercapnic respiratory failure)
SELECT insert_ews_threshold('news2','spo2_scale2', NULL,83.9,NULL,3,'pink');
SELECT insert_ews_threshold('news2','spo2_scale2', 84,  85.9, NULL,2,'pink');
SELECT insert_ews_threshold('news2','spo2_scale2', 86,  87.9, NULL,1,'yellow');
SELECT insert_ews_threshold('news2','spo2_scale2', 88,  92.9, NULL,0,'white');
SELECT insert_ews_threshold('news2','spo2_scale2', 93,  94.9, NULL,1,'yellow');
SELECT insert_ews_threshold('news2','spo2_scale2', 95,  96.9, NULL,2,'pink');
SELECT insert_ews_threshold('news2','spo2_scale2', 97,  NULL, NULL,3,'pink');

-- Oxygen supplementation (enum)
SELECT insert_ews_threshold('news2','oxygen',NULL,NULL,'air',0,'white');
SELECT insert_ews_threshold('news2','oxygen',NULL,NULL,'o2', 2,'pink');

-- Systolic BP
SELECT insert_ews_threshold('news2','systolic_bp', NULL,90,  NULL,3,'pink');
SELECT insert_ews_threshold('news2','systolic_bp', 91,  100, NULL,2,'pink');
SELECT insert_ews_threshold('news2','systolic_bp', 101, 110, NULL,1,'yellow');
SELECT insert_ews_threshold('news2','systolic_bp', 111, 219, NULL,0,'white');
SELECT insert_ews_threshold('news2','systolic_bp', 220, NULL,NULL,3,'pink');

-- Pulse
SELECT insert_ews_threshold('news2','pulse', NULL,40,  NULL,3,'pink');
SELECT insert_ews_threshold('news2','pulse', 41,  50,  NULL,1,'yellow');
SELECT insert_ews_threshold('news2','pulse', 51,  90,  NULL,0,'white');
SELECT insert_ews_threshold('news2','pulse', 91,  110, NULL,1,'yellow');
SELECT insert_ews_threshold('news2','pulse', 111, 130, NULL,2,'pink');
SELECT insert_ews_threshold('news2','pulse', 131, NULL,NULL,3,'pink');

-- Consciousness (enum) — NEWS2
SELECT insert_ews_threshold('news2','consciousness',NULL,NULL,'alert',     0,'white');
SELECT insert_ews_threshold('news2','consciousness',NULL,NULL,'confusion', 3,'pink');
SELECT insert_ews_threshold('news2','consciousness',NULL,NULL,'voice',     3,'pink');
SELECT insert_ews_threshold('news2','consciousness',NULL,NULL,'pain',      3,'pink');
SELECT insert_ews_threshold('news2','consciousness',NULL,NULL,'unresponsive',3,'pink');

-- Temperature
SELECT insert_ews_threshold('news2','temperature', NULL,35.0, NULL,3,'pink');
SELECT insert_ews_threshold('news2','temperature', 35.1,36.0, NULL,1,'yellow');
SELECT insert_ews_threshold('news2','temperature', 36.1,38.0, NULL,0,'white');
SELECT insert_ews_threshold('news2','temperature', 38.1,39.0, NULL,1,'yellow');
SELECT insert_ews_threshold('news2','temperature', 39.1,NULL, NULL,2,'pink');

-- ============================================================
-- PEWS THRESHOLDS
-- ============================================================

-- 0-11 MONTHS
SELECT insert_ews_threshold('pews_0_11m','respiratory_rate',NULL,29, NULL,3,'pink');
SELECT insert_ews_threshold('pews_0_11m','respiratory_rate',30, 39,  NULL,1,'yellow');
SELECT insert_ews_threshold('pews_0_11m','respiratory_rate',40, 66,  NULL,0,'white');
SELECT insert_ews_threshold('pews_0_11m','respiratory_rate',67, NULL,NULL,3,'pink');

SELECT insert_ews_threshold('pews_0_11m','spo2',NULL,91.9,NULL,3,'pink');
SELECT insert_ews_threshold('pews_0_11m','spo2',92,  93.9,NULL,1,'yellow');
SELECT insert_ews_threshold('pews_0_11m','spo2',94,  NULL,NULL,0,'white');

SELECT insert_ews_threshold('pews_0_11m','heart_rate',NULL,99, NULL,3,'pink');
SELECT insert_ews_threshold('pews_0_11m','heart_rate',100,119, NULL,1,'yellow');
SELECT insert_ews_threshold('pews_0_11m','heart_rate',120,185, NULL,0,'white');
SELECT insert_ews_threshold('pews_0_11m','heart_rate',186,NULL,NULL,3,'pink');

SELECT insert_ews_threshold('pews_0_11m','systolic_bp',NULL,59, NULL,3,'pink');
SELECT insert_ews_threshold('pews_0_11m','systolic_bp',60,  79,  NULL,1,'yellow');
SELECT insert_ews_threshold('pews_0_11m','systolic_bp',80,  NULL,NULL,0,'white');

SELECT insert_ews_threshold('pews_0_11m','crt',NULL,1.9, NULL,0,'white');
SELECT insert_ews_threshold('pews_0_11m','crt',2.0, 4.0, NULL,1,'yellow');
SELECT insert_ews_threshold('pews_0_11m','crt',4.1, NULL,NULL,3,'pink');

SELECT insert_ews_threshold('pews_0_11m','consciousness',NULL,NULL,'alert',       0,'white');
SELECT insert_ews_threshold('pews_0_11m','consciousness',NULL,NULL,'voice',       0,'white');
SELECT insert_ews_threshold('pews_0_11m','consciousness',NULL,NULL,'pain',        3,'pink');
SELECT insert_ews_threshold('pews_0_11m','consciousness',NULL,NULL,'unresponsive',3,'pink');

SELECT insert_ews_threshold('pews_0_11m','temperature',NULL,35.0,NULL,3,'pink');
SELECT insert_ews_threshold('pews_0_11m','temperature',35.1,36.4,NULL,1,'yellow');
SELECT insert_ews_threshold('pews_0_11m','temperature',36.5,38.0,NULL,0,'white');
SELECT insert_ews_threshold('pews_0_11m','temperature',38.1,38.9,NULL,1,'yellow');
SELECT insert_ews_threshold('pews_0_11m','temperature',39.0,NULL,NULL,3,'pink');

-- 12-23 MONTHS
SELECT insert_ews_threshold('pews_12_23m','respiratory_rate',NULL,19, NULL,3,'pink');
SELECT insert_ews_threshold('pews_12_23m','respiratory_rate',20,  29,  NULL,1,'yellow');
SELECT insert_ews_threshold('pews_12_23m','respiratory_rate',30,  56,  NULL,0,'white');
SELECT insert_ews_threshold('pews_12_23m','respiratory_rate',57,  NULL,NULL,3,'pink');

SELECT insert_ews_threshold('pews_12_23m','spo2',NULL,91.9,NULL,3,'pink');
SELECT insert_ews_threshold('pews_12_23m','spo2',92,  93.9,NULL,1,'yellow');
SELECT insert_ews_threshold('pews_12_23m','spo2',94,  NULL,NULL,0,'white');

SELECT insert_ews_threshold('pews_12_23m','heart_rate',NULL,89, NULL,3,'pink');
SELECT insert_ews_threshold('pews_12_23m','heart_rate',90,  109, NULL,1,'yellow');
SELECT insert_ews_threshold('pews_12_23m','heart_rate',110, 185, NULL,0,'white');
SELECT insert_ews_threshold('pews_12_23m','heart_rate',186, NULL,NULL,3,'pink');

SELECT insert_ews_threshold('pews_12_23m','systolic_bp',NULL,69, NULL,3,'pink');
SELECT insert_ews_threshold('pews_12_23m','systolic_bp',70,  79,  NULL,1,'yellow');
SELECT insert_ews_threshold('pews_12_23m','systolic_bp',80,  NULL,NULL,0,'white');

SELECT insert_ews_threshold('pews_12_23m','crt',NULL,1.9, NULL,0,'white');
SELECT insert_ews_threshold('pews_12_23m','crt',2.0, 4.0, NULL,1,'yellow');
SELECT insert_ews_threshold('pews_12_23m','crt',4.1, NULL,NULL,3,'pink');

SELECT insert_ews_threshold('pews_12_23m','consciousness',NULL,NULL,'alert',       0,'white');
SELECT insert_ews_threshold('pews_12_23m','consciousness',NULL,NULL,'voice',       0,'white');
SELECT insert_ews_threshold('pews_12_23m','consciousness',NULL,NULL,'pain',        3,'pink');
SELECT insert_ews_threshold('pews_12_23m','consciousness',NULL,NULL,'unresponsive',3,'pink');

SELECT insert_ews_threshold('pews_12_23m','temperature',NULL,35.0,NULL,3,'pink');
SELECT insert_ews_threshold('pews_12_23m','temperature',35.1,36.4,NULL,1,'yellow');
SELECT insert_ews_threshold('pews_12_23m','temperature',36.5,38.0,NULL,0,'white');
SELECT insert_ews_threshold('pews_12_23m','temperature',38.1,38.9,NULL,1,'yellow');
SELECT insert_ews_threshold('pews_12_23m','temperature',39.0,NULL,NULL,3,'pink');

-- 2-4 YEARS
SELECT insert_ews_threshold('pews_2_4y','respiratory_rate',NULL,15, NULL,3,'pink');
SELECT insert_ews_threshold('pews_2_4y','respiratory_rate',16,  25,  NULL,1,'yellow');
SELECT insert_ews_threshold('pews_2_4y','respiratory_rate',26,  46,  NULL,0,'white');
SELECT insert_ews_threshold('pews_2_4y','respiratory_rate',47,  NULL,NULL,3,'pink');

SELECT insert_ews_threshold('pews_2_4y','spo2',NULL,91.9,NULL,3,'pink');
SELECT insert_ews_threshold('pews_2_4y','spo2',92,  93.9,NULL,1,'yellow');
SELECT insert_ews_threshold('pews_2_4y','spo2',94,  NULL,NULL,0,'white');

SELECT insert_ews_threshold('pews_2_4y','heart_rate',NULL,79, NULL,3,'pink');
SELECT insert_ews_threshold('pews_2_4y','heart_rate',80,  99,  NULL,1,'yellow');
SELECT insert_ews_threshold('pews_2_4y','heart_rate',100, 165, NULL,0,'white');
SELECT insert_ews_threshold('pews_2_4y','heart_rate',166, NULL,NULL,3,'pink');

SELECT insert_ews_threshold('pews_2_4y','systolic_bp',NULL,74, NULL,3,'pink');
SELECT insert_ews_threshold('pews_2_4y','systolic_bp',75,  84,  NULL,1,'yellow');
SELECT insert_ews_threshold('pews_2_4y','systolic_bp',85,  NULL,NULL,0,'white');

SELECT insert_ews_threshold('pews_2_4y','crt',NULL,1.9, NULL,0,'white');
SELECT insert_ews_threshold('pews_2_4y','crt',2.0, 4.0, NULL,1,'yellow');
SELECT insert_ews_threshold('pews_2_4y','crt',4.1, NULL,NULL,3,'pink');

SELECT insert_ews_threshold('pews_2_4y','consciousness',NULL,NULL,'alert',       0,'white');
SELECT insert_ews_threshold('pews_2_4y','consciousness',NULL,NULL,'voice',       0,'white');
SELECT insert_ews_threshold('pews_2_4y','consciousness',NULL,NULL,'pain',        3,'pink');
SELECT insert_ews_threshold('pews_2_4y','consciousness',NULL,NULL,'unresponsive',3,'pink');

SELECT insert_ews_threshold('pews_2_4y','temperature',NULL,35.0,NULL,3,'pink');
SELECT insert_ews_threshold('pews_2_4y','temperature',35.1,36.4,NULL,1,'yellow');
SELECT insert_ews_threshold('pews_2_4y','temperature',36.5,38.0,NULL,0,'white');
SELECT insert_ews_threshold('pews_2_4y','temperature',38.1,38.9,NULL,1,'yellow');
SELECT insert_ews_threshold('pews_2_4y','temperature',39.0,NULL,NULL,3,'pink');

-- 5-11 YEARS
SELECT insert_ews_threshold('pews_5_11y','respiratory_rate',NULL,11, NULL,3,'pink');
SELECT insert_ews_threshold('pews_5_11y','respiratory_rate',12,  19,  NULL,1,'yellow');
SELECT insert_ews_threshold('pews_5_11y','respiratory_rate',20,  35,  NULL,0,'white');
SELECT insert_ews_threshold('pews_5_11y','respiratory_rate',36,  NULL,NULL,3,'pink');

SELECT insert_ews_threshold('pews_5_11y','spo2',NULL,91.9,NULL,3,'pink');
SELECT insert_ews_threshold('pews_5_11y','spo2',92,  93.9,NULL,1,'yellow');
SELECT insert_ews_threshold('pews_5_11y','spo2',94,  NULL,NULL,0,'white');

SELECT insert_ews_threshold('pews_5_11y','heart_rate',NULL,59, NULL,3,'pink');
SELECT insert_ews_threshold('pews_5_11y','heart_rate',60,  79,  NULL,1,'yellow');
SELECT insert_ews_threshold('pews_5_11y','heart_rate',80,  146, NULL,0,'white');
SELECT insert_ews_threshold('pews_5_11y','heart_rate',147, NULL,NULL,3,'pink');

SELECT insert_ews_threshold('pews_5_11y','systolic_bp',NULL,79, NULL,3,'pink');
SELECT insert_ews_threshold('pews_5_11y','systolic_bp',80,  89,  NULL,1,'yellow');
SELECT insert_ews_threshold('pews_5_11y','systolic_bp',90,  NULL,NULL,0,'white');

SELECT insert_ews_threshold('pews_5_11y','crt',NULL,1.9, NULL,0,'white');
SELECT insert_ews_threshold('pews_5_11y','crt',2.0, 4.0, NULL,1,'yellow');
SELECT insert_ews_threshold('pews_5_11y','crt',4.1, NULL,NULL,3,'pink');

SELECT insert_ews_threshold('pews_5_11y','consciousness',NULL,NULL,'alert',       0,'white');
SELECT insert_ews_threshold('pews_5_11y','consciousness',NULL,NULL,'voice',       0,'white');
SELECT insert_ews_threshold('pews_5_11y','consciousness',NULL,NULL,'pain',        3,'pink');
SELECT insert_ews_threshold('pews_5_11y','consciousness',NULL,NULL,'unresponsive',3,'pink');

SELECT insert_ews_threshold('pews_5_11y','temperature',NULL,35.0,NULL,3,'pink');
SELECT insert_ews_threshold('pews_5_11y','temperature',35.1,36.4,NULL,1,'yellow');
SELECT insert_ews_threshold('pews_5_11y','temperature',36.5,38.0,NULL,0,'white');
SELECT insert_ews_threshold('pews_5_11y','temperature',38.1,38.9,NULL,1,'yellow');
SELECT insert_ews_threshold('pews_5_11y','temperature',39.0,NULL,NULL,3,'pink');

-- 12-16 YEARS
SELECT insert_ews_threshold('pews_12_16y','respiratory_rate',NULL,11, NULL,3,'pink');
SELECT insert_ews_threshold('pews_12_16y','respiratory_rate',12,  19,  NULL,1,'yellow');
SELECT insert_ews_threshold('pews_12_16y','respiratory_rate',20,  35,  NULL,0,'white');
SELECT insert_ews_threshold('pews_12_16y','respiratory_rate',36,  NULL,NULL,3,'pink');

SELECT insert_ews_threshold('pews_12_16y','spo2',NULL,91.9,NULL,3,'pink');
SELECT insert_ews_threshold('pews_12_16y','spo2',92,  93.9,NULL,1,'yellow');
SELECT insert_ews_threshold('pews_12_16y','spo2',94,  NULL,NULL,0,'white');

SELECT insert_ews_threshold('pews_12_16y','heart_rate',NULL,49, NULL,3,'pink');
SELECT insert_ews_threshold('pews_12_16y','heart_rate',50,  59,  NULL,1,'yellow');
SELECT insert_ews_threshold('pews_12_16y','heart_rate',60,  130, NULL,0,'white');
SELECT insert_ews_threshold('pews_12_16y','heart_rate',131, NULL,NULL,3,'pink');

SELECT insert_ews_threshold('pews_12_16y','systolic_bp',NULL,89, NULL,3,'pink');
SELECT insert_ews_threshold('pews_12_16y','systolic_bp',90,  99,  NULL,1,'yellow');
SELECT insert_ews_threshold('pews_12_16y','systolic_bp',100, NULL,NULL,0,'white');

SELECT insert_ews_threshold('pews_12_16y','crt',NULL,1.9, NULL,0,'white');
SELECT insert_ews_threshold('pews_12_16y','crt',2.0, 4.0, NULL,1,'yellow');
SELECT insert_ews_threshold('pews_12_16y','crt',4.1, NULL,NULL,3,'pink');

SELECT insert_ews_threshold('pews_12_16y','consciousness',NULL,NULL,'alert',       0,'white');
SELECT insert_ews_threshold('pews_12_16y','consciousness',NULL,NULL,'voice',       0,'white');
SELECT insert_ews_threshold('pews_12_16y','consciousness',NULL,NULL,'pain',        3,'pink');
SELECT insert_ews_threshold('pews_12_16y','consciousness',NULL,NULL,'unresponsive',3,'pink');

SELECT insert_ews_threshold('pews_12_16y','temperature',NULL,35.0,NULL,3,'pink');
SELECT insert_ews_threshold('pews_12_16y','temperature',35.1,36.4,NULL,1,'yellow');
SELECT insert_ews_threshold('pews_12_16y','temperature',36.5,38.0,NULL,0,'white');
SELECT insert_ews_threshold('pews_12_16y','temperature',38.1,38.9,NULL,1,'yellow');
SELECT insert_ews_threshold('pews_12_16y','temperature',39.0,NULL,NULL,3,'pink');

-- Drop helper function
DROP FUNCTION insert_ews_threshold;

-- ============================================================
-- 4. EWS READINGS
-- ============================================================
CREATE TABLE public.ews_readings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id         uuid NOT NULL REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  hospitalization_id  uuid NOT NULL REFERENCES public.hospitalizations(id)
    ON DELETE CASCADE,
  patient_id          uuid NOT NULL REFERENCES public.patients(id)
    ON DELETE CASCADE,
  scale_id            uuid NOT NULL REFERENCES public.ews_scales(id),
  total_score         integer NOT NULL DEFAULT 0,
  escalation_level    integer NOT NULL DEFAULT 0
    CHECK (escalation_level IN (0,1,2,3)),
  next_due_at         timestamptz NOT NULL,
  recorded_by         uuid REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  notes               text,
  is_voided           boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX ews_readings_hospitalization_idx
  ON public.ews_readings(hospitalization_id);
CREATE INDEX ews_readings_recorded_at_idx
  ON public.ews_readings(hospitalization_id, recorded_at DESC);

-- ============================================================
-- 5. EWS READING VALUES
-- ============================================================
CREATE TABLE public.ews_reading_values (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reading_id      uuid NOT NULL REFERENCES public.ews_readings(id)
    ON DELETE CASCADE,
  parameter_id    uuid NOT NULL REFERENCES public.ews_parameters(id),
  numeric_value   numeric,
  text_value      text,
  score           integer NOT NULL DEFAULT 0
    CHECK (score IN (0,1,2,3)),
  UNIQUE (reading_id, parameter_id)
);

CREATE INDEX ews_reading_values_reading_idx
  ON public.ews_reading_values(reading_id);

-- ============================================================
-- 6. EWS SCHEDULE (for Realtime blinking circle)
-- ============================================================
CREATE TABLE public.ews_schedule (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id         uuid NOT NULL REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  hospitalization_id  uuid NOT NULL REFERENCES public.hospitalizations(id)
    ON DELETE CASCADE,
  scale_id            uuid NOT NULL REFERENCES public.ews_scales(id),
  last_reading_id     uuid REFERENCES public.ews_readings(id)
    ON DELETE SET NULL,
  last_score          integer DEFAULT 0,
  next_due_at         timestamptz NOT NULL DEFAULT now(),
  is_active           boolean DEFAULT true,
  UNIQUE (hospitalization_id)
);

CREATE INDEX ews_schedule_hospital_idx
  ON public.ews_schedule(hospital_id);
CREATE INDEX ews_schedule_due_idx
  ON public.ews_schedule(hospital_id, next_due_at)
  WHERE is_active = true;

-- Enable Realtime for blinking circle
ALTER PUBLICATION supabase_realtime
  ADD TABLE public.ews_schedule;

-- ============================================================
-- 7. EWS PATIENT OVERRIDES (physician adjustments)
-- ============================================================
CREATE TABLE public.ews_patient_overrides (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id         uuid NOT NULL REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  hospitalization_id  uuid NOT NULL REFERENCES public.hospitalizations(id)
    ON DELETE CASCADE,
  patient_id          uuid NOT NULL REFERENCES public.patients(id)
    ON DELETE CASCADE,
  parameter_id        uuid NOT NULL REFERENCES public.ews_parameters(id),
  override_min        numeric,
  override_max        numeric,
  reason              text,
  overridden_by       uuid REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  overridden_at       timestamptz DEFAULT now(),
  is_active           boolean DEFAULT true,
  UNIQUE (hospitalization_id, parameter_id)
);

CREATE INDEX ews_patient_overrides_hosp_idx
  ON public.ews_patient_overrides(hospitalization_id);

-- ============================================================
-- 8. EWS DIAGNOSIS TRIGGERS (empty for now)
-- ============================================================
CREATE TABLE public.ews_diagnosis_triggers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  icd10_code      text NOT NULL,
  parameter_id    uuid NOT NULL REFERENCES public.ews_parameters(id)
    ON DELETE CASCADE,
  suggested_min   numeric,
  suggested_max   numeric,
  message_ru      text NOT NULL,
  is_active       boolean DEFAULT true,
  UNIQUE (icd10_code, parameter_id)
);

-- ============================================================
-- 9. BLOOD GLUCOSE READINGS
-- ============================================================
CREATE TABLE public.blood_glucose_readings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id         uuid NOT NULL REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  hospitalization_id  uuid NOT NULL REFERENCES public.hospitalizations(id)
    ON DELETE CASCADE,
  patient_id          uuid NOT NULL REFERENCES public.patients(id)
    ON DELETE CASCADE,
  value_mmol          numeric(5,2) NOT NULL
    CHECK (value_mmol BETWEEN 0 AND 50),
  recorded_by         uuid REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  notes               text,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX blood_glucose_hospitalization_idx
  ON public.blood_glucose_readings(hospitalization_id);
CREATE INDEX blood_glucose_recorded_at_idx
  ON public.blood_glucose_readings(hospitalization_id, recorded_at DESC);

-- ============================================================
-- 10. GCS READINGS
-- ============================================================
CREATE TABLE public.gcs_readings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id         uuid NOT NULL REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  hospitalization_id  uuid NOT NULL REFERENCES public.hospitalizations(id)
    ON DELETE CASCADE,
  patient_id          uuid NOT NULL REFERENCES public.patients(id)
    ON DELETE CASCADE,
  -- Eye opening: 1=None, 2=Pain, 3=Speech, 4=Spontaneous
  eye_response        integer NOT NULL CHECK (eye_response BETWEEN 1 AND 4),
  -- Verbal: 1=None, 2=Sounds, 3=Words, 4=Confused, 5=Oriented
  verbal_response     integer NOT NULL CHECK (verbal_response BETWEEN 1 AND 5),
  -- Motor: 1=None, 2=Extension, 3=Flexion, 4=Withdrawal, 5=Localizing, 6=Obeys
  motor_response      integer NOT NULL CHECK (motor_response BETWEEN 1 AND 6),
  total_score         integer GENERATED ALWAYS AS
    (eye_response + verbal_response + motor_response) STORED,
  recorded_by         uuid REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  notes               text,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX gcs_readings_hospitalization_idx
  ON public.gcs_readings(hospitalization_id);
CREATE INDEX gcs_readings_recorded_at_idx
  ON public.gcs_readings(hospitalization_id, recorded_at DESC);

-- ============================================================
-- 11. RLS POLICIES
-- ============================================================

-- EWS readings
ALTER TABLE public.ews_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ews_readings_select" ON public.ews_readings
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());
CREATE POLICY "ews_readings_insert" ON public.ews_readings
  FOR INSERT TO authenticated
  WITH CHECK (hospital_id = public.get_my_hospital_id());

-- EWS reading values
ALTER TABLE public.ews_reading_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ews_reading_values_select" ON public.ews_reading_values
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ews_readings r
    WHERE r.id = reading_id
      AND r.hospital_id = public.get_my_hospital_id()
  ));
CREATE POLICY "ews_reading_values_insert" ON public.ews_reading_values
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ews_readings r
    WHERE r.id = reading_id
      AND r.hospital_id = public.get_my_hospital_id()
  ));

-- EWS schedule
ALTER TABLE public.ews_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ews_schedule_select" ON public.ews_schedule
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());
CREATE POLICY "ews_schedule_all" ON public.ews_schedule
  FOR ALL TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

-- EWS patient overrides
ALTER TABLE public.ews_patient_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ews_overrides_select" ON public.ews_patient_overrides
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());
CREATE POLICY "ews_overrides_insert" ON public.ews_patient_overrides
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('documents.edit')
  );
CREATE POLICY "ews_overrides_update" ON public.ews_patient_overrides
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('documents.edit')
  );

-- EWS diagnosis triggers (read-only for all)
ALTER TABLE public.ews_diagnosis_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ews_diagnosis_triggers_select"
  ON public.ews_diagnosis_triggers
  FOR SELECT TO authenticated USING (true);

-- Blood glucose
ALTER TABLE public.blood_glucose_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blood_glucose_select" ON public.blood_glucose_readings
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());
CREATE POLICY "blood_glucose_insert" ON public.blood_glucose_readings
  FOR INSERT TO authenticated
  WITH CHECK (hospital_id = public.get_my_hospital_id());

-- GCS readings
ALTER TABLE public.gcs_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gcs_readings_select" ON public.gcs_readings
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());
CREATE POLICY "gcs_readings_insert" ON public.gcs_readings
  FOR INSERT TO authenticated
  WITH CHECK (hospital_id = public.get_my_hospital_id());

-- Read-only tables (no hospital_id filter needed)
ALTER TABLE public.ews_scales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ews_scales_select" ON public.ews_scales
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.ews_parameters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ews_parameters_select" ON public.ews_parameters
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.ews_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ews_thresholds_select" ON public.ews_thresholds
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 12. submit_ews_reading RPC

-- ============================================================
-- 12. submit_ews_reading RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_ews_reading(
  p_hospitalization_id  uuid,
  p_hospital_id         uuid,
  p_patient_id          uuid,
  p_scale_id            uuid,
  p_values              jsonb,
  p_notes               text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id       uuid;
  v_reading_id      uuid;
  v_total_score     integer := 0;
  v_max_single      integer := 0;
  v_escalation      integer := 0;
  v_next_due        timestamptz;
  v_param_score     integer;
  v_val             jsonb;
  v_override        record;
  v_param_min       numeric;
  v_param_max       numeric;
BEGIN
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Calculate score for each parameter value
  FOR v_val IN SELECT * FROM jsonb_array_elements(p_values)
  LOOP
    v_param_score := 0;

    -- Check if physician override exists
    SELECT * INTO v_override
    FROM public.ews_patient_overrides
    WHERE hospitalization_id = p_hospitalization_id
      AND parameter_id = (v_val->>'parameter_id')::uuid
      AND is_active = true;

    IF FOUND THEN
      -- Override only shifts the normal zone
      -- Values within override range = score 0
      -- Values outside = use standard thresholds
      IF (v_val->>'numeric_value') IS NOT NULL THEN
        v_param_min := v_override.override_min;
        v_param_max := v_override.override_max;
        IF (v_val->>'numeric_value')::numeric
           BETWEEN COALESCE(v_param_min, -999999)
           AND COALESCE(v_param_max, 999999) THEN
          v_param_score := 0;
        ELSE
          SELECT score INTO v_param_score
          FROM public.ews_thresholds
          WHERE parameter_id =
            (v_val->>'parameter_id')::uuid
            AND (min_value IS NULL OR
              (v_val->>'numeric_value')::numeric
              >= min_value)
            AND (max_value IS NULL OR
              (v_val->>'numeric_value')::numeric
              <= max_value)
          ORDER BY score DESC
          LIMIT 1;
        END IF;
      ELSIF (v_val->>'text_value') IS NOT NULL THEN
        SELECT score INTO v_param_score
        FROM public.ews_thresholds
        WHERE parameter_id =
          (v_val->>'parameter_id')::uuid
          AND text_value = (v_val->>'text_value')
        LIMIT 1;
      END IF;
    ELSE
      -- Standard thresholds
      IF (v_val->>'numeric_value') IS NOT NULL THEN
        SELECT score INTO v_param_score
        FROM public.ews_thresholds
        WHERE parameter_id =
          (v_val->>'parameter_id')::uuid
          AND (min_value IS NULL OR
            (v_val->>'numeric_value')::numeric
            >= min_value)
          AND (max_value IS NULL OR
            (v_val->>'numeric_value')::numeric
            <= max_value)
        ORDER BY score DESC
        LIMIT 1;
      ELSIF (v_val->>'text_value') IS NOT NULL THEN
        SELECT score INTO v_param_score
        FROM public.ews_thresholds
        WHERE parameter_id =
          (v_val->>'parameter_id')::uuid
          AND text_value = (v_val->>'text_value')
        LIMIT 1;
      END IF;
    END IF;

    v_param_score := COALESCE(v_param_score, 0);
    v_total_score := v_total_score + v_param_score;
    v_max_single  := GREATEST(v_max_single, v_param_score);
  END LOOP;

  -- Escalation level
  IF v_total_score = 0 THEN
    v_escalation := 0;
    v_next_due := now() + interval '12 hours';
  ELSIF v_total_score BETWEEN 1 AND 2 THEN
    v_escalation := 1;
    v_next_due := now() + interval '6 hours';
  ELSIF v_total_score BETWEEN 3 AND 6
     OR v_max_single >= 3 THEN
    v_escalation := 2;
    v_next_due := now() + interval '1 hour';
  ELSE
    v_escalation := 3;
    v_next_due := now() + interval '15 minutes';
  END IF;

  INSERT INTO public.ews_readings (
    hospital_id, hospitalization_id, patient_id,
    scale_id, total_score, escalation_level,
    next_due_at, recorded_by, notes
  ) VALUES (
    p_hospital_id, p_hospitalization_id, p_patient_id,
    p_scale_id, v_total_score, v_escalation,
    v_next_due, v_caller_id, p_notes
  )
  RETURNING id INTO v_reading_id;

  FOR v_val IN SELECT * FROM jsonb_array_elements(p_values)
  LOOP
    IF (v_val->>'numeric_value') IS NOT NULL THEN
      SELECT score INTO v_param_score
      FROM public.ews_thresholds
      WHERE parameter_id =
        (v_val->>'parameter_id')::uuid
        AND (min_value IS NULL OR
          (v_val->>'numeric_value')::numeric
          >= min_value)
        AND (max_value IS NULL OR
          (v_val->>'numeric_value')::numeric
          <= max_value)
      ORDER BY score DESC
      LIMIT 1;
    ELSIF (v_val->>'text_value') IS NOT NULL THEN
      SELECT score INTO v_param_score
      FROM public.ews_thresholds
      WHERE parameter_id =
        (v_val->>'parameter_id')::uuid
        AND text_value = (v_val->>'text_value')
      LIMIT 1;
    END IF;

    INSERT INTO public.ews_reading_values (
      reading_id, parameter_id,
      numeric_value, text_value, score
    ) VALUES (
      v_reading_id,
      (v_val->>'parameter_id')::uuid,
      (v_val->>'numeric_value')::numeric,
      v_val->>'text_value',
      COALESCE(v_param_score, 0)
    );
  END LOOP;

  INSERT INTO public.ews_schedule (
    hospital_id, hospitalization_id,
    scale_id, last_reading_id,
    last_score, next_due_at
  ) VALUES (
    p_hospital_id, p_hospitalization_id,
    p_scale_id, v_reading_id,
    v_total_score, v_next_due
  )
  ON CONFLICT (hospitalization_id)
  DO UPDATE SET
    last_reading_id = v_reading_id,
    last_score      = v_total_score,
    next_due_at     = v_next_due,
    is_active       = true;

  RETURN jsonb_build_object(
    'reading_id',       v_reading_id,
    'total_score',      v_total_score,
    'escalation_level', v_escalation,
    'next_due_at',      v_next_due
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'submit_ews_reading failed: %',
      SQLERRM;
END;
$$;
