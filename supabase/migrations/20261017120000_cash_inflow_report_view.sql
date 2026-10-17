-- New view backing the "Cash Inflow by Payment Method" report (report #1).
-- Mirrors the existing daily_report_service_items / finance_revenue_report_items
-- pattern: a plain view over payments + payment_methods, relying on the
-- existing payments_select RLS policy (hospital_id = get_my_hospital_id())
-- for per-hospital scoping -- no new permission needed.

CREATE VIEW public.cash_inflow_report_items AS
SELECT
  p.id,
  p.hospital_id,
  p.paid_at,
  p.amount,
  p.is_refunded,
  p.payment_category,
  pm.code AS payment_method_code,
  pm.name_ru AS payment_method_name
FROM public.payments p
JOIN public.payment_methods pm ON pm.id = p.payment_method_id;
