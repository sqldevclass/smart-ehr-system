-- Room bed-day charges.
-- An inpatient service (service type code 'inpatient', e.g. «Койко-день …») can be attached to a room.
-- While a patient is assigned to the room, every calendar day he occupied a bed is charged once:
--   * the day of admission and the day of discharge both count; a same-day admit + discharge is one day
--   * a room move inside one day keeps that day's charge with the first room that has services
--   * a service added to a room is charged from the day it was added (no back-charge)
-- Charges are posted exactly like other inpatient orders (visit_service + invoice item on the hospitalization's active
-- invoice); a confirmed/paid invoice is never touched - a new active invoice receives the new days instead.
-- One idempotent function (_sync_room_stay_charges) is the single source of truth. It runs when an assignment starts or ends,
-- when an invoice is confirmed, when a money screen opens (sync_open_room_stay_charges) and hourly through pg_cron.

-- 1) hospital time zone: decides what "today" is --------------------------------------------------------------------------
alter table public.hospitals add column timezone text not null default 'Asia/Tashkent';

-- 2) charges are told apart from physician orders -----------------------------------------------------------------------
alter table public.visit_services drop constraint visit_services_source_check;
alter table public.visit_services add constraint visit_services_source_check
  check (source = any (array['registrar', 'physician', 'call_center', 'inpatient_physician', 'room_stay']));

-- 3) room <-> service ------------------------------------------------------------------------------------------------------
create table public.room_services (
  room_id        uuid not null references public.rooms(id) on delete cascade,
  service_id     uuid not null references public.services(id),
  hospital_id    uuid not null references public.hospitals(id),
  effective_from date not null,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  primary key (room_id, service_id)
);
create index room_services_hospital_idx on public.room_services (hospital_id);
alter table public.room_services enable row level security;
revoke all on public.room_services from anon;
revoke insert, update, delete on public.room_services from authenticated;
create policy room_services_select on public.room_services for select to authenticated
  using (hospital_id = get_my_hospital_id());

-- 4) ledger: one row per posted service per day (guarantees no double charge) ---------------------------------------------------
create table public.room_stay_charges (
  id                 uuid primary key default gen_random_uuid(),
  hospital_id        uuid not null references public.hospitals(id),
  hospitalization_id uuid not null references public.hospitalizations(id),
  charge_date        date not null,
  room_id            uuid not null references public.rooms(id),
  service_id         uuid not null references public.services(id),
  visit_service_id   uuid not null references public.visit_services(id),
  invoice_item_id    uuid references public.invoice_items(id) on delete set null,
  amount             numeric not null,
  created_at         timestamptz not null default now(),
  unique (hospitalization_id, charge_date, service_id)
);
create index room_stay_charges_hosp_idx on public.room_stay_charges (hospitalization_id, charge_date);
alter table public.room_stay_charges enable row level security;
revoke all on public.room_stay_charges from anon, authenticated;

