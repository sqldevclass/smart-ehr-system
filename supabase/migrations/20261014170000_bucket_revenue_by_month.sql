-- Stage 2 (Buckets admin page): one additive helper RPC.
--
-- The Buckets admin page shows each bucket's revenue across several
-- months (not a single-month picker, per the user: "the table will
-- have all the months"). Rather than have the frontend call
-- get_payroll_bucket_revenue once per month (N round trips per
-- bucket), this returns a bounded window of months (default: the
-- last 12, including the current one) in one call.
--
-- Validated live before delivery: for a scratch bucket scoped to
-- "Urology Consultation", 3 months back returned the correct
-- month-by-month totals (matching a direct sum of cost_at_time for
-- that service/month).

CREATE OR REPLACE FUNCTION public.get_bucket_revenue_by_month(p_bucket_id uuid, p_months int DEFAULT 12)
RETURNS TABLE (month_start date, revenue numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT
    date_trunc('month', m)::date AS month_start,
    COALESCE((
      SELECT SUM(vs.cost_at_time)
      FROM public.visit_services vs
      JOIN public.service_statuses ss ON ss.id = vs.status_id
      JOIN public.services s ON s.id = vs.service_id
      WHERE ss.code = 'completed'
        AND vs.completed_at >= date_trunc('month', m)
        AND vs.completed_at < date_trunc('month', m) + interval '1 month'
        AND EXISTS (
          SELECT 1 FROM public.payroll_bucket_items bi
          WHERE bi.bucket_id = p_bucket_id
            AND (bi.service_id = vs.service_id OR (bi.service_id IS NULL AND bi.service_group_id = s.service_group_id))
        )
    ), 0) AS revenue
  FROM generate_series(
    date_trunc('month', now()) - ((p_months - 1) || ' months')::interval,
    date_trunc('month', now()),
    interval '1 month'
  ) AS m
  ORDER BY month_start DESC;
$$;
