-- Migration 149: Device Monitoring Framework
-- Generic, lookup-driven periodic checklist forms for invasive devices.
-- Mirrors the assessment_scales definitions/data split (migration 072),
-- adapted for fixed-interval yes/no checklists instead of scored assessments.
--
-- First 4 device types (Form МЦБП 5.1, v2, AKFA Medline, approved 2022):
--   cvc            - Мониторинг центрального венозного катетера (every 3 days)
--   tracheostomy   - Мониторинг трахеостомы (every 3 days)
--   ventilator     - Мониторинг пациента на ИВЛ (daily)
--   urinary_catheter - Мониторинг мочевого катетера (daily)
--
-- Adding a 5th device form later = seed data insert, not a migration.

-- ============================================================
-- 1. DEFINITIONS (lookup, mostly global — nullable hospital_id
--    lets a hospital add a custom device type/criteria later,
--    same pattern as document_types)
-- ============================================================
CREATE TABLE public.device_monitoring_types (
  id                      uuid PRIMARY KEY
    DEFAULT gen_random_uuid(),
  hospital_id             uuid
    REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  code                    text NOT NULL,
  name_ru                 text NOT NULL,
  monitoring_interval_days integer NOT NULL DEFAULT 1,
  requires_removal_date   boolean NOT NULL DEFAULT true,
  requires_site           boolean NOT NULL DEFAULT false,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz DEFAULT now()
);

-- code is unique per hospital scope (or globally, when hospital_id IS NULL)
CREATE UNIQUE INDEX device_monitoring_types_code_uidx
  ON public.device_monitoring_types (
    code, COALESCE(hospital_id, '00000000-0000-0000-0000-000000000000')
  );

CREATE INDEX device_monitoring_types_hospital_idx
  ON public.device_monitoring_types(hospital_id);

CREATE TABLE public.device_monitoring_criteria (
  id                      uuid PRIMARY KEY
    DEFAULT gen_random_uuid(),
  hospital_id             uuid
    REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  device_type_id          uuid NOT NULL
    REFERENCES public.device_monitoring_types(id)
    ON DELETE CASCADE,
  code                    text NOT NULL,
  display_order           integer NOT NULL,
  label_ru                text NOT NULL,
  response_type           text NOT NULL DEFAULT 'boolean'
    CHECK (response_type IN ('boolean', 'boolean_with_note')),
  requires_escalation     boolean NOT NULL DEFAULT false,
  escalation_message      text,
  created_at              timestamptz DEFAULT now()
);

CREATE INDEX device_monitoring_criteria_type_idx
  ON public.device_monitoring_criteria(device_type_id, display_order);

CREATE INDEX device_monitoring_criteria_hospital_idx
  ON public.device_monitoring_criteria(hospital_id);

-- ============================================================
-- 2. INSTANCE — one row per physical device on a patient.
--    Necessary because a patient can have >1 concurrent device
--    of the same type (e.g. two lines), each with its own
--    lifecycle and due-date clock.
-- ============================================================
CREATE TABLE public.patient_device_monitors (
  id                      uuid PRIMARY KEY
    DEFAULT gen_random_uuid(),
  hospital_id             uuid NOT NULL
    REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  hospitalization_id      uuid NOT NULL
    REFERENCES public.hospitalizations(id)
    ON DELETE CASCADE,
  patient_id              uuid NOT NULL
    REFERENCES public.patients(id)
    ON DELETE CASCADE,
  device_type_id          uuid NOT NULL
    REFERENCES public.device_monitoring_types(id),

  -- e.g. "яремная вена" for CVC. NULL when requires_site = false.
  site                    text,

  inserted_at             date NOT NULL,
  removed_at              date,

  next_due_at             timestamptz,

  created_by              uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  created_at              timestamptz DEFAULT now()
);

CREATE INDEX patient_device_monitors_hospitalization_idx
  ON public.patient_device_monitors(hospitalization_id);

CREATE INDEX patient_device_monitors_patient_idx
  ON public.patient_device_monitors(patient_id);

-- Partial index for "which devices are still in and due" panels
CREATE INDEX patient_device_monitors_active_idx
  ON public.patient_device_monitors(hospitalization_id, next_due_at)
  WHERE removed_at IS NULL;

