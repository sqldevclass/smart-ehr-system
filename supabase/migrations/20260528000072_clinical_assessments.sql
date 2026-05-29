-- Migration 072: Clinical Assessment Framework + Braden Scale
-- Generic framework supports Braden, Morse, and future scales
-- All via same tables — no new tables per scale

-- ============================================================
-- 1. ASSESSMENT SCALES
-- ============================================================
CREATE TABLE public.assessment_scales (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name_ru     text NOT NULL,
  description_ru text,
  min_score   integer NOT NULL,
  max_score   integer NOT NULL,
  lower_is_worse boolean DEFAULT true,
  -- true = lower score = higher risk (Braden, Morse)
  -- false = higher score = higher risk (pain)
  is_active   boolean DEFAULT true
);

ALTER TABLE public.assessment_scales
  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assessment_scales_select"
  ON public.assessment_scales
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 2. ASSESSMENT SCALE ITEMS
-- ============================================================
CREATE TABLE public.assessment_scale_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scale_id      uuid NOT NULL REFERENCES
    public.assessment_scales(id) ON DELETE CASCADE,
  code          text NOT NULL,
  name_ru       text NOT NULL,
  description_ru text,
  display_order integer NOT NULL DEFAULT 0,
  min_score     integer NOT NULL,
  max_score     integer NOT NULL,
  UNIQUE (scale_id, code)
);

ALTER TABLE public.assessment_scale_items
  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assessment_scale_items_select"
  ON public.assessment_scale_items
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 3. ASSESSMENT SCALE ITEM OPTIONS
-- ============================================================
CREATE TABLE public.assessment_scale_item_options (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       uuid NOT NULL REFERENCES
    public.assessment_scale_items(id)
    ON DELETE CASCADE,
  label_ru      text NOT NULL,
  description_ru text,
  score         integer NOT NULL,
  display_order integer NOT NULL DEFAULT 0
);

ALTER TABLE public.assessment_scale_item_options
  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assessment_scale_item_options_select"
  ON public.assessment_scale_item_options
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 4. PATIENT ASSESSMENTS
-- ============================================================
CREATE TABLE public.patient_assessments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id         uuid NOT NULL REFERENCES
    public.hospitals(id) ON DELETE CASCADE,
  hospitalization_id  uuid NOT NULL REFERENCES
    public.hospitalizations(id) ON DELETE CASCADE,
  patient_id          uuid NOT NULL REFERENCES
    public.patients(id) ON DELETE CASCADE,
  scale_id            uuid NOT NULL REFERENCES
    public.assessment_scales(id),
  total_score         integer NOT NULL,
  risk_level          text NOT NULL,
  assessed_by         uuid REFERENCES
    public.profiles(id) ON DELETE SET NULL,
  assessed_at         timestamptz NOT NULL DEFAULT now(),
  next_assessment_at  timestamptz,
  notes               text,
  is_voided           boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX patient_assessments_hospitalization_idx
  ON public.patient_assessments(hospitalization_id);
CREATE INDEX patient_assessments_scale_idx
  ON public.patient_assessments(hospitalization_id, scale_id);
CREATE INDEX patient_assessments_assessed_at_idx
  ON public.patient_assessments(hospitalization_id, assessed_at DESC);

ALTER TABLE public.patient_assessments
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_assessments_select"
  ON public.patient_assessments
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "patient_assessments_insert"
  ON public.patient_assessments
  FOR INSERT TO authenticated
  WITH CHECK (hospital_id = public.get_my_hospital_id());

-- ============================================================
-- 5. PATIENT ASSESSMENT RESPONSES
-- ============================================================
CREATE TABLE public.patient_assessment_responses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES
    public.patient_assessments(id) ON DELETE CASCADE,
  item_id       uuid NOT NULL REFERENCES
    public.assessment_scale_items(id),
  option_id     uuid NOT NULL REFERENCES
    public.assessment_scale_item_options(id),
  score         integer NOT NULL,
  UNIQUE (assessment_id, item_id)
);

CREATE INDEX patient_assessment_responses_assessment_idx
  ON public.patient_assessment_responses(assessment_id);

ALTER TABLE public.patient_assessment_responses
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_assessment_responses_select"
  ON public.patient_assessment_responses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patient_assessments pa
    WHERE pa.id = assessment_id
      AND pa.hospital_id = public.get_my_hospital_id()
  ));

CREATE POLICY "patient_assessment_responses_insert"
  ON public.patient_assessment_responses
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.patient_assessments pa
    WHERE pa.id = assessment_id
      AND pa.hospital_id = public.get_my_hospital_id()
  ));

