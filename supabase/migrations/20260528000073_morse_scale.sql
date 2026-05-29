-- Migration 073: Morse Fall Risk Scale seed
-- Reuses assessment framework from migration 072
-- No new tables needed

-- ============================================================
-- 1. SEED — MORSE FALL RISK SCALE
-- ============================================================
DO $$
DECLARE
  v_scale_id uuid;
  v_item_id  uuid;
BEGIN

  INSERT INTO public.assessment_scales
    (code, name_ru, description_ru,
     min_score, max_score, lower_is_worse)
  VALUES
    ('morse', 'Шкала Морзе',
     'Оценка риска падений',
     0, 125, false)
  RETURNING id INTO v_scale_id;

  -- 1. History of falling
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'history_of_falling',
     'История падений',
     'Было ли падение в текущую госпитализацию или за последние 3 месяца',
     1, 0, 25)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Нет', NULL, 0, 1),
    (v_item_id, 'Да', NULL, 25, 2);

  -- 2. Secondary diagnosis
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'secondary_diagnosis',
     'Вторичный диагноз',
     'Более одного медицинского диагноза',
     2, 0, 15)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Нет', NULL, 0, 1),
    (v_item_id, 'Да', NULL, 15, 2);

  -- 3. Ambulatory aid
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'ambulatory_aid',
     'Вспомогательное средство при ходьбе',
     'Использование опоры при передвижении',
     3, 0, 30)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Нет / постельный режим / помощь медсестры',
     'Пациент не использует вспомогательных средств, находится на постельном режиме или передвигается с помощью медсестры',
     0, 1),
    (v_item_id, 'Костыли / трость / ходунки',
     'Пациент использует костыли, трость или ходунки',
     15, 2),
    (v_item_id, 'Опирается на мебель',
     'Пациент опирается на мебель при ходьбе',
     30, 3);

  -- 4. IV/Heparin lock
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'iv_heparin_lock',
     'Внутривенный катетер / гепариновый замок',
     'Наличие внутривенного катетера или гепаринового замка',
     4, 0, 20)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Нет', NULL, 0, 1),
    (v_item_id, 'Да', NULL, 20, 2);

  -- 5. Gait/transferring
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'gait',
     'Походка / пересадка',
     'Характеристика походки при передвижении',
     5, 0, 20)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Нормальная / постельный режим / обездвижен',
     'Пациент передвигается нормально, находится на постельном режиме или полностью обездвижен',
     0, 1),
    (v_item_id, 'Слабая',
     'Пациент сгорблен, но может поднять голову при ходьбе; делает короткие шаги; может нуждаться в помощи для пересадки',
     10, 2),
    (v_item_id, 'Нарушенная',
     'Пациент испытывает трудности при вставании со стула, тянется за опорой; голова опущена, смотрит в пол; нуждается в поддержке при ходьбе',
     20, 3);

  -- 6. Mental status
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'mental_status',
     'Психический статус',
     'Осознание пациентом своих физических возможностей',
     6, 0, 15)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Адекватная оценка своих возможностей',
     'Пациент реалистично оценивает свои физические возможности',
     0, 1),
    (v_item_id, 'Переоценивает возможности / забывает об ограничениях',
     'Пациент переоценивает свои физические возможности или забывает об имеющихся ограничениях',
     15, 2);

END $$;

-- ============================================================
-- 2. UPDATE submit_assessment RPC
--    Add Morse risk level logic
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

  -- Sum scores
  FOR v_resp IN
    SELECT * FROM jsonb_array_elements(p_responses)
  LOOP
    v_total_score := v_total_score +
      (v_resp->>'score')::integer;
  END LOOP;

  -- Risk level + reassessment schedule per scale
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

  ELSE
    v_risk_level := 'unknown';
    v_next_at := now() + interval '24 hours';
  END IF;

  -- Insert assessment
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

  -- Insert responses
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