-- ============================================================
-- 3. ENTRIES — one row per periodic checklist submission,
--    one child row per criterion answered.
-- ============================================================
CREATE TABLE public.device_monitoring_entries (
  id                      uuid PRIMARY KEY
    DEFAULT gen_random_uuid(),
  hospital_id             uuid NOT NULL
    REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  monitor_id              uuid NOT NULL
    REFERENCES public.patient_device_monitors(id)
    ON DELETE CASCADE,

  recorded_by             uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  recorded_at             timestamptz NOT NULL DEFAULT now(),
  notes                   text,

  -- Second sign-off, distinct from recorded_by. No role
  -- constraint yet — 'epidemiologist' is not a defined
  -- staff_role/job_position in this system as of this
  -- migration. TODO(backlog): once an epidemiologist role
  -- exists, add
  --   CHECK verified_by resolves to a staff member holding
  --   that role
  -- here. Until then this is any authenticated profile and
  -- is enforced only as a client-side warning in the UI.
  verified_by             uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  verified_at             timestamptz,

  created_at              timestamptz DEFAULT now()
);

CREATE INDEX device_monitoring_entries_monitor_idx
  ON public.device_monitoring_entries(monitor_id, recorded_at DESC);

CREATE TABLE public.device_monitoring_entry_responses (
  id                      uuid PRIMARY KEY
    DEFAULT gen_random_uuid(),
  entry_id                uuid NOT NULL
    REFERENCES public.device_monitoring_entries(id)
    ON DELETE CASCADE,
  criterion_id            uuid NOT NULL
    REFERENCES public.device_monitoring_criteria(id),
  answer                  boolean NOT NULL,
  note                    text,

  UNIQUE (entry_id, criterion_id)
);

CREATE INDEX device_monitoring_entry_responses_entry_idx
  ON public.device_monitoring_entry_responses(entry_id);

-- ============================================================
-- 4. RLS
-- ============================================================
ALTER TABLE public.device_monitoring_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_monitoring_criteria    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_device_monitors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_monitoring_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_monitoring_entry_responses ENABLE ROW LEVEL SECURITY;

-- Definitions: readable if global (NULL) or own hospital's custom row.
-- No INSERT/UPDATE/DELETE policy — writes are migration/seed only,
-- same as document_types and assessment_scales.
CREATE POLICY "device_monitoring_types_select"
  ON public.device_monitoring_types
  FOR SELECT TO authenticated
  USING (hospital_id IS NULL OR hospital_id = public.get_my_hospital_id());

CREATE POLICY "device_monitoring_criteria_select"
  ON public.device_monitoring_criteria
  FOR SELECT TO authenticated
  USING (hospital_id IS NULL OR hospital_id = public.get_my_hospital_id());

-- Instance + entry data: standard tenant-scoped read/write.
CREATE POLICY "patient_device_monitors_select"
  ON public.patient_device_monitors
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "patient_device_monitors_insert"
  ON public.patient_device_monitors
  FOR INSERT TO authenticated
  WITH CHECK (hospital_id = public.get_my_hospital_id());

CREATE POLICY "patient_device_monitors_update"
  ON public.patient_device_monitors
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (hospital_id = public.get_my_hospital_id());

CREATE POLICY "device_monitoring_entries_select"
  ON public.device_monitoring_entries
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "device_monitoring_entries_insert"
  ON public.device_monitoring_entries
  FOR INSERT TO authenticated
  WITH CHECK (hospital_id = public.get_my_hospital_id());

-- Responses inherit hospital scope through their parent entry.
CREATE POLICY "device_monitoring_entry_responses_select"
  ON public.device_monitoring_entry_responses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.device_monitoring_entries e
      WHERE e.id = entry_id
        AND e.hospital_id = public.get_my_hospital_id()
    )
  );

CREATE POLICY "device_monitoring_entry_responses_insert"
  ON public.device_monitoring_entry_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.device_monitoring_entries e
      WHERE e.id = entry_id
        AND e.hospital_id = public.get_my_hospital_id()
    )
  );

