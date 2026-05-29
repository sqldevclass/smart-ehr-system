-- Migration 074: Glasgow Coma Scale seed
-- Reuses assessment framework from migration 072
-- Auto-activates when AVPU = pain or unresponsive

DO $$
DECLARE
  v_scale_id uuid;
  v_item_id  uuid;
BEGIN

  INSERT INTO public.assessment_scales
    (code, name_ru, description_ru,
     min_score, max_score, lower_is_worse)
  VALUES
    ('gcs', 'Шкала комы Глазго',
     'Оценка уровня сознания (активируется при AVPU = P или U)',
     3, 15, true)
  RETURNING id INTO v_scale_id;

  -- 1. Eye Opening (1-4)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'eye_opening',
     'Открывание глаз',
     'Лучший ответ на открывание глаз',
     1, 1, 4)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Отсутствует',
     'Глаза не открываются ни при каких обстоятельствах',
     1, 1),
    (v_item_id, 'На боль',
     'Глаза открываются в ответ на болевой раздражитель',
     2, 2),
    (v_item_id, 'На голос',
     'Глаза открываются в ответ на голосовую команду',
     3, 3),
    (v_item_id, 'Самопроизвольно',
     'Глаза открываются самопроизвольно без внешних раздражителей',
     4, 4);

  -- 2. Verbal Response (1-5)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'verbal_response',
     'Словесный ответ',
     'Лучший словесный ответ',
     2, 1, 5)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Отсутствует',
     'Нет вербального ответа',
     1, 1),
    (v_item_id, 'Нечленораздельные звуки',
     'Стоны, нечленораздельные звуки без слов',
     2, 2),
    (v_item_id, 'Отдельные слова',
     'Произносит отдельные слова, не связанные в предложения',
     3, 3),
    (v_item_id, 'Спутанная речь',
     'Разговорная речь, но дезориентация во времени, месте или личности',
     4, 4),
    (v_item_id, 'Ориентирован',
     'Полная ориентация: знает своё имя, место нахождения, текущую дату',
     5, 5);

  -- 3. Motor Response (1-6)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'motor_response',
     'Двигательный ответ',
     'Лучший двигательный ответ',
     3, 1, 6)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Отсутствует',
     'Нет двигательного ответа на боль',
     1, 1),
    (v_item_id, 'Патологическое разгибание',
     'Разгибательная реакция на боль (децеребрационная ригидность)',
     2, 2),
    (v_item_id, 'Патологическое сгибание',
     'Сгибательная реакция на боль (декортикационная ригидность)',
     3, 3),
    (v_item_id, 'Отдёргивание',
     'Отдёргивание конечности от болевого раздражителя',
     4, 4),
    (v_item_id, 'Локализация боли',
     'Целенаправленное движение к источнику боли',
     5, 5),
    (v_item_id, 'Выполняет команды',
     'Выполняет словесные команды правильно',
     6, 6);

END $$;

-- Update submit_assessment RPC to add GCS risk levels
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
    RAISE EXCEPTION 'Scale not found: %', p_scale_id;
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

  ELSIF v_scale.code = 'gcs' THEN
    v_risk_level :=
      CASE
        WHEN v_total_score <= 8  THEN 'severe'
        WHEN v_total_score <= 12 THEN 'moderate'
        ELSE 'mild'
      END;
    -- GCS reassessed every 30 min for severe,
    -- every 1 hour for moderate,
    -- every 4 hours for mild
    v_next_at :=
      CASE
        WHEN v_total_score <= 8  THEN
          now() + interval '30 minutes'
        WHEN v_total_score <= 12 THEN
          now() + interval '1 hour'
        ELSE now() + interval '4 hours'
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
