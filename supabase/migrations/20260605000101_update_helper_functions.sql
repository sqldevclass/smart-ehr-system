-- Migration 101: Update helper functions for new schema
-- get_my_staff_role_id() — returns the staff_roles.id for the current user
-- get_my_person_id() — returns the persons.id for the current user
-- These are used in RLS policies and RPCs going forward.

-- ============================================================
-- 1. get_my_person_id()
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_person_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT person_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND is_active = true
$$;

-- ============================================================
-- 2. get_my_staff_role_id()
-- Returns the staff_roles.id for the current user.
-- Returns NULL if user has no staff role (e.g. admin, HR).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_staff_role_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sr.id
  FROM public.staff_roles sr
  WHERE sr.person_id = public.get_my_person_id()
    AND sr.hospital_id = public.get_my_hospital_id()
    AND sr.is_active = true
  LIMIT 1
$$;

-- ============================================================
-- 3. get_my_staff_role_type()
-- Returns the role_type for the current user's staff role.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_staff_role_type()
RETURNS public.staff_role_type
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sr.role_type
  FROM public.staff_roles sr
  WHERE sr.person_id = public.get_my_person_id()
    AND sr.hospital_id = public.get_my_hospital_id()
    AND sr.is_active = true
  LIMIT 1
$$;

-- ============================================================
-- 4. Update physician_personal_templates RLS
-- These policies currently do a subquery on physicians table.
-- Add equivalent staff_roles version alongside.
-- ============================================================

DROP POLICY IF EXISTS "ppt_insert" ON public.physician_personal_templates;
CREATE POLICY "ppt_insert" ON public.physician_personal_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND physician_id = (
      SELECT ph.id FROM public.physicians ph
      WHERE ph.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ppt_update" ON public.physician_personal_templates;
CREATE POLICY "ppt_update" ON public.physician_personal_templates
  FOR UPDATE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND physician_id = (
      SELECT ph.id FROM public.physicians ph
      WHERE ph.profile_id = auth.uid()
    )
  );
