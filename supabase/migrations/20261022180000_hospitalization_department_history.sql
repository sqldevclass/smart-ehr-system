-- Department history per hospitalization.
-- hospitalizations.department_id only stores the CURRENT department (overwritten on
-- every move), so "who was moved into ICU, from where, when" could not be answered.
-- This table keeps one row per stay in a department; it is maintained by triggers
-- (so it is correct no matter which screen changes the department) and is read-only
-- for application users.
--
--   INSERT hospitalization        -> opens the first row (entered_at = admitted_at)
--   department_id changes         -> closes the open row, opens a new one
--   discharged_at is set          -> closes the open row at the discharge time
--
-- Backfill replays public.audit_logs (every hospitalizations INSERT/UPDATE has been
-- logged with old/new values), so real past moves are recovered, not just the
-- current state.

create table public.hospitalization_department_history (
  id                 uuid primary key default gen_random_uuid(),
  hospital_id        uuid not null references public.hospitals(id) on delete cascade,
  hospitalization_id uuid not null references public.hospitalizations(id) on delete cascade,
  department_id      uuid not null references public.departments(id),
  entered_at         timestamptz not null,
  left_at            timestamptz,
  moved_by           uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint hdh_left_after_entered check (left_at is null or left_at >= entered_at)
);

create index hdh_hospitalization_idx on public.hospitalization_department_history (hospitalization_id, entered_at);
create index hdh_dept_entered_idx    on public.hospitalization_department_history (hospital_id, department_id, entered_at);
-- At most one open (current) row per hospitalization.
create unique index hdh_one_open_per_hospitalization
  on public.hospitalization_department_history (hospitalization_id) where left_at is null;

alter table public.hospitalization_department_history enable row level security;

create policy hdh_select on public.hospitalization_department_history
  for select to authenticated
  using (hospital_id = public.get_my_hospital_id());

-- Written only by the trigger functions below (SECURITY DEFINER).
revoke all on public.hospitalization_department_history from anon;
revoke insert, update, delete, truncate, references, trigger on public.hospitalization_department_history from authenticated;

-- ---------------------------------------------------------------- triggers
create or replace function public.track_hospitalization_department()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  select id into v_actor from public.profiles where id = auth.uid();

  if tg_op = 'INSERT' then
    insert into public.hospitalization_department_history
      (hospital_id, hospitalization_id, department_id, entered_at, moved_by)
    values
      (new.hospital_id, new.id, new.department_id, coalesce(new.admitted_at, now()),
       coalesce(v_actor, (select id from public.profiles where id = new.admitted_by)));
    return new;
  end if;

  -- UPDATE
  if new.department_id is distinct from old.department_id then
    update public.hospitalization_department_history
       set left_at = greatest(now(), entered_at)
     where hospitalization_id = new.id and left_at is null;

    insert into public.hospitalization_department_history
      (hospital_id, hospitalization_id, department_id, entered_at, moved_by)
    values (new.hospital_id, new.id, new.department_id, now(), v_actor);
  end if;

  if new.discharged_at is not null and old.discharged_at is null then
    update public.hospitalization_department_history
       set left_at = greatest(new.discharged_at, entered_at)
     where hospitalization_id = new.id and left_at is null;
  end if;

  return new;
end;
$$;

revoke execute on function public.track_hospitalization_department() from public, anon, authenticated;

create trigger hospitalizations_track_department
  after insert or update of department_id, discharged_at on public.hospitalizations
  for each row execute function public.track_hospitalization_department();

-- ---------------------------------------------------------------- backfill
-- 1) Replay the audit log: each INSERT, and each UPDATE that changed department_id,
--    starts a stay that lasts until the next such event (or the discharge).
with ev as (
  select a.record_id as hosp_id,
         a.hospital_id,
         (a.new_values ->> 'department_id')::uuid as dept,
         case when a.operation = 'INSERT'
              then coalesce((a.new_values ->> 'admitted_at')::timestamptz, a.performed_at)
              else a.performed_at end as entered_at,
         a.performed_by
  from public.audit_logs a
  where a.table_name = 'hospitalizations'
    and (a.operation = 'INSERT'
         or (a.operation = 'UPDATE'
             and a.old_values ->> 'department_id' is distinct from a.new_values ->> 'department_id'))
), seq as (
  select ev.*, lead(ev.entered_at) over (partition by ev.hosp_id order by ev.entered_at) as next_at
  from ev
)
insert into public.hospitalization_department_history
  (hospital_id, hospitalization_id, department_id, entered_at, left_at, moved_by)
select s.hospital_id, s.hosp_id, s.dept, s.entered_at,
       greatest(coalesce(s.next_at, h.discharged_at), s.entered_at),
       p.id
from seq s
join public.hospitalizations h on h.id = s.hosp_id
left join public.profiles p on p.id = s.performed_by
where s.dept is not null;

-- 2) Safety net: any hospitalization the audit log did not cover gets one row
--    from its current department.
insert into public.hospitalization_department_history
  (hospital_id, hospitalization_id, department_id, entered_at, left_at, moved_by)
select h.hospital_id, h.id, h.department_id, coalesce(h.admitted_at, h.created_at), h.discharged_at,
       (select p.id from public.profiles p where p.id = h.admitted_by)
from public.hospitalizations h
where not exists (
  select 1 from public.hospitalization_department_history x where x.hospitalization_id = h.id
);
