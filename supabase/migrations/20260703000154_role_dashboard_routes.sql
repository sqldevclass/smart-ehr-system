-- Migration 154: Make role dashboard routes data-driven instead
-- of hardcoded in RoleSwitcher.tsx. roles already exists (since
-- the original foundation migration) and is the real source of
-- user_roles/AuthContext.roles — this just adds the one missing
-- piece of metadata (dashboard_route) that RoleSwitcher needs.
--
-- Roles left NULL genuinely have no dashboard built yet — same
-- behavior as today, RoleSwitcher already renders those as
-- disabled/greyed when a route is missing.

ALTER TABLE public.roles
  ADD COLUMN dashboard_route text;

UPDATE public.roles SET dashboard_route = v.route
FROM (VALUES
  ('admin',                '/admin'),
  ('outpatient_registrar', '/registrar'),
  ('inpatient_registrar',  '/inpatient'),
  ('cashier',               '/cashier'),
  ('physician',              '/physician'),
  ('inpatient_nurse',         '/nurse'),
  ('head_nurse',               '/nurse'),
  ('hr',                        '/hr'),
  ('pharmacist',                 '/pharmacy'),
  ('warehouse_staff',             '/warehouse'),
  -- previously missing from the hardcoded map — the actual bug
  -- report this migration exists to fix:
  ('lab_physician',               '/lab'),
  ('blood_draw_nurse',             '/lab')
) AS v(code, route)
WHERE public.roles.code = v.code;

-- call_center_registrar, functional_diagnostics_physician,
-- senior_manager, finance, inventory_manager, radiology_technician
-- stay NULL — no dashboard exists for them yet, unchanged from
-- today's behavior.
