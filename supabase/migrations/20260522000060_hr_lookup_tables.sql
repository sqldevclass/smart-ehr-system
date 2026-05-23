-- Migration 060: HR lookup tables
-- job_titles, staff_types, degrees, qualifications
-- Add code column to existing specializations
-- All hospital-scoped for multi-tenant isolation

-- ============================================================
-- 1. Add code column to existing specializations table
-- ============================================================
ALTER TABLE public.specializations
  ADD COLUMN IF NOT EXISTS code text;

-- Update unique constraint to include code
ALTER TABLE public.specializations
  DROP CONSTRAINT IF EXISTS specializations_hospital_id_name_key;

ALTER TABLE public.specializations
  ADD CONSTRAINT specializations_hospital_id_code_key
    UNIQUE (hospital_id, code);

-- ============================================================
-- 2. Job Titles (occupation e.g. Attending Physician, Resident)
-- ============================================================
CREATE TABLE public.job_titles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  name        text NOT NULL,
  code        text NOT NULL,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (hospital_id, code)
);

CREATE INDEX job_titles_hospital_idx
  ON public.job_titles(hospital_id);

ALTER TABLE public.job_titles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_titles_select" ON public.job_titles
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "job_titles_insert" ON public.job_titles
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

CREATE POLICY "job_titles_update" ON public.job_titles
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

CREATE POLICY "job_titles_delete" ON public.job_titles
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

-- ============================================================
-- 3. Staff Types (e.g. Full-time, Part-time, Contractor)
-- ============================================================
CREATE TABLE public.staff_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  name        text NOT NULL,
  code        text NOT NULL,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (hospital_id, code)
);

CREATE INDEX staff_types_hospital_idx
  ON public.staff_types(hospital_id);

ALTER TABLE public.staff_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_types_select" ON public.staff_types
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "staff_types_insert" ON public.staff_types
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

CREATE POLICY "staff_types_update" ON public.staff_types
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

CREATE POLICY "staff_types_delete" ON public.staff_types
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

-- ============================================================
-- 4. Degrees (e.g. MD, PhD, Resident)
-- ============================================================
CREATE TABLE public.degrees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  name        text NOT NULL,
  code        text NOT NULL,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (hospital_id, code)
);

CREATE INDEX degrees_hospital_idx
  ON public.degrees(hospital_id);

ALTER TABLE public.degrees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "degrees_select" ON public.degrees
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "degrees_insert" ON public.degrees
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

CREATE POLICY "degrees_update" ON public.degrees
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

CREATE POLICY "degrees_delete" ON public.degrees
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

-- ============================================================
-- 5. Qualifications (e.g. First Category, Highest Category)
-- ============================================================
CREATE TABLE public.qualifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  name        text NOT NULL,
  code        text NOT NULL,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (hospital_id, code)
);

CREATE INDEX qualifications_hospital_idx
  ON public.qualifications(hospital_id);

ALTER TABLE public.qualifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qualifications_select" ON public.qualifications
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "qualifications_insert" ON public.qualifications
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

CREATE POLICY "qualifications_update" ON public.qualifications
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

CREATE POLICY "qualifications_delete" ON public.qualifications
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

-- ============================================================
-- 6. Seed common values for Kaiser Test
-- ============================================================
DO $$
DECLARE
  v_hospital_id uuid := 'cf74311c-1827-4066-9376-f9270815c339';
BEGIN
  -- Specializations
  INSERT INTO public.specializations
    (hospital_id, name, code) VALUES
    (v_hospital_id, 'Кардиология', 'cardiology'),
    (v_hospital_id, 'Хирургия', 'surgery'),
    (v_hospital_id, 'Неврология', 'neurology'),
    (v_hospital_id, 'Ортопедия', 'orthopedics'),
    (v_hospital_id, 'Урология', 'urology'),
    (v_hospital_id, 'Гинекология', 'gynecology'),
    (v_hospital_id, 'Педиатрия', 'pediatrics'),
    (v_hospital_id, 'Анестезиология', 'anesthesiology'),
    (v_hospital_id, 'Радиология', 'radiology'),
    (v_hospital_id, 'Терапия', 'therapy'),
    (v_hospital_id, 'Гастроэнтерология', 'gastroenterology'),
    (v_hospital_id, 'Эндокринология', 'endocrinology'),
    (v_hospital_id, 'Офтальмология', 'ophthalmology'),
    (v_hospital_id, 'Оториноларингология', 'ent'),
    (v_hospital_id, 'Дерматология', 'dermatology')
  ON CONFLICT (hospital_id, code) DO NOTHING;

  -- Job Titles
  INSERT INTO public.job_titles
    (hospital_id, name, code) VALUES
    (v_hospital_id, 'Врач', 'physician'),
    (v_hospital_id, 'Главный врач', 'chief_physician'),
    (v_hospital_id, 'Заведующий отделением', 'dept_head'),
    (v_hospital_id, 'Медицинская сестра', 'nurse'),
    (v_hospital_id, 'Старшая медсестра', 'head_nurse'),
    (v_hospital_id, 'Лаборант', 'lab_technician'),
    (v_hospital_id, 'Анестезист', 'anesthesia_nurse'),
    (v_hospital_id, 'Регистратор', 'registrar'),
    (v_hospital_id, 'Администратор', 'administrator'),
    (v_hospital_id, 'Бухгалтер', 'accountant'),
    (v_hospital_id, 'Охранник', 'security'),
    (v_hospital_id, 'Водитель', 'driver'),
    (v_hospital_id, 'Уборщик', 'cleaner')
  ON CONFLICT (hospital_id, code) DO NOTHING;

  -- Staff Types
  INSERT INTO public.staff_types
    (hospital_id, name, code) VALUES
    (v_hospital_id, 'Штатный', 'full_time'),
    (v_hospital_id, 'Совместитель', 'part_time'),
    (v_hospital_id, 'Контрактный', 'contractor'),
    (v_hospital_id, 'Стажёр', 'intern'),
    (v_hospital_id, 'Волонтёр', 'volunteer')
  ON CONFLICT (hospital_id, code) DO NOTHING;

  -- Degrees
  INSERT INTO public.degrees
    (hospital_id, name, code) VALUES
    (v_hospital_id, 'Высшее медицинское', 'medical_degree'),
    (v_hospital_id, 'Кандидат медицинских наук', 'phd'),
    (v_hospital_id, 'Доктор медицинских наук', 'doctor_of_science'),
    (v_hospital_id, 'Резидент', 'resident'),
    (v_hospital_id, 'Интерн', 'intern'),
    (v_hospital_id, 'Среднее специальное', 'secondary_special')
  ON CONFLICT (hospital_id, code) DO NOTHING;

  -- Qualifications
  INSERT INTO public.qualifications
    (hospital_id, name, code) VALUES
    (v_hospital_id, 'Высшая категория', 'highest'),
    (v_hospital_id, 'Первая категория', 'first'),
    (v_hospital_id, 'Вторая категория', 'second'),
    (v_hospital_id, 'Без категории', 'none')
  ON CONFLICT (hospital_id, code) DO NOTHING;

END $$;