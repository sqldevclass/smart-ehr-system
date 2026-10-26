-- Patients' outstanding balance ("Долг").
--
-- One row per unpaid invoice (inpatient, IP) or unpaid visit (outpatient, OP):
--   IP  hospitalization invoices in status active / confirmed with a remaining balance.
--       Amounts come from get_invoice_balance, so they always match the cashier screen.
--   OP  non-cancelled outpatient visits where visits.total_amount > visits.amount_paid.
--       Payment is tracked on the visit (its invoice stays 'active'), and
--       visits.total_amount excludes cancelled services while invoice items do not,
--       so the visit is the source of truth. The visit's latest non-cancelled invoice
--       is shown when there is one; older visits may have none (invoice columns null).
-- Each row carries its service lines as jsonb so the page needs a single call.
-- Unapplied patient deposits are not netted (they are applied when an invoice is paid).

-- ------------------------------------------------------------ permission
insert into public.permissions (code, name_ru, name_en, module)
select 'finance.view_patient_debts', 'Просмотр долгов пациентов', 'View patient debts', 'finance'
where not exists (select 1 from public.permissions where code = 'finance.view_patient_debts');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'finance.view_patient_debts'
where r.code in ('finance', 'admin', 'senior_manager')
  and not exists (
    select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id
  );

-- ------------------------------------------------------------ report function
create or replace function public.get_patient_debts(p_hospital_id uuid)
returns table(
  debt_type text,
  invoice_id uuid, invoice_number text, invoice_status text,
  patient_id uuid, patient_number text, patient_name text, patient_phone text,
  hospitalization_id uuid, hospitalization_number text, admitted_at timestamptz, discharged_at timestamptz,
  visit_id uuid, visit_date date,
  total_amount numeric, paid_amount numeric, outstanding_amount numeric,
  services jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.has_permission('finance.view_patient_debts') then
    raise exception 'Not authorized to view patient debts';
  end if;
  if p_hospital_id is distinct from public.get_my_hospital_id() then
    raise exception 'Not authorized to view patient debts';
  end if;

  return query
  with debts as (
    select 'IP'::text as debt_type,
           i.id as invoice_id, i.invoice_number, i.status as invoice_status,
           h.patient_id,
           h.id as hospitalization_id, h.hospitalization_number, h.admitted_at, h.discharged_at,
           null::uuid as visit_id, null::date as visit_date,
           b.total_amount, b.paid_amount, b.remaining_amount as outstanding_amount,
           (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'service_name', coalesce(s.name, '—'),
                      'service_date', coalesce(vs.completed_at, vs.created_at),
                      'original_amount', coalesce(ii.original_amount, ii.amount),
                      'discount_percent', ii.discount_percent,
                      'amount', ii.amount
                    ) order by coalesce(vs.completed_at, vs.created_at), s.name), '[]'::jsonb)
             from public.invoice_items ii
             left join public.visit_services vs on vs.id = ii.visit_service_id
             left join public.services s on s.id = vs.service_id
             where ii.invoice_id = i.id
           ) as services
    from public.invoices i
    join public.hospitalizations h on h.id = i.hospitalization_id
    cross join lateral public.get_invoice_balance(i.id) b
    where i.hospital_id = p_hospital_id
      and i.status in ('active', 'confirmed')
      and b.remaining_amount > 0

    union all

    select 'OP'::text,
           i.id, i.invoice_number, i.status,
           v.patient_id,
           null::uuid, null::text, null::timestamptz, null::timestamptz,
           v.id, v.visit_date,
           v.total_amount, v.amount_paid, v.total_amount - v.amount_paid,
           (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'service_name', coalesce(s.name, '—'),
                      'service_date', coalesce(vs.completed_at, vs.created_at),
                      'original_amount', vs.cost_at_time,
                      'discount_percent', null,
                      'amount', vs.cost_at_time
                    ) order by coalesce(vs.completed_at, vs.created_at), s.name), '[]'::jsonb)
             from public.visit_services vs
             join public.service_statuses ss on ss.id = vs.status_id and ss.code <> 'cancelled'
             left join public.services s on s.id = vs.service_id
             where vs.visit_id = v.id
           )
    from public.visits v
    left join lateral (
      select inv.id, inv.invoice_number, inv.status
      from public.invoices inv
      where inv.visit_id = v.id and inv.status <> 'cancelled'
      order by inv.created_at desc
      limit 1
    ) i on true
    where v.hospital_id = p_hospital_id
      and v.visit_type = 'outpatient'
      and v.status <> 'cancelled'
      and v.total_amount - v.amount_paid > 0
  )
  select d.debt_type,
         d.invoice_id, d.invoice_number, d.invoice_status,
         d.patient_id, p.patient_number,
         trim(coalesce(p.last_name, '') || ' ' || coalesce(p.first_name, '') || ' ' || coalesce(p.middle_name, '')),
         p.phone,
         d.hospitalization_id, d.hospitalization_number, d.admitted_at, d.discharged_at,
         d.visit_id, d.visit_date,
         d.total_amount, d.paid_amount, d.outstanding_amount,
         d.services
  from debts d
  join public.patients p on p.id = d.patient_id
  order by 7, d.invoice_number;
end;
$$;

revoke execute on function public.get_patient_debts(uuid) from public, anon;
grant execute on function public.get_patient_debts(uuid) to authenticated;
