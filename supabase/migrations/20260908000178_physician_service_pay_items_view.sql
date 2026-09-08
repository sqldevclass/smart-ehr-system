-- Migration 178 (revised): itemized payroll breakdown as a VIEW,
-- not an RPC. Queried directly with supabase.from("physician_service_pay_items")
-- like any other table -- no .rpc() call needed.
--
-- Rate resolution still reuses get_effective_scoped_rate (same
-- function calculate_physician_payroll uses for the aggregate), so
-- the breakdown can never drift out of sync with the payroll total.
--
-- security_invoker = true: RLS on the underlying tables is checked
-- against the actual querying user, not the view's owner. This
-- matters because get_effective_scoped_rate() is not SECURITY
-- DEFINER -- it runs as the caller, so its read of
-- physician_pay_rates is still gated by that table's existing RLS
-- (finance.view_payroll / finance.manage_pay_rates only). A
-- non-finance user querying this view sees service dates/names/
-- prices (already visible to them via visit_services' existing
-- hospital-wide SELECT policy) but rate_percent/amount resolve to
-- NULL for them, since they can't read physician_pay_rates at all --
-- no new information is exposed beyond what already exists.

CREATE VIEW public.physician_service_pay_items
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
  ) / 100 AS amount
FROM public.visit_services vs
JOIN public.service_statuses ss ON ss.id = vs.status_id
JOIN public.services s ON s.id = vs.service_id
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
  ) / 100 AS amount
FROM public.visit_services vs
JOIN public.service_statuses ss ON ss.id = vs.status_id
JOIN public.services s ON s.id = vs.service_id
JOIN public.visit_services origin ON origin.id = vs.ordered_from_visit_service_id
WHERE ss.code = 'completed'
  AND origin.assigned_staff_role_id IS NOT NULL;
