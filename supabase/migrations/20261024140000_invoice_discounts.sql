-- Invoice discounts.
--
--   discounts                 named percentage discounts, managed by finance
--   invoice_items             +discount_id, +discount_percent, +original_amount
--                             amount = what the patient pays (already discounted),
--                             original_amount = the pre-discount price (snapshot)
--   apply_invoice_discount    apply a discount to a whole ACTIVE hospitalization
--   remove_invoice_discount   invoice, or to one item of it
--
-- Payroll and revenue: physicians keep their usual percentage, but it is now
-- calculated on the DISCOUNTED amount. One helper (net_service_amount) holds the
-- formula and one view (visit_service_discounts) maps a visit service to its
-- discount; every payroll / revenue calculation below goes through them, so the
-- itemized payroll rows, the payroll totals, the department buckets and the
-- revenue reports can never disagree.
--
-- Scope: hospitalization invoices only (they are paid from the invoice balance).
-- Outpatient visit invoices also keep visits.total_amount / amount_paid and are
-- deliberately not covered yet.

-- ------------------------------------------------------------ permission
insert into public.permissions (code, name_ru, name_en, module)
select 'finance.manage_discounts', 'Управление скидками', 'Manage discounts', 'finance'
where not exists (select 1 from public.permissions where code = 'finance.manage_discounts');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'finance.manage_discounts'
where r.code in ('finance', 'admin')
  and not exists (
    select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id
  );

-- ------------------------------------------------------------ discounts
create table public.discounts (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  name        text not null,
  percent     numeric(5,2) not null,
  is_active   boolean not null default true,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  constraint discounts_name_not_blank check (btrim(name) <> ''),
  constraint discounts_percent_range check (percent > 0 and percent <= 100)
);

create unique index discounts_hospital_name_uq
  on public.discounts (hospital_id, lower(btrim(name)));

alter table public.discounts enable row level security;

create policy discounts_select on public.discounts
  for select to authenticated
  using (hospital_id = public.get_my_hospital_id());

create policy discounts_insert on public.discounts
  for insert to authenticated
  with check (hospital_id = public.get_my_hospital_id()
              and public.has_permission('finance.manage_discounts'));

create policy discounts_update on public.discounts
  for update to authenticated
  using (hospital_id = public.get_my_hospital_id()
         and public.has_permission('finance.manage_discounts'))
  with check (hospital_id = public.get_my_hospital_id()
              and public.has_permission('finance.manage_discounts'));

-- A discount is immutable once created (items snapshot its percent); it can only be
-- deactivated. Never deleted.
revoke all on public.discounts from anon;
revoke all on public.discounts from authenticated;
grant select on public.discounts to authenticated;
grant insert (hospital_id, name, percent, created_by) on public.discounts to authenticated;
grant update (is_active) on public.discounts to authenticated;

create trigger discounts_audit
  after insert or update or delete on public.discounts
  for each row execute function public.audit_trigger_func();

-- ------------------------------------------------------------ invoice_items
alter table public.invoice_items
  add column discount_id      uuid references public.discounts(id),
  add column discount_percent numeric(5,2),
  add column original_amount  numeric,
  add constraint invoice_items_discount_consistent check (
    (discount_id is null) = (discount_percent is null)
    and (discount_id is null) = (original_amount is null)
  );

create index invoice_items_discounted_visit_service_idx
  on public.invoice_items (visit_service_id) where discount_percent is not null;

-- ------------------------------------------------------------ shared formula
create or replace function public.net_service_amount(p_amount numeric, p_discount_percent numeric)
returns numeric
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when p_discount_percent is null then p_amount
    else round(p_amount * (1 - p_discount_percent / 100), 2)
  end
$$;

revoke execute on function public.net_service_amount(numeric, numeric) from public, anon;
grant execute on function public.net_service_amount(numeric, numeric) to authenticated;

-- One row per visit service that carries a discount on a live invoice item.
create or replace view public.visit_service_discounts
with (security_invoker = on) as
select distinct on (ii.visit_service_id)
       ii.visit_service_id,
       ii.discount_percent
from public.invoice_items ii
join public.invoices i on i.id = ii.invoice_id
where ii.discount_percent is not null
  and i.status <> 'cancelled'
