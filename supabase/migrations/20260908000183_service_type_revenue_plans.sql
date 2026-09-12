-- Migration 183: monthly revenue plans per service type.
--
-- Nothing like this existed anywhere in the schema (checked earlier
-- when this gap first came up) -- needed for the Services Summary
-- bullet chart (actual vs. plan).

CREATE TABLE public.service_type_revenue_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id      uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  service_type_id  uuid NOT NULL REFERENCES public.service_types(id) ON DELETE CASCADE,
  year             int NOT NULL,
  month            int NOT NULL CHECK (month BETWEEN 1 AND 12),
  planned_revenue  numeric NOT NULL CHECK (planned_revenue >= 0),
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (hospital_id, service_type_id, year, month)
);

ALTER TABLE public.service_type_revenue_plans ENABLE ROW LEVEL SECURITY;

-- New permission: setting targets is a distinct action from viewing
-- the report -- granted to admin only for now (senior_manager can
-- view plans via reports.view_daily, same as the rest of the Daily
-- Report, but not edit them).
INSERT INTO public.permissions (code, name_ru, name_en, module)
VALUES ('reports.manage_plans', 'Управление плановыми показателями', 'Manage revenue plans', 'reports');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.code = 'admin' AND p.code = 'reports.manage_plans';

CREATE POLICY "service_type_revenue_plans_select" ON public.service_type_revenue_plans
  FOR SELECT TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('reports.view_daily')
  );

CREATE POLICY "service_type_revenue_plans_insert" ON public.service_type_revenue_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('reports.manage_plans')
  );

CREATE POLICY "service_type_revenue_plans_update" ON public.service_type_revenue_plans
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('reports.manage_plans')
  );
