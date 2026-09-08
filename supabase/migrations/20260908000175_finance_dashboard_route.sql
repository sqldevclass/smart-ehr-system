-- Migration 175: set dashboard_route for the finance role now that
-- the /finance route is being built. Used by src/lib/roleRouting.ts
-- (post-login redirect) and RoleSwitcher.tsx (multi-role switcher).

UPDATE public.roles
SET dashboard_route = '/finance'
WHERE code = 'finance';