order by ii.visit_service_id, ii.id;

revoke all on public.visit_service_discounts from anon;
grant select on public.visit_service_discounts to authenticated;

-- ------------------------------------------------------------ apply / remove
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
begin
  if not public.has_permission('finance.manage_discounts') then
    raise exception 'Not authorized to manage discounts';
  end if;

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

  -- Payroll of a confirmed month is frozen: do not change its basis afterwards.
  if exists (
    select 1
    from public.invoice_items ii
    join public.visit_services vs on vs.id = ii.visit_service_id
    join public.payroll_confirmations pc
      on pc.hospital_id = v_hospital
     and pc.year  = extract(year  from vs.completed_at at time zone 'UTC')
     and pc.month = extract(month from vs.completed_at at time zone 'UTC')
    where ii.invoice_id = p_invoice_id
      and (p_invoice_item_id is null or ii.id = p_invoice_item_id)
      and vs.completed_at is not null
  ) then
    raise exception 'Payroll for the month of one of these services is already confirmed; the discount cannot be changed';
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
  )
  insert into public.audit_logs
    (hospital_id, table_name, record_id, operation, old_values, new_values, performed_by, performed_at)
  select v_hospital, 'invoice_items', u.id, 'UPDATE',
         jsonb_build_object('amount', t.amount, 'original_amount', t.original_amount,
                            'discount_id', t.discount_id, 'discount_percent', t.discount_percent),
         jsonb_build_object('amount', u.amount, 'original_amount', u.original_amount,
                            'discount_id', u.discount_id, 'discount_percent', u.discount_percent),
         auth.uid(), now()
  from upd u join target t on t.id = u.id;

  get diagnostics v_count = row_count;
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
begin
  if not public.has_permission('finance.manage_discounts') then
    raise exception 'Not authorized to manage discounts';
  end if;

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

  if exists (
    select 1
    from public.invoice_items ii
    join public.visit_services vs on vs.id = ii.visit_service_id
    join public.payroll_confirmations pc
      on pc.hospital_id = v_hospital
     and pc.year  = extract(year  from vs.completed_at at time zone 'UTC')
     and pc.month = extract(month from vs.completed_at at time zone 'UTC')
    where ii.invoice_id = p_invoice_id
      and (p_invoice_item_id is null or ii.id = p_invoice_item_id)
      and ii.discount_percent is not null
      and vs.completed_at is not null
  ) then
    raise exception 'Payroll for the month of one of these services is already confirmed; the discount cannot be changed';
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
  )
  insert into public.audit_logs
    (hospital_id, table_name, record_id, operation, old_values, new_values, performed_by, performed_at)
  select v_hospital, 'invoice_items', u.id, 'UPDATE',
         jsonb_build_object('amount', t.amount, 'original_amount', t.original_amount,
                            'discount_id', t.discount_id, 'discount_percent', t.discount_percent),
         jsonb_build_object('amount', u.amount, 'original_amount', null,
                            'discount_id', null, 'discount_percent', null),
         auth.uid(), now()
  from upd u join target t on t.id = u.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.apply_invoice_discount(uuid, uuid, uuid) from public, anon;
revoke execute on function public.remove_invoice_discount(uuid, uuid) from public, anon;
grant execute on function public.apply_invoice_discount(uuid, uuid, uuid) to authenticated;
grant execute on function public.remove_invoice_discount(uuid, uuid) to authenticated;

