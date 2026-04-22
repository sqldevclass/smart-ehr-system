-- Migration 004: Security-Definer Helper Functions
-- These functions are used by all RLS policies.
-- They must exist before any RLS policy is created.
-- SECURITY DEFINER means they run with the privileges of the function owner,
-- not the calling user — this prevents RLS recursion and improves performance.

-- ============================================================
-- get_my_hospital_id()
-- Returns the hospital_id of the currently authenticated user
-- Used in every RLS policy
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_hospital_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hospital_id 
  FROM public.profiles 
  WHERE id = auth.uid()
$$;

-- ============================================================
-- get_my_role_codes()
-- Returns array of role codes for the current user
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_role_codes()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT array_agg(r.code)
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = auth.uid()
    AND ur.hospital_id = public.get_my_hospital_id()
$$;

-- ============================================================
-- has_permission(perm_code)
-- Returns true if current user has the named permission.
-- Checks:
--   1. Role-based defaults (via role_permissions)
--   2. Individual grants (via user_permissions where granted = true)
-- Respects:
--   3. Individual revocations (via user_permissions where granted = false)
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_permission(perm_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- Has permission via role default OR individual grant
    EXISTS (
      SELECT 1 
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role_id = ur.role_id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = auth.uid()
        AND ur.hospital_id = public.get_my_hospital_id()
        AND p.code = perm_code
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_permissions up
      JOIN public.permissions p ON p.id = up.permission_id
      WHERE up.user_id = auth.uid()
        AND up.hospital_id = public.get_my_hospital_id()
        AND p.code = perm_code
        AND up.granted = true
    )
  )
  -- AND NOT explicitly revoked
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_permissions up
    JOIN public.permissions p ON p.id = up.permission_id
    WHERE up.user_id = auth.uid()
      AND up.hospital_id = public.get_my_hospital_id()
      AND p.code = perm_code
      AND up.granted = false
  )
$$;

-- ============================================================
-- has_role(role_code)
-- Returns true if current user has the named role
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_role(role_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND ur.hospital_id = public.get_my_hospital_id()
      AND r.code = role_code
  )
$$;

-- ============================================================
-- generate_sequence_number(p_hospital_id, p_sequence_type)
-- Atomically increments and returns the next sequence number
-- Uses FOR UPDATE to prevent race conditions
-- Returns formatted string e.g. 'P-00001', 'H-00001'
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_sequence_number(
  p_hospital_id   uuid,
  p_sequence_type text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix     text;
  v_next_value bigint;
  v_year       text;
BEGIN
  -- Lock the row to prevent concurrent increments
  SELECT prefix, last_value + 1
  INTO v_prefix, v_next_value
  FROM public.hospital_sequences
  WHERE hospital_id = p_hospital_id
    AND sequence_type = p_sequence_type
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sequence not found for hospital % type %', 
      p_hospital_id, p_sequence_type;
  END IF;

  -- Update the counter
  UPDATE public.hospital_sequences
  SET last_value = v_next_value
  WHERE hospital_id = p_hospital_id
    AND sequence_type = p_sequence_type;

  -- Format: PREFIX-YEAR-00001
  v_year := to_char(now(), 'YYYY');
  RETURN v_prefix || '-' || v_year || '-' || lpad(v_next_value::text, 5, '0');
END;
$$;

-- Cleanup: Remove leftover functions from old codebase

DROP FUNCTION IF EXISTS public.audit_trigger_func() CASCADE;
DROP FUNCTION IF EXISTS public.get_current_hospital_id() CASCADE;
DROP FUNCTION IF EXISTS public.get_current_role() CASCADE;
DROP FUNCTION IF EXISTS public.is_hospital_admin() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at() CASCADE;

-- Rewrite handle_new_user for new profiles schema
-- Fired by Supabase Auth after a new user signs up
-- hospital_id is set by the Edge Function that creates the user
-- so here we just create a minimal profile row if it doesn't exist

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Profile is created by Edge Functions (create-staff-user, register-hospital)
  -- This trigger is a safety net only
  -- It does nothing if the profile already exists
  INSERT INTO public.profiles (id, hospital_id, full_name)
  SELECT 
    NEW.id,
    (NEW.raw_user_meta_data->>'hospital_id')::uuid,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = NEW.id
  )
  AND NEW.raw_user_meta_data->>'hospital_id' IS NOT NULL;

  RETURN NEW;
END;
$$;

-- Recreate the trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();