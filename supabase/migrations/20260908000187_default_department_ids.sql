-- Migration 187: default department preference (multi-select).
--
-- Confirmed directly before writing this: profiles currently has
-- only default_role_code and default_dashboard_mode -- no
-- department column exists yet, so this is a fresh addition, not a
-- migration away from an earlier single-department version (that
-- was designed once but never actually run).

ALTER TABLE public.profiles
  ADD COLUMN default_department_ids uuid[] NOT NULL DEFAULT '{}';
