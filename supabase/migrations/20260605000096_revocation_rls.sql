-- Migration 096: Enforce profiles.is_active in helper functions
-- A revoked user (is_active = false) must be blocked at the RLS level
-- even if their JWT is still valid.
-- Supabase banning prevents login, but an existing session could still
-- make requests. This ensures DB-level enforcement as a second layer.

-- Update get_my_hospital_id() to only return a value for active profiles
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
    AND is_active = true
$$;

-- has_permission() already calls get_my_hospital_id() internally,
-- so blocking there cascades to all permission checks automatically.
-- No changes needed to has_permission() or has_role().

-- has_role() also calls get_my_hospital_id() indirectly — also covered.