-- ============================================================
-- 5. SUBMIT ENTRY RPC — atomic insert of entry + responses,
--    computes next_due_at, escalates flagged criteria into
--    the existing clinical_alerts framework.
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_device_monitoring_entry(
  p_monitor_id    uuid,
  p_hospital_id   uuid,
  p_responses     jsonb,
  -- [{criterion_id, answer, note}]
  p_notes         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id     uuid;
  v_entry_id      uuid;
  v_monitor       record;
  v_device_type   record;
  v_resp          jsonb;
  v_criterion     record;
  v_next_due      timestamptz;
  v_alert_id      uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_monitor
  FROM public.patient_device_monitors
  WHERE id = p_monitor_id
    AND hospital_id = p_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device monitor not found: %', p_monitor_id;
  END IF;

  SELECT * INTO v_device_type
  FROM public.device_monitoring_types
  WHERE id = v_monitor.device_type_id;

  v_next_due := now() + (v_device_type.monitoring_interval_days || ' days')::interval;

  -- Insert entry
  INSERT INTO public.device_monitoring_entries (
    hospital_id, monitor_id, recorded_by, notes
  ) VALUES (
    p_hospital_id, p_monitor_id, v_caller_id, p_notes
  )
  RETURNING id INTO v_entry_id;

  -- Insert responses, escalate as needed
  FOR v_resp IN
    SELECT * FROM jsonb_array_elements(p_responses)
  LOOP
    SELECT * INTO v_criterion
    FROM public.device_monitoring_criteria
    WHERE id = (v_resp->>'criterion_id')::uuid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Criterion not found: %', v_resp->>'criterion_id';
    END IF;

    INSERT INTO public.device_monitoring_entry_responses (
      entry_id, criterion_id, answer, note
    ) VALUES (
      v_entry_id,
      v_criterion.id,
      (v_resp->>'answer')::boolean,
      v_resp->>'note'
    );

    -- Escalation: criterion flagged AND answered true (i.e. a
    -- positive finding, such as pain/redness at a CVC site)
    IF v_criterion.requires_escalation
       AND (v_resp->>'answer')::boolean = true THEN
      INSERT INTO public.clinical_alerts (
        hospital_id, hospitalization_id, patient_id,
        alert_type, trigger_signs
      ) VALUES (
        p_hospital_id, v_monitor.hospitalization_id, v_monitor.patient_id,
        'device_monitoring_escalation',
        jsonb_build_array(
          jsonb_build_object(
            'criterion_code', v_criterion.code,
            'label', v_criterion.label_ru,
            'message', v_criterion.escalation_message
          )
        )
      )
      RETURNING id INTO v_alert_id;
    END IF;
  END LOOP;

  -- Advance the device's due-date clock
  UPDATE public.patient_device_monitors
  SET next_due_at = v_next_due
  WHERE id = p_monitor_id;

  RETURN jsonb_build_object(
    'entry_id',  v_entry_id,
    'next_due_at', v_next_due,
    'alert_id',  v_alert_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'submit_device_monitoring_entry failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 6. SEED DATA — verbatim to Form МЦБП 5.1, v2 (approved 2022).
--    Numbering intentionally matches the source documents,
--    including the urinary catheter form's gap (skips #6).
-- ============================================================

-- --- CVC -----------------------------------------------------
WITH t AS (
  INSERT INTO public.device_monitoring_types
    (code, name_ru, monitoring_interval_days, requires_removal_date, requires_site)
  VALUES
    ('cvc', 'Мониторинг центрального венозного катетера', 3, true, true)
  RETURNING id
)
INSERT INTO public.device_monitoring_criteria
  (device_type_id, code, display_order, label_ru, response_type, requires_escalation, escalation_message)
SELECT t.id, v.code, v.display_order, v.label_ru, v.response_type, v.requires_escalation, v.escalation_message
FROM t, (VALUES
  ('cvc_1', 1, 'Необходимость ЦВК обоснована, есть необходимость в ЦВК. Отметка в дневнике врача', 'boolean', false, NULL),
  ('cvc_2', 2, 'Обработка рук антисептиком производится каждый раз (до и после) контакта с ЦВК (при использовании)', 'boolean', false, NULL),
  ('cvc_3', 3, 'Место пункции (кожа) и наружная часть катетера (хаб, порт) обрабатывается 70% спиртом (или 2% раствором хлоргексидина) при каждом доступе, при каждом использовании', 'boolean', false, NULL),
  ('cvc_4', 4, 'Повязка над ЦВК была заменена в последние 5 суток. Кожа вокруг ЦВК была обработана антисептиком (спирт или хлоргексидин) перед заменой повязки', 'boolean', false, NULL),
  ('cvc_5', 5, 'Имеются ли боль, покраснение, отечность кожи в области ЦВК?', 'boolean', true, 'Сообщить в службу инфекционного контроля')
) AS v(code, display_order, label_ru, response_type, requires_escalation, escalation_message);

-- --- Tracheostomy ---------------------------------------------
WITH t AS (
  INSERT INTO public.device_monitoring_types
    (code, name_ru, monitoring_interval_days, requires_removal_date, requires_site)
  VALUES
    ('tracheostomy', 'Мониторинг трахеостомы', 3, true, false)
  RETURNING id
)
INSERT INTO public.device_monitoring_criteria
  (device_type_id, code, display_order, label_ru, response_type, requires_escalation, escalation_message)
SELECT t.id, v.code, v.display_order, v.label_ru, v.response_type, v.requires_escalation, v.escalation_message
FROM t, (VALUES
  ('trach_1', 1, 'Проверка нужна ли трахеостома у данного пациента проведена врачом (обоснованность нахождения)', 'boolean', false, NULL),
  ('trach_2', 2, 'Трахеостома закреплена должным образом', 'boolean', false, NULL),
  ('trach_3', 3, 'Кожа вокруг трахеостомы чистая, края раны не отечны и не гиперемированы', 'boolean', false, NULL),
  ('trach_4', 4, 'Трахеостома регулярно промывается изотоническим раствором', 'boolean', false, NULL),
  ('trach_5', 5, 'Кожа вокруг трахеостомы обработана антисептиком (спирт или хлоргексидин)', 'boolean', false, NULL),
  ('trach_6', 6, 'Вокруг трахеостомы на кожу наложена асептическая повязка', 'boolean', false, NULL),
  ('trach_7', 7, 'В случае признаков воспаления вокруг трахеостомы, взят мазок на бакпосев (отметить в какой день)', 'boolean_with_note', false, NULL)
) AS v(code, display_order, label_ru, response_type, requires_escalation, escalation_message);

-- --- Ventilator (ИВЛ) -------------------------------------------
WITH t AS (
  INSERT INTO public.device_monitoring_types
    (code, name_ru, monitoring_interval_days, requires_removal_date, requires_site)
  VALUES
    ('ventilator', 'Мониторинг пациента на ИВЛ', 1, true, false)
  RETURNING id
)
INSERT INTO public.device_monitoring_criteria
  (device_type_id, code, display_order, label_ru, response_type, requires_escalation, escalation_message)
SELECT t.id, v.code, v.display_order, v.label_ru, v.response_type, v.requires_escalation, v.escalation_message
FROM t, (VALUES
  ('ivl_1', 1, 'Головной конец кровати поднят под углом 30-45 градусов (если нет противопоказаний)', 'boolean', false, NULL),
  ('ivl_2', 2, 'Ежедневно проводится временное отключение седативных препаратов', 'boolean', false, NULL),
  ('ivl_3', 3, 'Ежедневно проверяется готовность к экстубации', 'boolean', false, NULL),
  ('ivl_4', 4, 'Пациенту на ИВЛ проводится инфузия H2-гистаминоблокатора или ингибитора протонной помпы (если нет противопоказаний)', 'boolean', false, NULL),
  ('ivl_5', 5, 'Ежедневно ротовая полость обрабатывается раствором Хлоргексидина (0,05-0,12%)', 'boolean', false, NULL),
  -- Linked conceptually to the existing Braden scale (assessment_scales.code = 'braden'),
  -- not a duplicate score field here.
  ('ivl_6', 6, 'Выполняется профилактика пролежней (+ оценка по шкале Брадена)', 'boolean', false, NULL),
  ('ivl_7', 7, 'Профилактика тромбоза глубоких вен выполняется', 'boolean', false, NULL)
) AS v(code, display_order, label_ru, response_type, requires_escalation, escalation_message);

-- --- Urinary catheter -------------------------------------------
-- NOTE: source form numbers criteria 1,2,3,4,5,7 — #6 does not
-- exist in the approved document. Seeded verbatim.
WITH t AS (
  INSERT INTO public.device_monitoring_types
    (code, name_ru, monitoring_interval_days, requires_removal_date, requires_site)
  VALUES
    ('urinary_catheter', 'Мониторинг мочевого катетера', 1, true, false)
  RETURNING id
)
INSERT INTO public.device_monitoring_criteria
  (device_type_id, code, display_order, label_ru, response_type, requires_escalation, escalation_message)
SELECT t.id, v.code, v.display_order, v.label_ru, v.response_type, v.requires_escalation, v.escalation_message
FROM t, (VALUES
  ('uc_1', 1, 'Мочевой катетер необходим для данного пациента?', 'boolean', false, NULL),
  ('uc_2', 2, 'Катетер закреплен должным образом к пациенту', 'boolean', false, NULL),
  ('uc_3', 3, 'Моча беспрепятственно вытекает из катетера в мешок?', 'boolean', false, NULL),
  ('uc_4', 4, 'Мешок для сбора ниже уровня мочевого пузыря?', 'boolean', false, NULL),
  ('uc_5', 5, 'Мешок и трубка на некотором удалении от пола (не касаются пола)?', 'boolean', false, NULL),
  ('uc_7', 7, 'Мочеприемник регулярно опорожняется', 'boolean', false, NULL)
) AS v(code, display_order, label_ru, response_type, requires_escalation, escalation_message);