-- 5) attach / detach (settings managers only; the rule "inpatient services only" is enforced here, not in the UI) -----------------
create or replace function public.add_room_service(p_room_id uuid, p_service_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id(); v_tz text; v_ok boolean;
begin
  if not has_permission('system.manage_settings') then raise exception 'Нет прав на изменение структуры клиники'; end if;
  select r.is_active and r.capacity > 0 and not coalesce(rt.is_office_room, false) into v_ok
    from rooms r left join room_types rt on rt.id = r.room_type_id
    where r.id = p_room_id and r.hospital_id = v_hosp;
  if v_ok is null then raise exception 'Палата не найдена'; end if;
  if not v_ok then raise exception 'Услуги можно привязывать только к активным палатам с койками'; end if;
  if not exists (select 1 from services s join service_types t on t.id = s.service_type_id
                 where s.id = p_service_id and s.hospital_id = v_hosp and s.is_active and t.code = 'inpatient') then
    raise exception 'Можно привязать только активную услугу типа «Стационар»'; end if;
  if exists (select 1 from room_services where room_id = p_room_id and service_id = p_service_id) then
    raise exception 'Эта услуга уже привязана к палате'; end if;
  select timezone into v_tz from hospitals where id = v_hosp;
  insert into room_services (room_id, service_id, hospital_id, effective_from, created_by)
  values (p_room_id, p_service_id, v_hosp, (now() at time zone v_tz)::date, auth.uid());
end $$;

create or replace function public.remove_room_service(p_room_id uuid, p_service_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id();
begin
  if not has_permission('system.manage_settings') then raise exception 'Нет прав на изменение структуры клиники'; end if;
  delete from room_services where room_id = p_room_id and service_id = p_service_id and hospital_id = v_hosp;
  if not found then raise exception 'Услуга у палаты не найдена'; end if;
end $$;

-- 6) the formula: post every missing day of one hospitalization ------------------------------------------------------------------
create or replace function public._sync_room_stay_charges(p_hospitalization_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_h record; v_tz text; v_today date; v_invoice uuid; v_uid uuid := auth.uid();
  r record; v_vs uuid; v_item uuid; v_n integer := 0; v_status uuid;
begin
  select h.id, h.hospital_id, h.patient_id into v_h from hospitalizations h where h.id = p_hospitalization_id;
  if not found then return 0; end if;
  perform pg_advisory_xact_lock(hashtextextended('room_stay:' || p_hospitalization_id::text, 0));
  select timezone into v_tz from hospitals where id = v_h.hospital_id;
  v_today := (now() at time zone v_tz)::date;
  select id into v_status from service_statuses where code = 'completed';
  if v_status is null then raise exception 'Статус completed не найден'; end if;

  for r in
    with a as (
      select ra.room_id, ra.assigned_at,
             (ra.assigned_at at time zone v_tz)::date as d0,
             (coalesce(ra.discharged_at, now()) at time zone v_tz)::date as d1
      from room_assignments ra where ra.hospitalization_id = p_hospitalization_id
    ), pick as (
      -- per day: the earliest room of that day that has services attached
      select distinct on (g.d::date) g.d::date as charge_date, a.room_id
      from a
      cross join lateral generate_series(a.d0::timestamp, least(a.d1, v_today)::timestamp, interval '1 day') g(d)
      where exists (select 1 from room_services rs join services s on s.id = rs.service_id
                    where rs.room_id = a.room_id and rs.effective_from <= g.d::date and s.is_active)
      order by g.d::date, a.assigned_at
    )
    select p.charge_date, p.room_id, rs.service_id, s.name, s.cost_with_vat
    from pick p
    join room_services rs on rs.room_id = p.room_id and rs.effective_from <= p.charge_date
    join services s on s.id = rs.service_id and s.is_active
    where not exists (select 1 from room_stay_charges c
                      where c.hospitalization_id = p_hospitalization_id and c.charge_date = p.charge_date)
    order by p.charge_date, s.name
  loop
    if v_invoice is null then
      select id into v_invoice from invoices
        where hospitalization_id = p_hospitalization_id and hospital_id = v_h.hospital_id and status = 'active' limit 1;
      if v_invoice is null then
        insert into invoices (hospitalization_id, hospital_id, created_by, status)
        values (p_hospitalization_id, v_h.hospital_id, v_uid, 'active') returning id into v_invoice;
      end if;
    end if;
    insert into visit_services (visit_id, patient_id, hospital_id, hospitalization_id, service_id, status_id, source,
                                cost_at_time, created_by, completed_at)
    values (null, v_h.patient_id, v_h.hospital_id, p_hospitalization_id, r.service_id, v_status, 'room_stay',
            r.cost_with_vat, v_uid, now())
    returning id into v_vs;
    insert into invoice_items (invoice_id, visit_service_id, amount, description)
    values (v_invoice, v_vs, r.cost_with_vat, r.name || ' — ' || to_char(r.charge_date, 'DD.MM.YYYY'))
    returning id into v_item;
    insert into room_stay_charges (hospital_id, hospitalization_id, charge_date, room_id, service_id,
                                   visit_service_id, invoice_item_id, amount)
    values (v_h.hospital_id, p_hospitalization_id, r.charge_date, r.room_id, r.service_id, v_vs, v_item, r.cost_with_vat);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- hospital-wide entry points -------------------------------------------------------------------------------------------------
create or replace function public.sync_open_room_stay_charges()
returns integer language plpgsql security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id(); h uuid; v_n integer := 0;
begin
  if auth.uid() is null or v_hosp is null then raise exception 'Unauthorized'; end if;
  for h in select distinct hospitalization_id from room_assignments where hospital_id = v_hosp and discharged_at is null loop
    v_n := v_n + _sync_room_stay_charges(h);
  end loop;
  return v_n;
end $$;

create or replace function public._sync_all_room_stay_charges()
returns integer language plpgsql security definer set search_path = public as $$
declare h uuid; v_n integer := 0;
begin
  for h in select distinct hospitalization_id from room_assignments where discharged_at is null loop
    begin
      v_n := v_n + _sync_room_stay_charges(h);
    exception when others then
      raise warning 'room stay sync failed for %: %', h, sqlerrm;
    end;
  end loop;
  return v_n;
end $$;

-- 7) when an assignment starts, moves or ends. A billing hiccup must never block admission or discharge: the next sync catches up.
create or replace function public._trg_room_assignment_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform _sync_room_stay_charges(new.hospitalization_id);
  exception when others then
    raise warning 'room stay sync failed for %: %', new.hospitalization_id, sqlerrm;
  end;
  return null;
end $$;
create trigger room_assignments_charge_sync after insert or update of discharged_at, room_id on public.room_assignments
  for each row execute function public._trg_room_assignment_sync();

-- 8) confirming an invoice: bring the days up to date first, so the confirmed amount is exact -------------------------------------
create or replace function public.confirm_hospitalization_invoice(p_invoice_id uuid, p_confirmed_by uuid)
returns invoices language plpgsql security definer set search_path = public as $$
declare v_invoice public.invoices; v_hosp_id uuid;
begin
  select hospitalization_id into v_hosp_id from public.invoices where id = p_invoice_id;
  if v_hosp_id is not null then perform public._sync_room_stay_charges(v_hosp_id); end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found: %', p_invoice_id; end if;
  if v_invoice.status != 'active' then
    raise exception 'Only an active invoice can be confirmed (current status: %)', v_invoice.status;
  end if;
  update public.invoices set status = 'confirmed' where id = p_invoice_id returning * into v_invoice;
  return v_invoice;
exception when others then
  raise exception 'confirm_hospitalization_invoice failed: %', sqlerrm;
end $$;

-- 9) grants ------------------------------------------------------------------------------------------------------------------------
revoke execute on function public._sync_room_stay_charges(uuid), public._sync_all_room_stay_charges(), public._trg_room_assignment_sync()
  from public, anon, authenticated;
revoke execute on function public.add_room_service(uuid, uuid), public.remove_room_service(uuid, uuid),
  public.sync_open_room_stay_charges() from public, anon;
grant  execute on function public.add_room_service(uuid, uuid), public.remove_room_service(uuid, uuid),
  public.sync_open_room_stay_charges() to authenticated;

-- 10) safety net: the same idempotent sync every hour (time zones differ per hospital, so hourly, not once a day)
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('room-stay-charges-sync', '5 * * * *', 'select public._sync_all_room_stay_charges()');
  end if;
end $cron$;