-- ============================================================
-- 6. SEED — BRADEN SCALE
-- ============================================================
DO $$
DECLARE
  v_scale_id uuid;
  v_item_id  uuid;
BEGIN

  -- Insert scale
  INSERT INTO public.assessment_scales
    (code, name_ru, description_ru,
     min_score, max_score, lower_is_worse)
  VALUES
    ('braden', 'Шкала Брадена',
     'Оценка риска развития пролежней',
     6, 23, true)
  RETURNING id INTO v_scale_id;

  -- 1. Sensory Perception (1-4)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'sensory_perception',
     'Сенсорное восприятие',
     'Способность реагировать на дискомфорт, связанный с давлением',
     1, 1, 4)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Полностью ограничено',
     'Нет реакции на болевые раздражители из-за снижения уровня сознания или седации; ограниченная способность чувствовать боль на большей части поверхности тела',
     1, 1),
    (v_item_id, 'Значительно ограничено',
     'Реагирует только на болевые раздражители; не может сообщить о дискомфорте, кроме как стоном или беспокойством; нарушение чувствительности ограничивает ощущение боли или дискомфорта на 1/2 поверхности тела',
     2, 2),
    (v_item_id, 'Незначительно ограничено',
     'Реагирует на словесные команды, но не всегда может сообщить о дискомфорте или необходимости переворачивания; нарушение чувствительности на 1-2 конечностях',
     3, 3),
    (v_item_id, 'Не нарушено',
     'Реагирует на словесные команды; нет нарушений чувствительности, которые ограничивали бы способность чувствовать или сообщать о боли или дискомфорте',
     4, 4);

  -- 2. Moisture (1-4)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'moisture',
     'Влажность',
     'Степень воздействия влаги на кожу',
     2, 1, 4)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Постоянно влажная',
     'Кожа почти постоянно влажная из-за пота, мочи и т.д. Влажность обнаруживается при каждом перемещении пациента',
     1, 1),
    (v_item_id, 'Очень влажная',
     'Кожа часто, но не всегда влажная. Постельное бельё необходимо менять не реже 1 раза в смену',
     2, 2),
    (v_item_id, 'Иногда влажная',
     'Кожа иногда влажная, требует дополнительной смены постельного белья примерно раз в день',
     3, 3),
    (v_item_id, 'Редко влажная',
     'Кожа обычно сухая; постельное бельё требует замены только в обычные сроки',
     4, 4);

  -- 3. Activity (1-4)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'activity',
     'Активность',
     'Степень физической активности',
     3, 1, 4)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Лежачий',
     'Прикован к постели',
     1, 1),
    (v_item_id, 'Сидячий',
     'Способность ходить крайне ограничена или отсутствует. Не может выдержать собственный вес и/или нуждается в помощи при перемещении в кресло или инвалидную коляску',
     2, 2),
    (v_item_id, 'Иногда ходит',
     'Иногда ходит в течение дня, но на очень короткие расстояния с помощью или без. Большую часть смены проводит в постели или кресле',
     3, 3),
    (v_item_id, 'Часто ходит',
     'Ходит за пределы палаты не менее 2 раз в день и по палате не реже 1 раза в 2 часа в период бодрствования',
     4, 4);

  -- 4. Mobility (1-4)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'mobility',
     'Подвижность',
     'Способность изменять и контролировать положение тела',
     4, 1, 4)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Полностью обездвижен',
     'Не совершает даже незначительных движений туловищем или конечностями без посторонней помощи',
     1, 1),
    (v_item_id, 'Сильно ограничен',
     'Иногда совершает незначительные изменения положения тела или конечностей, но не способен самостоятельно совершать частые или значительные движения',
     2, 2),
    (v_item_id, 'Незначительно ограничен',
     'Часто совершает незначительные изменения положения тела или конечностей самостоятельно',
     3, 3),
    (v_item_id, 'Не ограничен',
     'Совершает основные и частые изменения положения без посторонней помощи',
     4, 4);

  -- 5. Nutrition (1-4)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'nutrition',
     'Питание',
     'Обычный режим приёма пищи',
     5, 1, 4)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Очень плохое',
     'Никогда не съедает полную порцию. Редко съедает более 1/3 предложенной еды. Ежедневно потребляет 2 порции белка или меньше. Плохо пьёт жидкость. Не принимает пищевые добавки. Или получает ничего перорально и/или только прозрачные жидкости, или внутривенные вливания более 5 дней',
     1, 1),
    (v_item_id, 'Вероятно недостаточное',
     'Редко съедает полную порцию и обычно съедает только около 1/2 предложенной еды. Потребление белка включает только 3 порции мяса или молочных продуктов в день. Иногда принимает пищевые добавки. Или получает меньше оптимального количества при зондовом питании или питании через ТПП',
     2, 2),
    (v_item_id, 'Достаточное',
     'Съедает более половины большинства блюд. Потребляет 4 порции белка (мясо, молочные продукты) в день. Иногда отказывается от еды, но обычно принимает пищевые добавки, если предлагают. Или получает зондовое или ТПП питание, покрывающее большую часть потребностей в питании',
     3, 3),
    (v_item_id, 'Отличное',
     'Съедает большую часть каждого блюда. Никогда не отказывается от еды. Обычно съедает 4 или более порции мяса и молочных продуктов. Иногда ест между приёмами пищи. Не нуждается в пищевых добавках',
     4, 4);

  -- 6. Friction & Shear (1-3)
  INSERT INTO public.assessment_scale_items
    (scale_id, code, name_ru, description_ru,
     display_order, min_score, max_score)
  VALUES
    (v_scale_id, 'friction_shear',
     'Трение и смещение',
     'Степень трения и сдвига при движении',
     6, 1, 3)
  RETURNING id INTO v_item_id;

  INSERT INTO public.assessment_scale_item_options
    (item_id, label_ru, description_ru,
     score, display_order)
  VALUES
    (v_item_id, 'Проблема',
     'Нуждается в умеренной или максимальной помощи при перемещении. Невозможно поднять полностью без скольжения по простыням. Часто сползает в постели или кресле, нуждается в частом переворачивании с максимальной помощью. Спастичность, контрактуры или возбуждение приводят к почти постоянному трению',
     1, 1),
    (v_item_id, 'Потенциальная проблема',
     'Двигается вяло или нуждается в минимальной помощи. Во время движения кожа до некоторой степени скользит по простыням, стулу, фиксаторам или другим устройствам. Большую часть времени поддерживает относительно хорошее положение в кресле или постели, но иногда сползает вниз',
     2, 2),
    (v_item_id, 'Нет видимой проблемы',
     'Движется самостоятельно в постели и кресле и обладает достаточной мышечной силой, чтобы полностью подняться во время движения. Всегда поддерживает хорошее положение в постели или кресле',
     3, 3);

