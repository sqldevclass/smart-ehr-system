-- Cash flow report: one row per money movement, net of deposit refunds.
--
-- Replaces cash_inflow_report_items (payments only, aggregated by method in the UI).
-- Rows:
--   payments            movement_type = payment_category (regular | deposit | settlement),
--                       amount > 0. Payments marked is_refunded are excluded, as before.
--   deposit refunds     patient_deposit_ledger rows of type 'refund',
--                       movement_type = 'deposit_refund', amount < 0 (cash paid out).
-- 'applied_to_invoice' ledger rows are NOT cash movements (the cash came in as the
-- deposit) and are deliberately not part of this view.
--
-- care_type: OP for visit payments, IP for hospitalization payments, NULL for deposits
-- and refunds (not tied to a single stay). Patient comes from the payment itself or,
-- for visit payments, from the visit.
-- Runs as the caller (security_invoker): payments, ledger, visits, patients and profiles
-- are all hospital-scoped by RLS.

drop view if exists public.cash_inflow_report_items;

create view public.cash_flow_report_items
with (security_invoker = true) as
select
  p.id,
  p.hospital_id,
  p.paid_at                       as occurred_at,
  p.payment_category              as movement_type,
  p.amount                        as amount,
  p.receipt_number,
  case
    when p.hospitalization_id is not null then 'IP'
    when p.visit_id is not null then 'OP'
  end                             as care_type,
  pt.id                           as patient_id,
  pt.patient_number,
  pt.last_name,
  pt.first_name,
  pt.date_of_birth,
  h.hospitalization_number,
  inv.invoice_number,
  pm.code                         as payment_method_code,
  pm.name_ru                      as payment_method_name,
  pr.full_name                    as staff_name,
  null::text                      as note
from public.payments p
join public.payment_methods pm on pm.id = p.payment_method_id
left join public.visits v on v.id = p.visit_id
left join public.patients pt on pt.id = coalesce(p.patient_id, v.patient_id)
left join public.hospitalizations h on h.id = p.hospitalization_id
left join public.invoices inv on inv.id = p.invoice_id
left join public.profiles pr on pr.id = p.received_by
where not p.is_refunded

union all

select
  l.id,
  l.hospital_id,
  l.created_at,
  'deposit_refund',
  -l.amount,
  l.receipt_number,
  null,
  pt.id,
  pt.patient_number,
  pt.last_name,
  pt.first_name,
  pt.date_of_birth,
  null,
  null,
  pm.code,
  pm.name_ru,
  pr.full_name,
  l.note
from public.patient_deposit_ledger l
join public.patients pt on pt.id = l.patient_id
join public.payment_methods pm on pm.id = l.payment_method_id
left join public.profiles pr on pr.id = l.created_by
where l.transaction_type = 'refund';

revoke all on public.cash_flow_report_items from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.cash_flow_report_items from authenticated;
grant select on public.cash_flow_report_items to authenticated;