-- ------------------------------------------------------------ payroll views
-- Rates are applied to the discounted amount. cost_at_time stays the original price;
-- discount_percent is appended (null when no discount) for the payroll label.
create or replace view public.physician_service_pay_items as
 SELECT 'own_service'::text AS category,
    vs.assigned_staff_role_id AS staff_role_id,
    vs.completed_at,
    s.name AS service_name,
    vs.cost_at_time,
    get_effective_scoped_rate(vs.assigned_staff_role_id, ( SELECT pay_rate_types.id
           FROM pay_rate_types
          WHERE pay_rate_types.code = 'own_service'::text), s.service_type_id, vs.service_id, vs.completed_at) AS rate_percent,
    net_service_amount(vs.cost_at_time, vsd.discount_percent) * COALESCE(get_effective_scoped_rate(vs.assigned_staff_role_id, ( SELECT pay_rate_types.id
           FROM pay_rate_types
          WHERE pay_rate_types.code = 'own_service'::text), s.service_type_id, vs.service_id, vs.completed_at), 0::numeric) / 100::numeric AS amount,
    sr.department_id,
    s.service_type_id,
    p.first_name AS patient_first_name,
    p.last_name AS patient_last_name,
    p.patient_number,
    vsd.discount_percent
   FROM visit_services vs
     JOIN service_statuses ss ON ss.id = vs.status_id
     JOIN services s ON s.id = vs.service_id
     LEFT JOIN staff_roles sr ON sr.id = vs.assigned_staff_role_id
     LEFT JOIN patients p ON p.id = vs.patient_id
     LEFT JOIN visit_service_discounts vsd ON vsd.visit_service_id = vs.id
  WHERE ss.code = 'completed'::text AND vs.assigned_staff_role_id IS NOT NULL
UNION ALL
 SELECT 'referral'::text AS category,
    creator.staff_role_id,
    vs.completed_at,
    s.name AS service_name,
    vs.cost_at_time,
    get_effective_scoped_rate(creator.staff_role_id, ( SELECT pay_rate_types.id
           FROM pay_rate_types
          WHERE pay_rate_types.code = 'referral'::text), s.service_type_id, vs.service_id, vs.completed_at) AS rate_percent,
    net_service_amount(vs.cost_at_time, vsd.discount_percent) * COALESCE(get_effective_scoped_rate(creator.staff_role_id, ( SELECT pay_rate_types.id
           FROM pay_rate_types
          WHERE pay_rate_types.code = 'referral'::text), s.service_type_id, vs.service_id, vs.completed_at), 0::numeric) / 100::numeric AS amount,
    creator_sr.department_id,
    s.service_type_id,
    p.first_name AS patient_first_name,
    p.last_name AS patient_last_name,
    p.patient_number,
    vsd.discount_percent
   FROM visit_services vs
     JOIN service_statuses ss ON ss.id = vs.status_id
     JOIN services s ON s.id = vs.service_id
     JOIN profiles creator ON creator.id = vs.created_by
     LEFT JOIN staff_roles creator_sr ON creator_sr.id = creator.staff_role_id
     LEFT JOIN patients p ON p.id = vs.patient_id
     LEFT JOIN visit_service_discounts vsd ON vsd.visit_service_id = vs.id
  WHERE ss.code = 'completed'::text AND creator.staff_role_id IS NOT NULL AND vs.assigned_staff_role_id IS NOT NULL AND vs.assigned_staff_role_id <> creator.staff_role_id;

create or replace view public.payroll_bucket_pay_items as
 SELECT pbm.staff_role_id,
    pb.id AS bucket_id,
    pb.name AS bucket_name,
    pbm.percent AS member_percent,
    vs.id AS visit_service_id,
    vs.completed_at,
    s.name AS service_name,
    vs.cost_at_time,
    net_service_amount(vs.cost_at_time, vsd.discount_percent) * pbm.percent / 100::numeric AS amount,
    p.patient_first_name,
    p.patient_last_name,
    p.patient_number,
    vsd.discount_percent
   FROM payroll_buckets pb
     JOIN payroll_bucket_members pbm ON pbm.bucket_id = pb.id
     JOIN visit_services vs ON (EXISTS ( SELECT 1
           FROM payroll_bucket_items bi
          WHERE bi.bucket_id = pb.id AND (bi.service_id = vs.service_id OR bi.service_id IS NULL AND bi.service_group_id = (( SELECT services.service_group_id
                   FROM services
                  WHERE services.id = vs.service_id)))))
     JOIN services s ON s.id = vs.service_id
     JOIN service_statuses ss ON ss.id = vs.status_id
     LEFT JOIN visit_service_discounts vsd ON vsd.visit_service_id = vs.id
     LEFT JOIN LATERAL ( SELECT patients.first_name AS patient_first_name,
            patients.last_name AS patient_last_name,
            patients.patient_number
           FROM patients
          WHERE patients.id = vs.patient_id) p ON true
  WHERE pb.is_active AND ss.code = 'completed'::text;

