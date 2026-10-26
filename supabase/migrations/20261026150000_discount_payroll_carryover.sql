-- Discounts applied/removed AFTER payroll was confirmed: carry the difference over.
--
-- Payroll of a confirmed month is frozen, so it is never rewritten. Instead, when a
-- discount changes the basis of a service whose payroll month is already confirmed
-- for a payee, a signed correction is written to a ledger:
--
--     correction = (net amount after - net amount before) * payee rate / 100
--
--   apply 20% on a $1000 service paid at 10%  ->  (800 - 1000) * 10% = -20
--   remove the discount again                 ->  (1000 - 800) * 10% = +20
--
-- Payees: the performing physician (own service), the referring physician
-- (referral) and every member of a payroll bucket the service belongs to.
-- A payee whose month is NOT confirmed gets no row: the live calculation already
-- uses the discounted amount.
--
-- A correction lands in the first UNCONFIRMED payroll month of that payee that is
-- after the service month and not before the month the change was made. It is
-- stamped (applied_month) when that month is confirmed.
--
-- Floor and carry: a payable total is never negative. When earnings plus
-- corrections are below zero the confirmed total is 0 and the shortfall is stored
-- on the confirmation (carried_out_amount); the next confirmation of that payee
-- takes it as carried_in_amount.

-- ------------------------------------------------------------ ledger
create table public.payroll_discount_corrections (
  id                      uuid primary key default gen_random_uuid(),
  hospital_id             uuid not null references public.hospitals(id) on delete cascade,
  staff_role_id           uuid not null references public.staff_roles(id),
  source                  text not null,
  bucket_id               uuid references public.payroll_buckets(id),
  visit_service_id        uuid not null references public.visit_services(id),
  invoice_item_id         uuid references public.invoice_items(id) on delete set null,
  service_month           date not null,   -- first day of the month the service was paid in
  rate_percent            numeric not null,
  discount_percent_before numeric(5,2),
  discount_percent_after  numeric(5,2),
  amount                  numeric not null,
  eligible_from           date not null,   -- first month this may land in
  applied_month           date,            -- set when the payroll month that absorbed it is confirmed
  created_by              uuid references public.profiles(id),
  created_at              timestamptz not null default now(),
  constraint pdc_source_valid check (source in ('own_service', 'referral', 'bucket')),
  constraint pdc_bucket_matches_source check ((source = 'bucket') = (bucket_id is not null)),
  constraint pdc_amount_nonzero check (amount <> 0),
  constraint pdc_months_first_of_month check (
    service_month = date_trunc('month', service_month)::date
    and eligible_from = date_trunc('month', eligible_from)::date
    and (applied_month is null or applied_month = date_trunc('month', applied_month)::date)
  ),
  constraint pdc_eligible_after_service check (eligible_from > service_month)
);

create index pdc_open_by_payee_idx on public.payroll_discount_corrections (staff_role_id)
  where applied_month is null;
create index pdc_applied_month_idx on public.payroll_discount_corrections (hospital_id, applied_month);

alter table public.payroll_discount_corrections enable row level security;

create policy pdc_select on public.payroll_discount_corrections
  for select to authenticated
  using (hospital_id = public.get_my_hospital_id()
         and public.has_permission('finance.view_payroll'));

-- Written only by the SECURITY DEFINER functions below.
revoke all on public.payroll_discount_corrections from anon;
revoke all on public.payroll_discount_corrections from authenticated;
grant select on public.payroll_discount_corrections to authenticated;

create trigger payroll_discount_corrections_audit
  after insert or update or delete on public.payroll_discount_corrections
  for each row execute function public.audit_trigger_func();

-- ------------------------------------------------------------ confirmation snapshot
alter table public.payroll_confirmations
  add column discount_correction_amount numeric not null default 0,
  add column carried_in_amount          numeric not null default 0,
  add column carried_out_amount         numeric not null default 0,
  add constraint payroll_confirmations_carry_not_positive
    check (carried_in_amount <= 0 and carried_out_amount <= 0);

