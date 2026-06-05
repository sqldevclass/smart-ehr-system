-- Migration 097: Create persons table
-- persons is the single source of truth for human identity.
-- Replaces the identity fields in employees.
-- profiles gets a person_id FK — one person can have one system account.

-- ============================================================
-- 1. Create persons table
-- ============================================================

CREATE TABLE public.persons (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id      uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  first_name       text NOT NULL,
  last_name        text NOT NULL,
  middle_name      text,
  date_of_birth    date,
  gender           text CHECK (gender IN ('male', 'female')),
  phone            text,
  email            text,
  address          text,
  national_id      text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX persons_hospital_idx ON public.persons(hospital_id);
CREATE INDEX persons_email_idx    ON public.persons(hospital_id, email);

-- RLS
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "persons_select" ON public.persons
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "persons_insert" ON public.persons
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('staff.manage')
  );

CREATE POLICY "persons_update" ON public.persons
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('staff.manage')
  );

CREATE POLICY "persons_delete" ON public.persons
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('staff.manage')
  );

-- ============================================================
-- 2. Migrate identity data from employees → persons
-- ============================================================

INSERT INTO public.persons (
  id,
  hospital_id,
  first_name,
  last_name,
  middle_name,
  date_of_birth,
  gender,
  phone,
  email,
  address,
  created_at
)
SELECT
  gen_random_uuid(),
  hospital_id,
  first_name,
  last_name,
  middle_name,
  date_of_birth,
  gender,
  phone,
  email,
  address,
  created_at
FROM public.employees;

-- ============================================================
-- 3. Add person_id to employees for cross-reference during migration
-- ============================================================

ALTER TABLE public.employees
  ADD COLUMN person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL;

-- Link employees to their persons row by matching on identity fields
-- within the same hospital
UPDATE public.employees e
SET person_id = p.id
FROM public.persons p
WHERE p.hospital_id = e.hospital_id
  AND p.first_name  = e.first_name
  AND p.last_name   = e.last_name
  AND (p.email = e.email OR (p.email IS NULL AND e.email IS NULL))
  AND (p.date_of_birth = e.date_of_birth OR (p.date_of_birth IS NULL AND e.date_of_birth IS NULL));

CREATE INDEX employees_person_idx ON public.employees(person_id);

-- ============================================================
-- 4. Add person_id to profiles
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL;

-- Link profiles to persons via employees.profile_id
UPDATE public.profiles pr
SET person_id = e.person_id
FROM public.employees e
WHERE e.profile_id = pr.id
  AND e.person_id IS NOT NULL;

CREATE INDEX profiles_person_idx ON public.profiles(person_id);