-- ------------------------------------------------------------ payroll totals
create or replace function public.calculate_physician_payroll(p_hospital_id uuid, p_year integer, p_month integer)
 RETURNS TABLE(staff_role_id uuid, full_name text, base_pay_amount numeric, own_service_amount numeric, referral_amount numeric, department_bucket_amount numeric, bonus_amount numeric, advance_amount numeric, total_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_own_type_id uuid;
  v_referral_type_id uuid;
BEGIN
  IF NOT public.has_permission('finance.view_payroll') THEN
    RAISE EXCEPTION 'Not authorized to view payroll';
  END IF;

  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'month must be between 1 and 12';
  END IF;

  v_period_start := make_date(p_year, p_month, 1);
  v_period_end := v_period_start + interval '1 month';

  SELECT id INTO v_own_type_id FROM public.pay_rate_types WHERE code = 'own_service';
  SELECT id INTO v_referral_type_id FROM public.pay_rate_types WHERE code = 'referral';

  RETURN QUERY
  SELECT
    sr.id,
    trim(COALESCE(p.last_name, '') || ' ' || COALESCE(p.first_name, '')),
    COALESCE(bp.amount, 0) AS base_pay_amount,
    COALESCE(os.amount, 0) AS own_service_amount,
    COALESCE(rf.amount, 0) AS referral_amount,
    COALESCE(bk.amount, 0) AS department_bucket_amount,
    COALESCE(bn.amount, 0) AS bonus_amount,
    COALESCE(adv.amount, 0) AS advance_amount,
    (
      COALESCE(bp.amount, 0)
      + COALESCE(os.amount, 0)
      + COALESCE(rf.amount, 0)
      + COALESCE(bk.amount, 0)
      + COALESCE(bn.amount, 0)
      - COALESCE(adv.amount, 0)
    ) AS total_amount
  FROM public.staff_roles sr
  JOIN public.persons p ON p.id = sr.person_id
  LEFT JOIN LATERAL (
    SELECT SUM(bpi.amount) AS amount
    FROM public.physician_base_pay_items bpi
    WHERE bpi.staff_role_id = sr.id
  ) bp ON true
  LEFT JOIN LATERAL (
    SELECT SUM(
      public.net_service_amount(vs.cost_at_time, vsd.discount_percent)
      * COALESCE(public.get_effective_scoped_rate(sr.id, v_own_type_id, s.service_type_id, vs.service_id, vs.completed_at), 0)
      / 100
    ) AS amount
    FROM public.visit_services vs
    JOIN public.service_statuses ss ON ss.id = vs.status_id
    JOIN public.services s ON s.id = vs.service_id
    LEFT JOIN public.visit_service_discounts vsd ON vsd.visit_service_id = vs.id
    WHERE vs.assigned_staff_role_id = sr.id
      AND ss.code = 'completed'
      AND vs.completed_at >= v_period_start
      AND vs.completed_at < v_period_end
  ) os ON true
  LEFT JOIN LATERAL (
    SELECT SUM(
      public.net_service_amount(vs.cost_at_time, vsd.discount_percent)
      * COALESCE(public.get_effective_scoped_rate(creator.staff_role_id, v_referral_type_id, s.service_type_id, vs.service_id, vs.completed_at), 0)
      / 100
    ) AS amount
    FROM public.visit_services vs
    JOIN public.service_statuses ss ON ss.id = vs.status_id
    JOIN public.services s ON s.id = vs.service_id
    JOIN public.profiles creator ON creator.id = vs.created_by
    LEFT JOIN public.visit_service_discounts vsd ON vsd.visit_service_id = vs.id
    WHERE ss.code = 'completed'
      AND vs.completed_at >= v_period_start
      AND vs.completed_at < v_period_end
      AND creator.staff_role_id = sr.id
      AND vs.assigned_staff_role_id IS NOT NULL
      AND vs.assigned_staff_role_id <> sr.id
  ) rf ON true
  LEFT JOIN LATERAL (
    SELECT SUM(
      public.get_payroll_bucket_revenue(pbm.bucket_id, v_period_start, v_period_end) * pbm.percent / 100
    ) AS amount
    FROM public.payroll_bucket_members pbm
    JOIN public.payroll_buckets pb ON pb.id = pbm.bucket_id AND pb.is_active
    WHERE pbm.staff_role_id = sr.id
  ) bk ON true
  LEFT JOIN LATERAL (
    SELECT SUM(pa.amount) AS amount
    FROM public.physician_payroll_adjustments pa
    WHERE pa.staff_role_id = sr.id AND pa.year = p_year AND pa.month = p_month AND pa.type = 'bonus'
  ) bn ON true
  LEFT JOIN LATERAL (
    SELECT SUM(pa.amount) AS amount
    FROM public.physician_payroll_adjustments pa
    WHERE pa.staff_role_id = sr.id AND pa.year = p_year AND pa.month = p_month AND pa.type = 'advance'
  ) adv ON true
  WHERE sr.hospital_id = p_hospital_id;
END;
$function$;

-- ------------------------------------------------------------ bucket revenue
create or replace function public.get_payroll_bucket_revenue(p_bucket_id uuid, p_period_start timestamp with time zone, p_period_end timestamp with time zone)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(SUM(public.net_service_amount(vs.cost_at_time, vsd.discount_percent)), 0)
  FROM public.visit_services vs
  JOIN public.service_statuses ss ON ss.id = vs.status_id
  JOIN public.services s ON s.id = vs.service_id
  LEFT JOIN public.visit_service_discounts vsd ON vsd.visit_service_id = vs.id
  WHERE ss.code = 'completed'
    AND vs.completed_at >= p_period_start
    AND vs.completed_at < p_period_end
    AND EXISTS (
      SELECT 1 FROM public.payroll_bucket_items bi
      WHERE bi.bucket_id = p_bucket_id
        AND (bi.service_id = vs.service_id OR (bi.service_id IS NULL AND bi.service_group_id = s.service_group_id))
    );
$function$;

create or replace function public.get_bucket_revenue_by_month(p_bucket_id uuid, p_months integer DEFAULT 12)
 RETURNS TABLE(month_start date, revenue numeric)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    date_trunc('month', m)::date AS month_start,
    COALESCE((
      SELECT SUM(public.net_service_amount(vs.cost_at_time, vsd.discount_percent))
      FROM public.visit_services vs
      JOIN public.service_statuses ss ON ss.id = vs.status_id
      JOIN public.services s ON s.id = vs.service_id
      LEFT JOIN public.visit_service_discounts vsd ON vsd.visit_service_id = vs.id
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
$function$;

-- ------------------------------------------------------------ revenue reports
-- Revenue is the net (discounted) amount, consistent with payroll.
create or replace view public.finance_revenue_report_items as
 SELECT vs.id AS visit_service_id,
    vs.hospital_id,
    COALESCE(vs.completed_at, vs.scheduled_at, vs.created_at) AS report_date,
    vs.status_id,
    ss.code AS service_status_code,
    ss.name_ru AS service_status_name,
    net_service_amount(vs.cost_at_time, vsd.discount_percent)::numeric(12,2) AS revenue,
    vs.service_id,
    s.name AS service_name,
    s.service_type_id,
    stt.name_ru AS service_type_name,
    s.service_group_id,
    sg.name AS service_group_name,
    s.service_subgroup_id,
    ssg.name AS service_subgroup_name,
        CASE
            WHEN vs.hospitalization_id IS NOT NULL THEN 'inpatient'::text
            ELSE 'outpatient'::text
        END AS op_ip,
        CASE
            WHEN vs.hospitalization_id IS NOT NULL THEN h.department_id
            ELSE sr_assigned.department_id
        END AS department_id,
    COALESCE(phys_sr.id, sr_assigned.id) AS physician_staff_role_id,
    COALESCE((phys_person.last_name || ' '::text) || phys_person.first_name, (assigned_person.last_name || ' '::text) || assigned_person.first_name, creator_profile.full_name) AS physician_name,
    ii.invoice_id,
        CASE
            WHEN ii.invoice_id IS NULL THEN 'not_paid'::text
            WHEN COALESCE(pay.paid_amount, 0::numeric) <= 0::numeric THEN 'not_paid'::text
            WHEN COALESCE(pay.paid_amount, 0::numeric) >= COALESCE(inv_total.total_amount, 0::numeric) THEN 'paid'::text
            ELSE 'in_progress'::text
        END AS payment_status,
    vs.patient_id,
    p.patient_number,
    p.first_name AS patient_first_name,
    p.last_name AS patient_last_name,
    p.date_of_birth AS patient_dob,
    h.hospitalization_number,
    inv.invoice_number,
    creator_profile.full_name AS referred_by_name,
    COALESCE(completed_by_profile.full_name, (phys_person.last_name || ' '::text) || phys_person.first_name, (assigned_person.last_name || ' '::text) || assigned_person.first_name) AS rendered_by_name,
    COALESCE(completed_by_profile.person_id, phys_sr.person_id, sr_assigned.person_id) AS rendered_by_person_id,
    completed_by_profile.id AS rendered_by_profile_id
   FROM visit_services vs
     JOIN service_statuses ss ON ss.id = vs.status_id
     JOIN services s ON s.id = vs.service_id
     LEFT JOIN service_types stt ON stt.id = s.service_type_id
     LEFT JOIN service_groups sg ON sg.id = s.service_group_id
     LEFT JOIN service_subgroups ssg ON ssg.id = s.service_subgroup_id
     LEFT JOIN hospitalizations h ON h.id = vs.hospitalization_id
     LEFT JOIN staff_roles sr_assigned ON sr_assigned.id = vs.assigned_staff_role_id
     LEFT JOIN persons assigned_person ON assigned_person.id = sr_assigned.person_id
     LEFT JOIN physicians phys ON phys.id = vs.assigned_physician_id
     LEFT JOIN staff_roles phys_sr ON phys_sr.id = phys.staff_role_id
     LEFT JOIN persons phys_person ON phys_person.id = phys_sr.person_id
     LEFT JOIN profiles creator_profile ON creator_profile.id = vs.created_by
     LEFT JOIN profiles completed_by_profile ON completed_by_profile.id = vs.completed_by
     LEFT JOIN patients p ON p.id = vs.patient_id
     LEFT JOIN invoice_items ii ON ii.visit_service_id = vs.id
     LEFT JOIN invoices inv ON inv.id = ii.invoice_id
     LEFT JOIN visit_service_discounts vsd ON vsd.visit_service_id = vs.id
     LEFT JOIN LATERAL ( SELECT sum(ii2.amount) AS total_amount
           FROM invoice_items ii2
          WHERE ii2.invoice_id = ii.invoice_id) inv_total ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(( SELECT sum(pay2.amount) AS sum
                   FROM payments pay2
                  WHERE pay2.invoice_id = ii.invoice_id AND pay2.is_refunded = false), 0::numeric) + COALESCE(( SELECT sum(dep2.amount) AS sum
                   FROM patient_deposit_ledger dep2
                  WHERE dep2.invoice_id = ii.invoice_id AND dep2.transaction_type = 'applied_to_invoice'::text), 0::numeric) AS paid_amount) pay ON true;

-- daily_report_service_items.cost_at_time feeds the daily revenue report: it now
-- carries the discounted amount (same meaning as "revenue" above).
create or replace view public.daily_report_service_items as
 SELECT vs.id,
    vs.hospital_id,
    vs.completed_at,
    net_service_amount(vs.cost_at_time, vsd.discount_percent)::numeric(12,2) AS cost_at_time,
    vs.patient_id,
    s.service_type_id,
    vs.service_id,
        CASE
            WHEN rt.name = 'Operating Room'::text THEN 'operating_room'::text
            WHEN vs.hospitalization_id IS NOT NULL THEN 'inpatient'::text
            ELSE 'outpatient'::text
        END AS bucket,
        CASE
            WHEN vs.hospitalization_id IS NOT NULL THEN h.department_id
            ELSE sr.department_id
        END AS department_id
   FROM visit_services vs
     JOIN service_statuses ss ON ss.id = vs.status_id
     JOIN services s ON s.id = vs.service_id
     LEFT JOIN rooms r ON r.id = vs.assigned_room_id
     LEFT JOIN room_types rt ON rt.id = r.room_type_id
     LEFT JOIN hospitalizations h ON h.id = vs.hospitalization_id
     LEFT JOIN staff_roles sr ON sr.id = vs.assigned_staff_role_id
     LEFT JOIN visit_service_discounts vsd ON vsd.visit_service_id = vs.id
  WHERE ss.code = 'completed'::text;
