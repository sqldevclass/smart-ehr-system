-- Migration 078: Pain Scales + Optional Forms Framework
-- Tables: pain_scale_readings, hospitalization_active_forms
-- Adds: is_optional to assessment_scales
-- Seeds: NRS, Faces, CPOT

-- ============================================================
-- 1. ADD is_optional TO assessment_scales
-- ============================================================
ALTER TABLE public.assessment_scales
  ADD COLUMN IF NOT EXISTS is_optional
    boolean DEFAULT false;

-- Mark existing scales as non-optional
UPDATE public.assessment_scales
SET is_optional = false;

-- ============================================================
-- 2. PAIN SCALE READINGS (NRS + Faces)
-- Simple numeric entry, not assessment framework
-- ============================================================
CREATE TABLE public.pain_scale_readings (
  id                  uuid PRIMARY KEY
    DEFAULT gen_random_uuid(),
  hospital_id         uuid NOT NULL
    REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  hospitalization_id  uuid NOT NULL
    REFERENCES public.hospitalizations(id)
    ON DELETE CASCADE,
  patient_id          uuid NOT NULL
    REFERENCES public.patients(id)
    ON DELETE CASCADE,
  scale_type          text NOT NULL
    CHECK (scale_type IN ('nrs', 'faces')),
  score               integer NOT NULL
    CHECK (score BETWEEN 0 AND 10),
  recorded_by         uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  recorded_at         timestamptz NOT NULL
    DEFAULT now(),
  notes               text,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX pain_scale_readings_hosp_idx
  ON public.pain_scale_readings(hospitalization_id);
CREATE INDEX pain_scale_readings_recorded_at_idx
  ON public.pain_scale_readings(
    hospitalization_id, recorded_at DESC);

ALTER TABLE public.pain_scale_readings
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pain_scale_readings_select"
  ON public.pain_scale_readings
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "pain_scale_readings_insert"
  ON public.pain_scale_readings
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id());

-- ============================================================
-- 3. HOSPITALIZATION ACTIVE FORMS
-- Tracks which optional assessment forms are
-- activated per hospitalization
-- ============================================================
CREATE TABLE public.hospitalization_active_forms (
  id                  uuid PRIMARY KEY
    DEFAULT gen_random_uuid(),
  hospital_id         uuid NOT NULL
    REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  hospitalization_id  uuid NOT NULL
    REFERENCES public.hospitalizations(id)
    ON DELETE CASCADE,
  scale_code          text NOT NULL,
  activated_by        uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  activated_at        timestamptz DEFAULT now(),
  UNIQUE (hospitalization_id, scale_code)
);

CREATE INDEX hosp_active_forms_hosp_idx
  ON public.hospitalization_active_forms(
    hospitalization_id);

ALTER TABLE public.hospitalization_active_forms
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hosp_active_forms_select"
  ON public.hospitalization_active_forms
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "hosp_active_forms_insert"
  ON public.hospitalization_active_forms
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id());

-- ============================================================
-- 4. SEED CPOT (optional assessment scale)
-- ============================================================
DO $$
DECLARE
  v_scale_id  uuid;
  v_item_id   uuid;
BEGIN

  INSERT INTO public.assessment_scales
    (code, name_ru, description_ru,
     min_score, max_score,
     lower_is_worse, is_optional)
  VALUES
    ('cpot',
     'CPOT — Шкала боли для невербальных пациентов',
     'Critical-Care Pain Observation Tool. Применяется для пациентов, которые не могут самостоятельно сообщить о боли.',
     0, 8, false, true)
  RETURNING id INTO v_scale_id;

  -- 1. Facial expressions (0-2)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'facial_expression',
     'Выражение лица',
     'Оценить наличие мышечного напряжения лица',
     1, 0, 2)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id,
     'Расслабленное, нейтральное',
     'Напряжение мышц не наблюдается',
     0, 1),
    (v_item_id,
     'Напряженное',
     'Пациент хмурится, опускает бровь, напрягает глазные орбиты или любые другие изменения лица',
     1, 2),
    (v_item_id,
     'Гримасы',
     'Все предыдущие изменения плюс крепко закрытые веки (возможно открыт рот или пациент покусывает эндотрахеальную трубку)',
     2, 3);

  -- 2. Body movements (0-2)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'body_movements',
     'Движения тела',
     'Оценить характер движений пациента',
     2, 0, 2)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id,
     'Отсутствие движений / нормальное положение',
     'Не двигается или движения не направлены на участок боли',
     0, 1),
    (v_item_id,
     'Защитные движения',
     'Медленные, осторожные движения, касается или трет участок боли, пытается привлечь внимание движениями',
     1, 2),
    (v_item_id,
     'Беспокойство / возбуждение',
     'Пытается вытащить трубку, сесть, двигает конечностями, не следует командам, борется с персоналом',
     2, 3);

  -- 3. Ventilator compliance — intubated (0-2)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'ventilator_compliance',
     'Толерантность к ИВЛ (интубированные пациенты)',
     'Только для интубированных пациентов',
     3, 0, 2)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id,
     'Толерантен к ИВЛ',
     'Сигналы на мониторах не активированы, лёгкое дыхание',
     0, 1),
    (v_item_id,
     'Кашляет, но толерантен',
     'Кашляет, сигналы на мониторе активируются, но спонтанно отключаются',
     1, 2),
    (v_item_id,
     'Борется с ИВЛ',
     'Асинхрония: блокирует вентиляцию, сигналы часто активированы',
     2, 3);

  -- 4. Vocalization — non-intubated (0-2)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'vocalization',
     'Издавание звуков (неинтубированные пациенты)',
     'Только для неинтубированных пациентов',
     4, 0, 2)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id,
     'Нормальные звуки / тишина',
     'Разговор нормального тона или нет звука',
     0, 1),
    (v_item_id,
     'Вздыхает, стонет',
     'Издаёт стоны или вздохи',
     1, 2),
    (v_item_id,
     'Кричит, рыдает',
     'Кричит или рыдает',
     2, 3);

  -- 5. Muscle tension (0-2)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'muscle_tension',
     'Напряжение мышц',
     'Оценка при пассивном сгибании/разгибании верхних конечностей в покое',
     5, 0, 2)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id,
     'Расслаблены',
     'Не сопротивляется пассивным движениям',
     0, 1),
    (v_item_id,
     'Напряжены, ригидны',
     'Сопротивляется пассивным движениям',
     1, 2),
    (v_item_id,
     'Очень напряжены / очень ригидны',
     'Сильно сопротивляется пассивным движениям, невозможно завершить движения',
     2, 3);

