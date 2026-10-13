-- Finance Reports -> Payroll tab: append patient name to
-- physician_service_pay_items so an expanded physician row can show
-- which patient each own-service/referral item belongs to.
-- Append-only (CREATE OR REPLACE VIEW), same pattern as migration 179
-- (which appended department_id/service_type_id) -- existing columns
-- keep their name, type and position; this only adds two columns at
-- the end. Validated via a disposable scratch view before delivery.

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
  s.service_type_id,
  p.first_name AS patient_first_name,
  p.last_name AS patient_last_name
FROM public.visit_services vs
JOIN public.service_statuses ss ON ss.id = vs.status_id
JOIN public.services s ON s.id = vs.service_id
LEFT JOIN public.staff_roles sr ON sr.id = vs.assigned_staff_role_id
LEFT JOIN public.patients p ON p.id = vs.patient_id
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
  s.service_type_id,
  p.first_name AS patient_first_name,
  p.last_name AS patient_last_name
FROM public.visit_services vs
JOIN public.service_statuses ss ON ss.id = vs.status_id
JOIN public.services s ON s.id = vs.service_id
JOIN public.visit_services origin ON origin.id = vs.ordered_from_visit_service_id
LEFT JOIN public.staff_roles origin_sr ON origin_sr.id = origin.assigned_staff_role_id
LEFT JOIN public.patients p ON p.id = vs.patient_id
WHERE ss.code = 'completed'
  AND origin.assigned_staff_role_id IS NOT NULL;