-- ------------------------------------------------------------ helpers
-- First month >= p_from in which the payee has no confirmation.
create or replace function public.payroll_correction_target_month(p_staff_role_id uuid, p_from date)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select m::date
  from generate_series(p_from::timestamp, p_from::timestamp + interval '120 months', interval '1 month') m
  where not exists (
    select 1 from public.payroll_confirmations pc
    where pc.staff_role_id = p_staff_role_id
      and pc.year  = extract(year  from m)::int
      and pc.month = extract(month from m)::int
  )
  order by m
  limit 1
$$;

-- Corrections that belong to a payroll month: already stamped with it, or still
-- open and landing in it.
create or replace function public.payroll_corrections_for_month(p_hospital_id uuid, p_year integer, p_month integer)
returns setof public.payroll_discount_corrections
language sql
stable
security definer
set search_path = public
as $$
  select c.*
  from public.payroll_discount_corrections c
  where c.hospital_id = p_hospital_id
    and (
      c.applied_month = make_date(p_year, p_month, 1)
      or (
        c.applied_month is null
        and public.payroll_correction_target_month(c.staff_role_id, c.eligible_from) = make_date(p_year, p_month, 1)
      )
    )
$$;

-- Writes the corrections for a set of invoice items whose discount changed.
-- p_changes: [{"item_id": uuid, "old_percent": number|null, "new_percent": number|null}]
create or replace function public.record_discount_payroll_corrections(p_hospital_id uuid, p_changes jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count   integer;
  v_own_id  uuid;
  v_ref_id  uuid;
  v_this    date := date_trunc('month', now() at time zone 'UTC')::date;
begin
  select id into v_own_id from public.pay_rate_types where code = 'own_service';
  select id into v_ref_id from public.pay_rate_types where code = 'referral';

  with chg as (
    select (e ->> 'item_id')::uuid as item_id,
           nullif(e ->> 'old_percent', '')::numeric as old_p,
           nullif(e ->> 'new_percent', '')::numeric as new_p
    from jsonb_array_elements(p_changes) e
  ), svc as (
    select chg.item_id, chg.old_p, chg.new_p,
           vs.id as visit_service_id, vs.service_id, vs.completed_at,
           vs.assigned_staff_role_id, vs.created_by as vs_created_by,
           s.service_type_id, s.service_group_id,
           date_trunc('month', vs.completed_at at time zone 'UTC')::date as service_month,
           public.net_service_amount(vs.cost_at_time, chg.new_p)
             - public.net_service_amount(vs.cost_at_time, chg.old_p) as net_delta
    from chg
    join public.invoice_items ii on ii.id = chg.item_id
    join public.visit_services vs on vs.id = ii.visit_service_id
    join public.service_statuses ss on ss.id = vs.status_id and ss.code = 'completed'
    join public.services s on s.id = vs.service_id
    where vs.completed_at is not null
  ), payees as (
    select 'own_service'::text as source, null::uuid as bucket_id, svc.assigned_staff_role_id as staff_role_id,
           public.get_effective_scoped_rate(svc.assigned_staff_role_id, v_own_id, svc.service_type_id,
                                            svc.service_id, svc.completed_at) as rate,
           svc.item_id, svc.old_p, svc.new_p, svc.visit_service_id, svc.service_month, svc.net_delta
    from svc
    where svc.assigned_staff_role_id is not null
    union all
    select 'referral', null::uuid, creator.staff_role_id,
           public.get_effective_scoped_rate(creator.staff_role_id, v_ref_id, svc.service_type_id,
                                            svc.service_id, svc.completed_at),
           svc.item_id, svc.old_p, svc.new_p, svc.visit_service_id, svc.service_month, svc.net_delta
    from svc
    join public.profiles creator on creator.id = svc.vs_created_by
    where creator.staff_role_id is not null
      and svc.assigned_staff_role_id is not null
      and svc.assigned_staff_role_id <> creator.staff_role_id
    union all
    select 'bucket', pb.id, pbm.staff_role_id, pbm.percent,
           svc.item_id, svc.old_p, svc.new_p, svc.visit_service_id, svc.service_month, svc.net_delta
    from svc
    join public.payroll_buckets pb on pb.hospital_id = p_hospital_id and pb.is_active
    join public.payroll_bucket_members pbm on pbm.bucket_id = pb.id
    where exists (
      select 1 from public.payroll_bucket_items bi
      where bi.bucket_id = pb.id
        and (bi.service_id = svc.service_id
             or (bi.service_id is null and bi.service_group_id = svc.service_group_id))
    )
  )
  insert into public.payroll_discount_corrections
    (hospital_id, staff_role_id, source, bucket_id, visit_service_id, invoice_item_id, service_month,
     rate_percent, discount_percent_before, discount_percent_after, amount, eligible_from, created_by)
  select p_hospital_id, p.staff_role_id, p.source, p.bucket_id, p.visit_service_id, p.item_id, p.service_month,
         p.rate, p.old_p, p.new_p, p.net_delta * p.rate / 100,
         greatest(v_this, (p.service_month + interval '1 month')::date),
         auth.uid()
  from payees p
  where p.staff_role_id is not null
    and coalesce(p.rate, 0) <> 0
    and p.net_delta <> 0
    and exists (
      select 1 from public.payroll_confirmations pc
      where pc.staff_role_id = p.staff_role_id
        and pc.year  = extract(year  from p.service_month)::int
        and pc.month = extract(month from p.service_month)::int
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.payroll_correction_target_month(uuid, date) from public, anon, authenticated;
revoke execute on function public.payroll_corrections_for_month(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.record_discount_payroll_corrections(uuid, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------ apply / remove
-- Same as before, minus the "payroll is confirmed" refusal: instead the change is
-- recorded as corrections. The advisory lock serialises with confirm_physician_payroll
-- so a discount can never slip between a calculation and its confirmation.
create or replace function public.apply_invoice_discount(
  p_invoice_id uuid,
  p_discount_id uuid,
  p_invoice_item_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital uuid := public.get_my_hospital_id();
  v_invoice  public.invoices;
  v_discount public.discounts;
  v_count    integer;
  v_changes  jsonb;
begin
  if not public.has_permission('finance.manage_discounts') then
    raise exception 'Not authorized to manage discounts';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('payroll:' || v_hospital::text, 0));

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found or v_invoice.hospital_id is distinct from v_hospital then
    raise exception 'Invoice not found';
  end if;
  if v_invoice.hospitalization_id is null then
    raise exception 'Discounts are supported for hospitalization invoices only';
  end if;
  if v_invoice.status <> 'active' then
    raise exception 'Discounts can only be changed on an active invoice (current status: %)', v_invoice.status;
  end if;

  select * into v_discount from public.discounts where id = p_discount_id;
  if not found or v_discount.hospital_id is distinct from v_hospital then
    raise exception 'Discount not found';
  end if;
  if not v_discount.is_active then
    raise exception 'This discount is inactive';
  end if;

  if p_invoice_item_id is not null and not exists (
    select 1 from public.invoice_items where id = p_invoice_item_id and invoice_id = p_invoice_id
  ) then
    raise exception 'Invoice item not found on this invoice';
  end if;

  with target as (
    select ii.id, ii.amount, ii.original_amount, ii.discount_id, ii.discount_percent
    from public.invoice_items ii
    where ii.invoice_id = p_invoice_id
      and (p_invoice_item_id is null or ii.id = p_invoice_item_id)
    for update
  ), upd as (
    update public.invoice_items ii
       set original_amount  = coalesce(t.original_amount, t.amount),
           discount_id      = v_discount.id,
           discount_percent = v_discount.percent,
           amount           = public.net_service_amount(coalesce(t.original_amount, t.amount), v_discount.percent)
      from target t
     where ii.id = t.id
    returning ii.id, ii.amount, ii.original_amount, ii.discount_id, ii.discount_percent
  ), aud as (
    insert into public.audit_logs
      (hospital_id, table_name, record_id, operation, old_values, new_values, performed_by, performed_at)
    select v_hospital, 'invoice_items', u.id, 'UPDATE',
           jsonb_build_object('amount', t.amount, 'original_amount', t.original_amount,
                              'discount_id', t.discount_id, 'discount_percent', t.discount_percent),
           jsonb_build_object('amount', u.amount, 'original_amount', u.original_amount,
                              'discount_id', u.discount_id, 'discount_percent', u.discount_percent),
           auth.uid(), now()
    from upd u join target t on t.id = u.id
    returning 1
  )
  select count(*),
         coalesce(jsonb_agg(jsonb_build_object('item_id', u.id,
                                               'old_percent', t.discount_percent,
                                               'new_percent', u.discount_percent)), '[]'::jsonb)
    into v_count, v_changes
  from upd u join target t on t.id = u.id;

  perform public.record_discount_payroll_corrections(v_hospital, v_changes);

  return v_count;
end;
$$;

create or replace function public.remove_invoice_discount(
  p_invoice_id uuid,
  p_invoice_item_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital uuid := public.get_my_hospital_id();
  v_invoice  public.invoices;
  v_count    integer;
  v_changes  jsonb;
begin
  if not public.has_permission('finance.manage_discounts') then
    raise exception 'Not authorized to manage discounts';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('payroll:' || v_hospital::text, 0));

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found or v_invoice.hospital_id is distinct from v_hospital then
    raise exception 'Invoice not found';
  end if;
  if v_invoice.hospitalization_id is null then
    raise exception 'Discounts are supported for hospitalization invoices only';
  end if;
  if v_invoice.status <> 'active' then
    raise exception 'Discounts can only be changed on an active invoice (current status: %)', v_invoice.status;
  end if;

  if p_invoice_item_id is not null and not exists (
    select 1 from public.invoice_items where id = p_invoice_item_id and invoice_id = p_invoice_id
  ) then
    raise exception 'Invoice item not found on this invoice';
  end if;

  with target as (
    select ii.id, ii.amount, ii.original_amount, ii.discount_id, ii.discount_percent
    from public.invoice_items ii
    where ii.invoice_id = p_invoice_id
      and (p_invoice_item_id is null or ii.id = p_invoice_item_id)
      and ii.discount_percent is not null
    for update
  ), upd as (
    update public.invoice_items ii
       set amount           = t.original_amount,
           original_amount  = null,
           discount_id      = null,
           discount_percent = null
      from target t
     where ii.id = t.id
    returning ii.id, ii.amount
  ), aud as (
    insert into public.audit_logs
      (hospital_id, table_name, record_id, operation, old_values, new_values, performed_by, performed_at)
    select v_hospital, 'invoice_items', u.id, 'UPDATE',
           jsonb_build_object('amount', t.amount, 'original_amount', t.original_amount,
                              'discount_id', t.discount_id, 'discount_percent', t.discount_percent),
           jsonb_build_object('amount', u.amount, 'original_amount', null,
                              'discount_id', null, 'discount_percent', null),
           auth.uid(), now()
    from upd u join target t on t.id = u.id
    returning 1
  )
  select count(*),
         coalesce(jsonb_agg(jsonb_build_object('item_id', u.id,
                                               'old_percent', t.discount_percent,
                                               'new_percent', null)), '[]'::jsonb)
    into v_count, v_changes
  from upd u join target t on t.id = u.id;

  perform public.record_discount_payroll_corrections(v_hospital, v_changes);

  return v_count;
end;
$$;

revoke execute on function public.apply_invoice_discount(uuid, uuid, uuid) from public, anon;
revoke execute on function public.remove_invoice_discount(uuid, uuid) from public, anon;
grant execute on function public.apply_invoice_discount(uuid, uuid, uuid) to authenticated;
grant execute on function public.remove_invoice_discount(uuid, uuid) to authenticated;

-- ------------------------------------------------------------ payroll calculation
-- New columns: discount_correction_amount (signed corrections landing in this month),
-- carried_in_amount / carried_out_amount (<= 0). total_amount is floored at 0.
drop function public.get_physician_payroll(uuid, integer, integer);
drop function public.calculate_physician_payroll(uuid, integer, integer);

create function public.calculate_physician_payroll(p_hospital_id uuid, p_year integer, p_month integer)
returns table(
  staff_role_id uuid, full_name text,
  base_pay_amount numeric, own_service_amount numeric, referral_amount numeric,
  department_bucket_amount numeric, bonus_amount numeric, advance_amount numeric,
  total_amount numeric,
  discount_correction_amount numeric, carried_in_amount numeric, carried_out_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_own_type_id uuid;
  v_referral_type_id uuid;
begin
  if not public.has_permission('finance.view_payroll') then
    raise exception 'Not authorized to view payroll';
  end if;

  if p_month < 1 or p_month > 12 then
    raise exception 'month must be between 1 and 12';
  end if;

  v_period_start := make_date(p_year, p_month, 1);
  v_period_end := v_period_start + interval '1 month';

  select id into v_own_type_id from public.pay_rate_types where code = 'own_service';
  select id into v_referral_type_id from public.pay_rate_types where code = 'referral';

  return query
  with corr as (
    select c.staff_role_id, sum(c.amount) as amount
    from public.payroll_corrections_for_month(p_hospital_id, p_year, p_month) c
    group by c.staff_role_id
  ), parts as (
    select
      sr.id as staff_role_id,
      trim(coalesce(p.last_name, '') || ' ' || coalesce(p.first_name, '')) as full_name,
      coalesce(bp.amount, 0) as base_pay_amount,
      coalesce(os.amount, 0) as own_service_amount,
      coalesce(rf.amount, 0) as referral_amount,
      coalesce(bk.amount, 0) as department_bucket_amount,
      coalesce(bn.amount, 0) as bonus_amount,
      coalesce(adv.amount, 0) as advance_amount,
      coalesce(corr.amount, 0) as discount_correction_amount,
      coalesce(ci.amount, 0) as carried_in_amount
    from public.staff_roles sr
    join public.persons p on p.id = sr.person_id
    left join lateral (
      select sum(bpi.amount) as amount
      from public.physician_base_pay_items bpi
      where bpi.staff_role_id = sr.id
    ) bp on true
    left join lateral (
      select sum(
        public.net_service_amount(vs.cost_at_time, vsd.discount_percent)
        * coalesce(public.get_effective_scoped_rate(sr.id, v_own_type_id, s.service_type_id, vs.service_id, vs.completed_at), 0)
        / 100
      ) as amount
      from public.visit_services vs
      join public.service_statuses ss on ss.id = vs.status_id
      join public.services s on s.id = vs.service_id
      left join public.visit_service_discounts vsd on vsd.visit_service_id = vs.id
      where vs.assigned_staff_role_id = sr.id
        and ss.code = 'completed'
        and vs.completed_at >= v_period_start
        and vs.completed_at < v_period_end
    ) os on true
    left join lateral (
      select sum(
        public.net_service_amount(vs.cost_at_time, vsd.discount_percent)
        * coalesce(public.get_effective_scoped_rate(creator.staff_role_id, v_referral_type_id, s.service_type_id, vs.service_id, vs.completed_at), 0)
        / 100
      ) as amount
      from public.visit_services vs
      join public.service_statuses ss on ss.id = vs.status_id
      join public.services s on s.id = vs.service_id
      join public.profiles creator on creator.id = vs.created_by
      left join public.visit_service_discounts vsd on vsd.visit_service_id = vs.id
      where ss.code = 'completed'
        and vs.completed_at >= v_period_start
        and vs.completed_at < v_period_end
        and creator.staff_role_id = sr.id
        and vs.assigned_staff_role_id is not null
        and vs.assigned_staff_role_id <> sr.id
    ) rf on true
    left join lateral (
      select sum(
        public.get_payroll_bucket_revenue(pbm.bucket_id, v_period_start, v_period_end) * pbm.percent / 100
      ) as amount
      from public.payroll_bucket_members pbm
      join public.payroll_buckets pb on pb.id = pbm.bucket_id and pb.is_active
      where pbm.staff_role_id = sr.id
    ) bk on true
    left join lateral (
      select sum(pa.amount) as amount
      from public.physician_payroll_adjustments pa
      where pa.staff_role_id = sr.id and pa.year = p_year and pa.month = p_month and pa.type = 'bonus'
    ) bn on true
    left join lateral (
      select sum(pa.amount) as amount
      from public.physician_payroll_adjustments pa
      where pa.staff_role_id = sr.id and pa.year = p_year and pa.month = p_month and pa.type = 'advance'
    ) adv on true
    left join corr on corr.staff_role_id = sr.id
    left join lateral (
      -- shortfall carried out of this payee's most recent earlier confirmation
      select pc.carried_out_amount as amount
      from public.payroll_confirmations pc
      where pc.staff_role_id = sr.id
        and (pc.year, pc.month) < (p_year, p_month)
      order by pc.year desc, pc.month desc
      limit 1
    ) ci on true
    where sr.hospital_id = p_hospital_id
  )
  select
    x.staff_role_id, x.full_name,
    x.base_pay_amount, x.own_service_amount, x.referral_amount, x.department_bucket_amount,
    x.bonus_amount, x.advance_amount,
    greatest(x.pre_total, 0::numeric) as total_amount,
    x.discount_correction_amount, x.carried_in_amount,
    least(x.pre_total, 0::numeric) as carried_out_amount
  from (
    select parts.*,
           parts.base_pay_amount + parts.own_service_amount + parts.referral_amount
           + parts.department_bucket_amount + parts.bonus_amount - parts.advance_amount
           + parts.discount_correction_amount + parts.carried_in_amount as pre_total
    from parts
  ) x;
end;
$$;

create function public.get_physician_payroll(p_hospital_id uuid, p_year integer, p_month integer)
returns table(
  staff_role_id uuid, full_name text,
  base_pay_amount numeric, own_service_amount numeric, referral_amount numeric,
  department_bucket_amount numeric, bonus_amount numeric, advance_amount numeric,
  total_amount numeric,
  discount_correction_amount numeric, carried_in_amount numeric, carried_out_amount numeric,
  is_confirmed boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.has_permission('finance.view_payroll') then
    raise exception 'Not authorized to view payroll';
  end if;

  return query
  select
    pc.staff_role_id,
    trim(coalesce(p.last_name, '') || ' ' || coalesce(p.first_name, '')),
    pc.base_pay_amount, pc.own_service_amount, pc.referral_amount, pc.department_bucket_amount,
    pc.bonus_amount, pc.advance_amount,
    pc.total_amount,
    pc.discount_correction_amount, pc.carried_in_amount, pc.carried_out_amount,
    true as is_confirmed
  from public.payroll_confirmations pc
  join public.staff_roles sr on sr.id = pc.staff_role_id
  join public.persons p on p.id = sr.person_id
  where pc.hospital_id = p_hospital_id and pc.year = p_year and pc.month = p_month

  union all

  select
    live.staff_role_id, live.full_name,
    live.base_pay_amount, live.own_service_amount, live.referral_amount, live.department_bucket_amount,
    live.bonus_amount, live.advance_amount,
    live.total_amount,
    live.discount_correction_amount, live.carried_in_amount, live.carried_out_amount,
    false as is_confirmed
  from public.calculate_physician_payroll(p_hospital_id, p_year, p_month) live
  where not exists (
    select 1 from public.payroll_confirmations pc2
    where pc2.hospital_id = p_hospital_id and pc2.year = p_year and pc2.month = p_month
      and pc2.staff_role_id = live.staff_role_id
  );
end;
$$;

-- Itemised corrections of a payroll month, for the payroll detail rows.
create function public.get_payroll_correction_items(p_hospital_id uuid, p_year integer, p_month integer)
returns table(
  correction_id uuid, staff_role_id uuid, source text, bucket_name text,
  service_name text, patient_first_name text, patient_last_name text, patient_number text,
  service_month date, rate_percent numeric,
  discount_percent_before numeric, discount_percent_after numeric,
  amount numeric, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.has_permission('finance.view_payroll') then
    raise exception 'Not authorized to view payroll';
  end if;
  if p_hospital_id is distinct from public.get_my_hospital_id() then
    raise exception 'Not authorized to view payroll';
  end if;

  return query
  select c.id, c.staff_role_id, c.source, pb.name,
         s.name, pt.first_name, pt.last_name, pt.patient_number,
         c.service_month, c.rate_percent,
         c.discount_percent_before, c.discount_percent_after,
         c.amount, c.created_at
  from public.payroll_corrections_for_month(p_hospital_id, p_year, p_month) c
  join public.visit_services vs on vs.id = c.visit_service_id
  join public.services s on s.id = vs.service_id
  left join public.patients pt on pt.id = vs.patient_id
  left join public.payroll_buckets pb on pb.id = c.bucket_id
  order by c.created_at;
end;
$$;

revoke execute on function public.calculate_physician_payroll(uuid, integer, integer) from public, anon;
revoke execute on function public.get_physician_payroll(uuid, integer, integer) from public, anon;
revoke execute on function public.get_payroll_correction_items(uuid, integer, integer) from public, anon;
grant execute on function public.calculate_physician_payroll(uuid, integer, integer) to authenticated;
grant execute on function public.get_physician_payroll(uuid, integer, integer) to authenticated;
grant execute on function public.get_payroll_correction_items(uuid, integer, integer) to authenticated;

-- ------------------------------------------------------------ confirmation
create or replace function public.confirm_physician_payroll(p_hospital_id uuid, p_year integer, p_month integer)
returns table(staff_role_id uuid, total_amount numeric, newly_confirmed boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.has_permission('finance.confirm_payroll') then
    raise exception 'Not authorized to confirm payroll';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('payroll:' || p_hospital_id::text, 0));

  -- Stamp the corrections that land in this month BEFORE the confirmations exist
  -- (afterwards their target month would move on). Only unconfirmed payees can have
  -- open corrections targeting this month, so no confirmed row is touched.
  update public.payroll_discount_corrections c
     set applied_month = make_date(p_year, p_month, 1)
   where c.id in (
     select r.id from public.payroll_corrections_for_month(p_hospital_id, p_year, p_month) r
     where r.applied_month is null
   );

  insert into public.payroll_confirmations (
    hospital_id, staff_role_id, year, month,
    base_pay_amount, own_service_amount, referral_amount, department_bucket_amount,
    bonus_amount, advance_amount, total_amount,
    discount_correction_amount, carried_in_amount, carried_out_amount,
    confirmed_by
  )
  select
    p_hospital_id, calc.staff_role_id, p_year, p_month,
    calc.base_pay_amount, calc.own_service_amount, calc.referral_amount, calc.department_bucket_amount,
    calc.bonus_amount, calc.advance_amount, calc.total_amount,
    calc.discount_correction_amount, calc.carried_in_amount, calc.carried_out_amount,
    auth.uid()
  from public.calculate_physician_payroll(p_hospital_id, p_year, p_month) calc
  on conflict (staff_role_id, year, month) do nothing;

  return query
  select pc.staff_role_id, pc.total_amount, (pc.confirmed_at >= now() - interval '5 seconds')
  from public.payroll_confirmations pc
  where pc.hospital_id = p_hospital_id and pc.year = p_year and pc.month = p_month;
end;
$$;

revoke execute on function public.confirm_physician_payroll(uuid, integer, integer) from public, anon;
grant execute on function public.confirm_physician_payroll(uuid, integer, integer) to authenticated;
