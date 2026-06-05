-- Migration 098: Create employments table
-- employments is the employment history record for a person.
-- Replaces the employment fields in employees.
-- employees table is kept intact for now — dropped in migration 102.

-- ============================================================
-- 1. Create employments table
-- ============================================================

CREATE TABLE public.employments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id          uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  hospital_id        uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  employee_number    text,
  job_title_id       uuid REFERENCES public.job_titles(id) ON DELETE SET NULL,
  department_id      uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  staff_type_id      uuid REFERENCES public.staff_types(id) ON DELETE SET NULL,
  degree_id          uuid REFERENCES public.degrees(id) ON DELETE SET NULL,
  qualification_id   uuid REFERENCES public.qualifications(id) ON DELETE SET NULL,
  employment_status  public.employment_status NOT NULL DEFAULT 'active',
  is_active          boolean GENERATED ALWAYS AS (employment_status = 'active') STORED,
  employed_since     date,
  status_changed_at  timestamptz,
  status_changed_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz DEFAULT now(),
  UNIQUE (hospital_id, employee_number)
);

CREATE INDEX employments_person_idx      ON public.employments(person_id);
CREATE INDEX employments_hospital_idx    ON public.employments(hospital_id);
CREATE INDEX employments_department_idx  ON public.employments(department_id);
CREATE INDEX employments_status_idx      ON public.employments(hospital_id, employment_status);

-- RLS
ALTER TABLE public.employments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employments_select" ON public.employments
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "employments_insert" ON public.employments
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('staff.manage')
  );

CREATE POLICY "employments_update" ON public.employments
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('staff.manage')
  );

CREATE POLICY "employments_delete" ON public.employments
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('staff.manage')
  );

-- ============================================================
-- 2. Migrate employment data from employees → employments
-- ============================================================

INSERT INTO public.employments (
  person_id,
  hospital_id,
  employee_number,
  job_title_id,
  department_id,
  staff_type_id,
  degree_id,
  qualification_id,
  employment_status,
  employed_since,
  status_changed_at,
  status_changed_by,
  created_at
)
SELECT
  e.person_id,
  e.hospital_id,
  e.employee_number,
  e.job_title_id,
  e.department_id,
  e.staff_type_id,
  e.degree_id,
  e.qualification_id,
  e.employment_status,
  e.employed_since,
  e.status_changed_at,
  e.status_changed_by,
  e.created_at
FROM public.employees e
WHERE e.person_id IS NOT NULL;

-- ============================================================
-- 3. Add employment_id back-reference on employees for migration safety
-- ============================================================

ALTER TABLE public.employees
  ADD COLUMN employment_id uuid REFERENCES public.employments(id) ON DELETE SET NULL;

UPDATE public.employees e
SET employment_id = em.id
FROM public.employments em
WHERE em.person_id = e.person_id
  AND em.hospital_id = e.hospital_id;

-- ============================================================
-- 4. Update staff_invitations to reference person_id
--    Keep employee_id for now — dropped in migration 102
-- ============================================================

ALTER TABLE public.staff_invitations
  ADD COLUMN person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL;

UPDATE public.staff_invitations si
SET person_id = e.person_id
FROM public.employees e
WHERE e.id = si.employee_id
  AND e.person_id IS NOT NULL;

CREATE INDEX staff_invitations_person_idx
  ON public.staff_invitations(person_id);

-- Partial unique index: only one pending invite per person per hospital
CREATE UNIQUE INDEX staff_invitations_pending_person_unique
  ON public.staff_invitations(hospital_id, person_id)
  WHERE status = 'pending' AND person_id IS NOT NULL;
