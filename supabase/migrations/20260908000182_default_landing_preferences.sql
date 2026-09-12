-- Migration 182: per-user landing preferences.
--
-- Both live on profiles, not staff_roles, because profiles already
-- has a self-service RLS policy (id = auth.uid()) -- staff_roles'
-- UPDATE policy requires has_permission('staff.manage'), which a
-- physician wouldn't hold for their own row. Putting these on
-- profiles avoids needing a new RPC entirely.
--
-- default_role_code: for users holding multiple roles, which one to
-- land on after login (overrides the hardcoded ROLE_PRIORITY order
-- in src/lib/roleRouting.ts when set).
-- default_dashboard_mode: physician-specific -- which of the two
-- physician dashboards (outpatient/inpatient) to land on.

ALTER TABLE public.profiles
  ADD COLUMN default_role_code text REFERENCES public.roles(code) ON DELETE SET NULL,
  ADD COLUMN default_dashboard_mode text CHECK (default_dashboard_mode IN ('ambulatory', 'inpatient'));