END $$;

-- ============================================================
-- 5. UPDATE submit_assessment RPC — add CPOT risk levels
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_assessment(
  p_hospitalization_id  uuid,
  p_hospital_id         uuid,
  p_patient_id          uuid,
  p_scale_id            uuid,
  p_responses           jsonb,
  p_notes               text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id       uuid;
  v_assessment_id   uuid;
  v_total_score     integer := 0;
  v_risk_level      text;
  v_scale           record;
  v_next_at         timestamptz;
  v_resp            jsonb;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_scale
  FROM public.assessment_scales
  WHERE id = p_scale_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scale not found: %',
      p_scale_id;
  END IF;

  FOR v_resp IN
    SELECT * FROM jsonb_array_elements(p_responses)
  LOOP
    v_total_score := v_total_score +
      (v_resp->>'score')::integer;
  END LOOP;

  IF v_scale.code = 'braden' THEN
    v_risk_level :=
      CASE
        WHEN v_total_score <= 9  THEN 'very_high'
        WHEN v_total_score <= 12 THEN 'high'
        WHEN v_total_score <= 14 THEN 'moderate'
        WHEN v_total_score <= 18 THEN 'mild'
        ELSE 'none'
      END;
    v_next_at :=
      CASE
        WHEN v_total_score <= 9  THEN
          now() + interval '24 hours'
        WHEN v_total_score <= 12 THEN
          now() + interval '48 hours'
        WHEN v_total_score <= 14 THEN
          now() + interval '72 hours'
        ELSE now() + interval '7 days'
      END;

  ELSIF v_scale.code = 'morse' THEN
    v_risk_level :=
      CASE
        WHEN v_total_score >= 51 THEN 'high'
        WHEN v_total_score >= 25 THEN 'low'
        ELSE 'none'
      END;
    v_next_at :=
      CASE
        WHEN v_total_score >= 51 THEN
          now() + interval '24 hours'
        WHEN v_total_score >= 25 THEN
          now() + interval '48 hours'
        ELSE now() + interval '7 days'
      END;

  ELSIF v_scale.code = 'humpty_dumpty' THEN
    v_risk_level :=
      CASE
        WHEN v_total_score >= 12 THEN 'high'
        ELSE 'low'
      END;
    v_next_at :=
      CASE
        WHEN v_total_score >= 12 THEN
          now() + interval '24 hours'
        ELSE now() + interval '48 hours'
      END;

  ELSIF v_scale.code = 'gcs' THEN
    v_risk_level :=
      CASE
        WHEN v_total_score <= 8  THEN 'severe'
        WHEN v_total_score <= 12 THEN 'moderate'
        ELSE 'mild'
      END;
    v_next_at :=
      CASE
        WHEN v_total_score <= 8  THEN
          now() + interval '30 minutes'
        WHEN v_total_score <= 12 THEN
          now() + interval '1 hour'
        ELSE now() + interval '4 hours'
      END;

  ELSIF v_scale.code = 'cpot' THEN
    v_risk_level :=
      CASE
        WHEN v_total_score >= 6 THEN 'severe'
        WHEN v_total_score >= 2 THEN 'moderate'
        ELSE 'none'
      END;
    -- Reassess every 4h at rest, more often
    -- during procedures (handled by nurse)
    v_next_at :=
      CASE
        WHEN v_total_score >= 6 THEN
          now() + interval '2 hours'
        WHEN v_total_score >= 2 THEN
          now() + interval '4 hours'
        ELSE now() + interval '12 hours'
      END;

  ELSE
    v_risk_level := 'unknown';
    v_next_at := now() + interval '24 hours';
  END IF;

  INSERT INTO public.patient_assessments (
    hospital_id, hospitalization_id, patient_id,
    scale_id, total_score, risk_level,
    assessed_by, next_assessment_at, notes
  ) VALUES (
    p_hospital_id, p_hospitalization_id,
    p_patient_id, p_scale_id, v_total_score,
    v_risk_level, v_caller_id, v_next_at, p_notes
  )
  RETURNING id INTO v_assessment_id;

  FOR v_resp IN
    SELECT * FROM jsonb_array_elements(p_responses)
  LOOP
    INSERT INTO public.patient_assessment_responses
      (assessment_id, item_id, option_id, score)
    VALUES (
      v_assessment_id,
      (v_resp->>'item_id')::uuid,
      (v_resp->>'option_id')::uuid,
      (v_resp->>'score')::integer
    );
  END LOOP;

  RETURN jsonb_build_object(
    'assessment_id', v_assessment_id,
    'total_score',   v_total_score,
    'risk_level',    v_risk_level,
    'next_at',       v_next_at
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION
      'submit_assessment failed: %', SQLERRM;
END;
$$;
