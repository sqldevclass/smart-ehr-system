-- 1) Confirm payroll for selected employees, in gapless month order.
-- 2) Discounts become editable (name, percent).
--
-- Payroll confirmation rules per employee:
--   * the first ever confirmation of an employee may be any month;
--   * after that, only the month right after the latest confirmed month can be
--     confirmed (no gaps, never an earlier month).
-- confirm_physician_payroll no longer confirms "everyone": the caller passes the
-- employee ids. Corrections and carry-over are stamped only for those employees.

-- ------------------------------------------------------------ rule helper
create or replace function public.payroll_confirm_state(p_staff_role_id uuid, p_year integer, p_month integer)
returns table(can_confirm boolean, required_month date)
language sql
stable
security definer
set search_path = public
as $$
  with last as (
    select max(make_date(pc.year, pc.month, 1)) as m
    from public.payroll_confirmations pc
    where pc.staff_role_id = p_staff_role_id
  )
  select
    case when last.m is null or make_date(p_year, p_month, 1) = (last.m + interval '1 month')::date then true else false end,
    case when last.m is not null and make_date(p_year, p_month, 1) > (last.m + interval '1 month')::date
         then (last.m + interval '1 month')::date end
  from last
$$;

revoke execute on function public.payroll_confirm_state(uuid, integer, integer) from public, anon, authenticated;

-- ------------------------------------------------------------ get_physician_payroll
drop function public.get_physician_payroll(uuid, integer, integer);

create function public.get_physician_payroll(p_hospital_id uuid, p_year integer, p_month integer)
returns table(
  staff_role_id uuid, full_name text,
  base_pay_amount numeric, own_service_amount numeric, referral_amount numeric,
  department_bucket_amount numeric, bonus_amount numeric, advance_amount numeric,
  total_amount numeric,
  discount_correction_amount numeric, carried_in_amount numeric, carried_out_amount numeric,
  is_confirmed boolean,
  can_confirm boolean, confirm_required_month date
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
    true as is_confirmed,
    false as can_confirm, null::date as confirm_required_month
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
    false as is_confirmed,
    st.can_confirm, st.required_month
  from public.calculate_physician_payroll(p_hospital_id, p_year, p_month) live
  cross join lateral public.payroll_confirm_state(live.staff_role_id, p_year, p_month) st
  where not exists (
    select 1 from public.payroll_confirmations pc2
    where pc2.hospital_id = p_hospital_id and pc2.year = p_year and pc2.month = p_month
      and pc2.staff_role_id = live.staff_role_id
  );
end;
$$;

revoke execute on function public.get_physician_payroll(uuid, integer, integer) from public, anon;
grant execute on function public.get_physician_payroll(uuid, integer, integer) to authenticated;

-- ------------------------------------------------------------ confirm
drop function public.confirm_physician_payroll(uuid, integer, integer);

create function public.confirm_physician_payroll(
  p_hospital_id uuid, p_year integer, p_month integer, p_staff_role_ids uuid[]
)
returns table(staff_role_id uuid, total_amount numeric, newly_confirmed boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ids   uuid[];
  v_bad   record;
begin
  if not public.has_permission('finance.confirm_payroll') then
    raise exception 'Not authorized to confirm payroll';
  end if;
  if p_hospital_id is distinct from public.get_my_hospital_id() then
    raise exception 'Not authorized to confirm payroll';
  end if;
  if p_staff_role_ids is null or cardinality(p_staff_role_ids) = 0 then
    raise exception 'Select at least one employee to confirm';
  end if;
  if p_month < 1 or p_month > 12 then
    raise exception 'month must be between 1 and 12';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('payroll:' || p_hospital_id::text, 0));

  if (select count(*) from public.staff_roles sr
       where sr.hospital_id = p_hospital_id and sr.id = any(p_staff_role_ids))
     <> (select count(distinct x) from unnest(p_staff_role_ids) x) then
    raise exception 'Unknown employee in the selection';
  end if;

  -- employees of the selection still to be confirmed for this month
  select coalesce(array_agg(sr.id), '{}') into v_ids
  from public.staff_roles sr
  where sr.hospital_id = p_hospital_id
    and sr.id = any(p_staff_role_ids)
    and not exists (
      select 1 from public.payroll_confirmations pc
      where pc.staff_role_id = sr.id and pc.year = p_year and pc.month = p_month
    );

  -- no gaps: refuse the whole request on the first violation
  select sr.id, trim(coalesce(p.last_name, '') || ' ' || coalesce(p.first_name, '')) as full_name, st.required_month
    into v_bad
  from public.staff_roles sr
  join public.persons p on p.id = sr.person_id
  cross join lateral public.payroll_confirm_state(sr.id, p_year, p_month) st
  where sr.id = any(v_ids) and not st.can_confirm
  order by 2
  limit 1;

  if found then
    if v_bad.required_month is not null then
      raise exception 'Cannot confirm %: payroll for % must be confirmed first',
        v_bad.full_name, to_char(v_bad.required_month, 'FMMonth YYYY');
    else
      raise exception 'Cannot confirm %: a later month is already confirmed', v_bad.full_name;
    end if;
  end if;

  -- Stamp the corrections that land in this month for these employees BEFORE their
  -- confirmations exist (afterwards their target month would move on).
  update public.payroll_discount_corrections c
     set applied_month = make_date(p_year, p_month, 1)
   where c.id in (
     select r.id from public.payroll_corrections_for_month(p_hospital_id, p_year, p_month) r
     where r.applied_month is null and r.staff_role_id = any(v_ids)
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
  where calc.staff_role_id = any(v_ids)
  on conflict (staff_role_id, year, month) do nothing;

  return query
  select pc.staff_role_id, pc.total_amount, (pc.confirmed_at >= now() - interval '5 seconds')
  from public.payroll_confirmations pc
  where pc.hospital_id = p_hospital_id and pc.year = p_year and pc.month = p_month
    and pc.staff_role_id = any(p_staff_role_ids);
end;
$$;

revoke execute on function public.confirm_physician_payroll(uuid, integer, integer, uuid[]) from public, anon;
grant execute on function public.confirm_physician_payroll(uuid, integer, integer, uuid[]) to authenticated;

-- ------------------------------------------------------------ editable discounts
-- Name and percent can now be edited. Invoice items keep the percent they were
-- discounted with (invoice_items.discount_percent is a snapshot), so an edit only
-- affects discounts applied from now on. The audit trigger records old/new values.
grant update (name, percent) on public.discounts to authenticated;
