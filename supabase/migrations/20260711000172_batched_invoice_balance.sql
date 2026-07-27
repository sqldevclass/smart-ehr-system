-- Migration 172: batched version of get_invoice_balance — takes
-- an array of invoice ids and returns all their balances in one
-- query, replacing DebtSection's current per-invoice loop (a
-- likely source of the 0.00-display bug, and strictly less
-- reliable than a single set-based query regardless).

CREATE OR REPLACE FUNCTION public.get_invoices_balance_batch(p_invoice_ids uuid[])
RETURNS TABLE(
  invoice_id       uuid,
  total_amount     numeric,
  paid_amount      numeric,
  remaining_amount numeric,
  is_paid          boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT inv.id, b.*
  FROM unnest(p_invoice_ids) AS inv(id)
  CROSS JOIN LATERAL public.get_invoice_balance(inv.id) AS b;
$$;
