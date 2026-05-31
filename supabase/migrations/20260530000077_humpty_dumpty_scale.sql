-- Migration 077: Humpty Dumpty Fall Risk Scale
-- Replaces Morse for paediatric patients (age < 18)
-- Same assessment framework, new seed data only

DO $$
DECLARE
  v_scale_id uuid;
  v_item_id  uuid;
BEGIN

  INSERT INTO public.assessment_scales
    (code, name_ru, description_ru,
     min_score, max_score, lower_is_worse)
  VALUES
    ('humpty_dumpty', 'Шкала Хамти Дамти',
     'Оценка риска падений для детей (до 18 лет)',
     7, 23, false)
  RETURNING id INTO v_scale_id;

  -- 1. Age (1-4)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'age',
     'Возраст',
     'Возраст пациента',
     1, 1, 4)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, '13 лет и старше', NULL, 1, 1),
    (v_item_id, '7–12 лет',        NULL, 2, 2),
    (v_item_id, '3–6 лет',         NULL, 3, 3),
    (v_item_id, 'До 3 лет',        NULL, 4, 4);

  -- 2. Gender (1-2)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'gender',
     'Пол',
     'Пол пациента',
     2, 1, 2)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Женский', NULL, 1, 1),
    (v_item_id, 'Мужской', NULL, 2, 2);

  -- 3. Diagnosis (1-4)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'diagnosis',
     'Диагноз',
     'Основной тип диагноза',
     3, 1, 4)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Психиатрический',
     'Психиатрическое расстройство', 1, 1),
    (v_item_id, 'Прочие',
     'Другие диагнозы', 2, 2),
    (v_item_id, 'Респираторный',
     'Заболевания органов дыхания', 3, 3),
    (v_item_id, 'Неврологический',
     'Неврологические заболевания', 4, 4);

  -- 4. Cognitive impairment (1-3)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'cognitive_impairment',
     'Когнитивные нарушения',
     'Осознание пациентом своих ограничений',
     4, 1, 3)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Норма',
     'Нормальное когнитивное состояние', 1, 1),
    (v_item_id, 'Забывает об ограничениях',
     'Периодически забывает о своих ограничениях', 2, 2),
    (v_item_id, 'Не осознаёт ограничений',
     'Не имеет представления о своих ограничениях', 3, 3);

  -- 5. Environmental factors (1-3)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'environmental_factors',
     'Факторы окружающей среды',
     'Условия окружающей среды и размещение пациента',
     5, 1, 3)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Амбулаторный пациент',
     'Пациент находится на амбулаторном лечении', 1, 1),
    (v_item_id, 'Пациент в постели',
     'Пациент размещён в постели', 2, 2),
    (v_item_id, 'Мебель / освещение',
     'Небезопасная мебель или неудовлетворительное освещение', 3, 3);

  -- 6. Response to surgery/sedation/anesthesia (1-4)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'surgery_sedation',
     'Реакция на операцию / седацию / анестезию',
     'Время с момента операции, седации или анестезии',
     6, 1, 4)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Более 48 часов',
     'Более 48 часов после операции/седации/анестезии', 1, 1),
    (v_item_id, '24–48 часов',
     'От 24 до 48 часов после операции/седации/анестезии', 2, 2),
    (v_item_id, 'Менее 24 часов',
     'Менее 24 часов после операции/седации/анестезии', 3, 3),
    (v_item_id, 'Не применимо',
     'Операции/седации/анестезии не было', 4, 4);

  -- 7. Medication usage (1 or 3)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'medication_usage',
     'Применение лекарственных препаратов',
     'Назначение седативных или аналогичных препаратов',
     7, 1, 3)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Прочие препараты / без препаратов',
     'Другие лекарства или лекарства не назначены', 1, 1),
    (v_item_id, 'Седативные / снотворные / барбитураты / фенотиазины',
     'Применяются седативные, снотворные, барбитураты или фенотиазины', 3, 2);

END $$;

-- Update submit_assessment RPC to add Humpty Dumpty risk levels
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
