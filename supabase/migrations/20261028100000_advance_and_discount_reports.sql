-- Daily report: "Аванс" (deposit balances) and "Отчет скидок" (discounts given).
--
--   get_patient_advances(hospital, as_of)   one row per patient whose deposit balance at as_of
--                                           is above zero, with deposited / applied / refunded
--                                           totals up to as_of. Same balance rule as
--                                           get_patient_deposit_balance (deposit - applied - refund).
--   get_discount_report(hospital, from, to) one row per discounted invoice item whose discount
--                                           was applied inside the period. The application time and
--                                           user come from the audit trail written by
--                                           apply_invoice_discount (latest application of the
--                                           item); items without an audit row fall back to the
--                                           service date. Cancelled invoices are excluded.
-- Both are read-only SECURITY DEFINER functions behind their own view permission.

-- ------------------------------------------------------------ permissions
insert into public.permissions (code, name_ru, name_en, module)
select v.code, v.name_ru, v.name_en, 'finance'
from (values
  ('finance.view_patient_advances', 'Просмотр авансов пациентов', 'View patient advances'),
  ('finance.view_discount_report',  'Просмотр отчёта по скидкам', 'View discount report')
) as v(code, name_ru, name_en)
where not exists (select 1 from public.permissions p where p.code = v.code);

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('finance.view_patient_advances', 'finance.view_discount_report')
where r.code in ('finance', 'admin', 'senior_manager')
  and not exists (
    select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id
  );

-- ------------------------------------------------------------ Аванс
create or replace function public.get_patient_advances(p_hospital_id uuid, p_as_of timestamptz default now())
returns table(
  patient_id uuid, patient_number text, last_name text, first_name text,
  date_of_birth date, phone text,
  deposited_amount numeric, applied_amount numeric, refunded_amount numeric,
  balance numeric, last_deposit_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.has_permission('finance.view_patient_advances') then
    raise exception 'Not authorized to view patient advances';
  end if;
  if p_hospital_id is distinct from public.get_my_hospital_id() then
    raise exception 'Not authorized to view patient advances';
  end if;

  return query
  select p.id, p.patient_number, p.last_name, p.first_name, p.date_of_birth, p.phone,
         coalesce(sum(l.amount) filter (where l.transaction_type = 'deposit'), 0),
         coalesce(sum(l.amount) filter (where l.transaction_type = 'applied_to_invoice'), 0),
         coalesce(sum(l.amount) filter (where l.transaction_type = 'refund'), 0),
         coalesce(sum(case l.transaction_type
                        when 'deposit' then l.amount
                        when 'applied_to_invoice' then -l.amount
                        when 'refund' then -l.amount
                      end), 0),
         max(l.created_at) filter (where l.transaction_type = 'deposit')
  from public.patient_deposit_ledger l
  join public.patients p on p.id = l.patient_id
  where l.hospital_id = p_hospital_id
    and l.created_at <= p_as_of
  group by p.id, p.patient_number, p.last_name, p.first_name, p.date_of_birth, p.phone
  having coalesce(sum(case l.transaction_type
                        when 'deposit' then l.amount
                        when 'applied_to_invoice' then -l.amount
                        when 'refund' then -l.amount
                      end), 0) > 0
  order by p.last_name, p.first_name, p.patient_number;
end;
$$;

-- ------------------------------------------------------------ Отчет скидок
create or replace function public.get_discount_report(p_hospital_id uuid, p_from timestamptz, p_to timestamptz)
returns table(
  item_id uuid, applied_at timestamptz, applied_by_name text,
  hospitalization_number text,
  patient_id uuid, patient_number text, last_name text, first_name text, date_of_birth date,
  service_name text, discount_name text, discount_percent numeric,
  original_amount numeric, discount_amount numeric, amount numeric,
  invoice_number text, invoice_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.has_permission('finance.view_discount_report') then
    raise exception 'Not authorized to view the discount report';
  end if;
  if p_hospital_id is distinct from public.get_my_hospital_id() then
    raise exception 'Not authorized to view the discount report';
  end if;

  return query
  select * from (
    select ii.id as item_id,
           coalesce(au.performed_at, vs.completed_at, vs.created_at) as applied_at,
           pr.full_name as applied_by_name,
           h.hospitalization_number,
           pt.id as patient_id, pt.patient_number, pt.last_name, pt.first_name, pt.date_of_birth,
           s.name as service_name,
           d.name as discount_name,
           ii.discount_percent,
           coalesce(ii.original_amount, ii.amount) as original_amount,
           coalesce(ii.original_amount, ii.amount) - ii.amount as discount_amount,
           ii.amount,
           i.invoice_number, i.status as invoice_status
    from public.invoice_items ii
    join public.invoices i on i.id = ii.invoice_id
    join public.hospitalizations h on h.id = i.hospitalization_id
    join public.patients pt on pt.id = h.patient_id
    left join public.visit_services vs on vs.id = ii.visit_service_id
    left join public.services s on s.id = vs.service_id
    left join public.discounts d on d.id = ii.discount_id
    left join lateral (
      select a.performed_at, a.performed_by
      from public.audit_logs a
      where a.table_name = 'invoice_items'
        and a.record_id = ii.id
        and a.hospital_id = p_hospital_id
        and a.new_values ->> 'discount_id' is not null
      order by a.performed_at desc
      limit 1
    ) au on true
    left join public.profiles pr on pr.id = au.performed_by
    where i.hospital_id = p_hospital_id
      and i.status <> 'cancelled'
      and ii.discount_id is not null
  ) x
  where x.applied_at >= p_from and x.applied_at <= p_to
  order by x.applied_at desc, x.last_name, x.first_name;
end;
$$;

revoke execute on function public.get_patient_advances(uuid, timestamptz) from public, anon;
revoke execute on function public.get_discount_report(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_patient_advances(uuid, timestamptz) to authenticated;
grant execute on function public.get_discount_report(uuid, timestamptz, timestamptz) to authenticated;