END $$;

-- ============================================================
-- 7. submit_assessment RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_assessment(
  p_hospitalization_id  uuid,
  p_hospital_id         uuid,
  p_patient_id          uuid,
  p_scale_id            uuid,
  p_responses           jsonb,
  -- [{item_id, option_id, score}]
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

  -- Get scale info
  SELECT * INTO v_scale
  FROM public.assessment_scales
  WHERE id = p_scale_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scale not found: %', p_scale_id;
  END IF;

  -- Sum scores from responses
  FOR v_resp IN
    SELECT * FROM jsonb_array_elements(p_responses)
  LOOP
    v_total_score := v_total_score +
      (v_resp->>'score')::integer;
  END LOOP;

  -- Determine risk level (Braden-specific logic)
  -- Generic: scale code determines risk labels
  IF v_scale.code = 'braden' THEN
    v_risk_level :=
      CASE
        WHEN v_total_score <= 9  THEN 'very_high'
        WHEN v_total_score <= 12 THEN 'high'
        WHEN v_total_score <= 14 THEN 'moderate'
        WHEN v_total_score <= 18 THEN 'mild'
        ELSE 'none'
      END;
    -- Next assessment schedule
    v_next_at :=
      CASE
        WHEN v_total_score <= 9  THEN now() + interval '24 hours'
        WHEN v_total_score <= 12 THEN now() + interval '48 hours'
        WHEN v_total_score <= 14 THEN now() + interval '72 hours'
        ELSE now() + interval '7 days'
      END;
  ELSE
    -- Default for future scales
    v_risk_level := 'unknown';
    v_next_at := now() + interval '24 hours';
  END IF;

  -- Insert assessment
  INSERT INTO public.patient_assessments (
    hospital_id, hospitalization_id, patient_id,
    scale_id, total_score, risk_level,
    assessed_by, next_assessment_at, notes
  ) VALUES (
    p_hospital_id, p_hospitalization_id, p_patient_id,
    p_scale_id, v_total_score, v_risk_level,
    v_caller_id, v_next_at, p_notes
  )
  RETURNING id INTO v_assessment_id;

  -- Insert responses
  FOR v_resp IN
    SELECT * FROM jsonb_array_elements(p_responses)
  LOOP
    INSERT INTO public.patient_assessment_responses (
      assessment_id, item_id, option_id, score
    ) VALUES (
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
    RAISE EXCEPTION 'submit_assessment failed: %', SQLERRM;
END;
$$;
