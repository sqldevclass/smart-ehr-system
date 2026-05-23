-- Migration 061: employees table
-- Generic employee record for ALL staff types
-- physicians, nurses, drivers, security, admin etc.
-- physicians table becomes a clinical extension of employees

CREATE TABLE public.employees (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id      uuid NOT NULL REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  profile_id       uuid REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  employee_number  text,
  first_name       text NOT NULL,
  last_name        text NOT NULL,
  middle_name      text,
  date_of_birth    date,
  gender           text CHECK (gender IN ('male', 'female')),
  address          text,
  phone            text,
  email            text,
  employed_since   date,
  department_id    uuid REFERENCES public.departments(id)
    ON DELETE SET NULL,
  job_title_id     uuid REFERENCES public.job_titles(id)
    ON DELETE SET NULL,
  staff_type_id    uuid REFERENCES public.staff_types(id)
    ON DELETE SET NULL,
  degree_id        uuid REFERENCES public.degrees(id)
    ON DELETE SET NULL,
  qualification_id uuid REFERENCES public.qualifications(id)
    ON DELETE SET NULL,
  is_active        boolean DEFAULT true,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (hospital_id, employee_number)
);

CREATE INDEX employees_hospital_idx
  ON public.employees(hospital_id);
CREATE INDEX employees_profile_idx
  ON public.employees(profile_id);
CREATE INDEX employees_department_idx
  ON public.employees(department_id);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_select" ON public.employees
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "employees_insert" ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('staff.manage')
  );

CREATE POLICY "employees_update" ON public.employees
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('staff.manage')
  );

CREATE POLICY "employees_delete" ON public.employees
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('staff.manage')
  );

-- ============================================================
-- Extend physicians table
-- Add employee_id, specialization_id, department_id
-- Keep all existing columns — zero breaking changes
-- ============================================================

ALTER TABLE public.physicians
  ADD COLUMN IF NOT EXISTS employee_id
    uuid REFERENCES public.employees(id)
    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS specialization_id
    uuid REFERENCES public.specializations(id)
    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id
    uuid REFERENCES public.departments(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS physicians_employee_idx
  ON public.physicians(employee_id);
CREATE INDEX IF NOT EXISTS physicians_department_idx
  ON public.physicians(department_id);

-- ============================================================
-- Data migration: create employee records for existing physicians
-- Links existing physicians to their new employee records
-- ============================================================
DO $$
DECLARE
  v_physician record;
  v_emp_id    uuid;
  v_counter   int := 1;
BEGIN
  FOR v_physician IN
    SELECT p.id, p.profile_id, p.hospital_id,
           p.specialization, p.job_position_id,
           pr.full_name, pr.phone
    FROM public.physicians p
    JOIN public.profiles pr ON pr.id = p.profile_id
    WHERE p.employee_id IS NULL
  LOOP
    -- Parse full_name into first/last
    INSERT INTO public.employees (
      hospital_id,
      profile_id,
      first_name,
      last_name,
      phone,
      employee_number,
      is_active
    ) VALUES (
      v_physician.hospital_id,
      v_physician.profile_id,
      SPLIT_PART(v_physician.full_name, ' ', 1),
      COALESCE(
        NULLIF(SPLIT_PART(v_physician.full_name, ' ', 2), ''),
        v_physician.full_name
      ),
      v_physician.phone,
      'EMP-' || LPAD(v_counter::text, 4, '0'),
      true
    )
    RETURNING id INTO v_emp_id;

    -- Link physician to employee
    UPDATE public.physicians
    SET employee_id = v_emp_id
    WHERE id = v_physician.id;

    v_counter := v_counter + 1;
  END LOOP;
END $$;

-- ============================================================
-- Add staff.manage permission to hr role
-- ============================================================
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.code = 'hr'
  AND p.code = 'staff.manage'
ON CONFLICT DO NOTHING;