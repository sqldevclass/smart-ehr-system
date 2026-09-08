-- Migration 179: add department_id and service_type_id to
-- physician_service_pay_items, appended at the end so the existing
-- columns (and the frontend query already reading this view) are
-- unaffected. CREATE OR REPLACE VIEW allows appending columns as
-- long as existing ones keep their name, type, and position.
--
-- Needed for two new Finance Dashboard charts:
--   - department_id: lets the client group revenue by department
--     (own_service category rows only -- matches exactly what
--     calculate_physician_payroll's dept_rev subquery already sums,
--     so this is the same number, just queryable directly).
--   - service_type_id: lets the client group own-service revenue
--     by service type across all physicians, hospital-wide.
--
-- No hospital_id column added -- security_invoker=true means the
-- underlying visit_services scan is already hospital-scoped by its
-- own RLS, so cross-hospital rows can never appear here regardless.

CREATE OR REPLACE VIEW public.physician_service_pay_items
WITH (security_invoker = true)
AS
SELECT
  'own_service'::text AS category,
  vs.assigned_staff_role_id AS staff_role_id,
  vs.completed_at,
  s.name AS service_name,
  vs.cost_at_time,
  public.get_effective_scoped_rate(
    vs.assigned_staff_role_id,
    (SELECT id FROM public.pay_rate_types WHERE code = 'own_service'),
    s.service_type_id, vs.service_id, vs.completed_at
  ) AS rate_percent,
  vs.cost_at_time * COALESCE(
    public.get_effective_scoped_rate(
      vs.assigned_staff_role_id,
      (SELECT id FROM public.pay_rate_types WHERE code = 'own_service'),
      s.service_type_id, vs.service_id, vs.completed_at
    ), 0
  ) / 100 AS amount,
  sr.department_id,
  s.service_type_id
FROM public.visit_services vs
JOIN public.service_statuses ss ON ss.id = vs.status_id
JOIN public.services s ON s.id = vs.service_id
LEFT JOIN public.staff_roles sr ON sr.id = vs.assigned_staff_role_id
WHERE ss.code = 'completed'
  AND vs.assigned_staff_role_id IS NOT NULL

UNION ALL

SELECT
  'referral'::text AS category,
  origin.assigned_staff_role_id AS staff_role_id,
  vs.completed_at,
  s.name AS service_name,
  vs.cost_at_time,
  public.get_effective_scoped_rate(
    origin.assigned_staff_role_id,
    (SELECT id FROM public.pay_rate_types WHERE code = 'referral'),
    s.service_type_id, vs.service_id, vs.completed_at
  ) AS rate_percent,
  vs.cost_at_time * COALESCE(
    public.get_effective_scoped_rate(
      origin.assigned_staff_role_id,
      (SELECT id FROM public.pay_rate_types WHERE code = 'referral'),
      s.service_type_id, vs.service_id, vs.completed_at
    ), 0
  ) / 100 AS amount,
  origin_sr.department_id,
  s.service_type_id
FROM public.visit_services vs
JOIN public.service_statuses ss ON ss.id = vs.status_id
JOIN public.services s ON s.id = vs.service_id
JOIN public.visit_services origin ON origin.id = vs.ordered_from_visit_service_id
LEFT JOIN public.staff_roles origin_sr ON origin_sr.id = origin.assigned_staff_role_id
WHERE ss.code = 'completed'
  AND origin.assigned_staff_role_id IS NOT NULL;
