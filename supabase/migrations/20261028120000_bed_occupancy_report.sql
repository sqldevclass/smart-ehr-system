-- Daily report: "Загруженность палат и коек" (ward and bed occupancy, live snapshot).
--
-- Beds are implicit: rooms.capacity = number of beds, room_assignments.bed_number = bed 1..N.
-- A bed is occupied while its active room_assignment (discharged_at is null) exists.
--
--   1. Integrity: one active patient per bed and one active bed per hospitalization (partial
--      unique indexes), after closing a duplicate active assignment found in existing data.
--   2. get_bed_occupancy(hospital) returns ONE ROW PER BED, vacant beds included.
--      Inpatient beds only: active rooms with capacity > 0 that are not office rooms and not
--      operating / laboratory / imaging rooms (operating rooms have their own utilization report).
--   3. Own view permission, same roles as the other daily report tabs.

-- ------------------------------------------------------------ integrity
-- Existing data: a hospitalization can hold only ONE active bed. Where a patient has several
-- active assignments (e.g. a double submit), the latest one is current; earlier ones are closed
-- at the moment the next one started. Nothing is deleted.
update public.room_assignments ra
set discharged_at = x.next_assigned_at
from (
  select id,
         lead(assigned_at) over (partition by hospitalization_id order by assigned_at, id) as next_assigned_at
  from public.room_assignments
  where discharged_at is null
) x
where ra.id = x.id
  and x.next_assigned_at is not null;

-- One active patient per bed, and one active bed per hospitalization.
create unique index if not exists room_assignments_active_bed_uq
  on public.room_assignments (room_id, bed_number)
  where discharged_at is null;

create unique index if not exists room_assignments_active_hosp_uq
  on public.room_assignments (hospitalization_id)
  where discharged_at is null;

-- ------------------------------------------------------------ permission
insert into public.permissions (code, name_ru, name_en, module)
select 'reports.view_bed_occupancy', 'Просмотр загруженности палат и коек', 'View ward and bed occupancy', 'reports'
where not exists (select 1 from public.permissions p where p.code = 'reports.view_bed_occupancy');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'reports.view_bed_occupancy'
where r.code in ('admin', 'senior_manager', 'finance')
  and not exists (
    select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id
  );

-- ------------------------------------------------------------ report function
create or replace function public.get_bed_occupancy(p_hospital_id uuid)
returns table(
  department_id uuid, department_name text,
  room_id uuid, room_name text, room_type_name text, capacity integer,
  bed_number integer, is_occupied boolean,
  hospitalization_id uuid, hospitalization_number text,
  patient_id uuid, patient_number text, last_name text, first_name text,
  assigned_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.has_permission('reports.view_bed_occupancy') then
    raise exception 'Not authorized to view bed occupancy';
  end if;
  if p_hospital_id is distinct from public.get_my_hospital_id() then
    raise exception 'Not authorized to view bed occupancy';
  end if;

  return query
  select d.id, d.name,
         r.id, r.name, rt.name, r.capacity,
         b.n,
         ra.id is not null,
         h.id, h.hospitalization_number,
         pt.id, pt.patient_number, pt.last_name, pt.first_name,
         ra.assigned_at
  from public.rooms r
  join public.room_types rt on rt.id = r.room_type_id
  left join public.departments d on d.id = r.department_id
  cross join lateral generate_series(1, r.capacity) as b(n)
  left join public.room_assignments ra
         on ra.room_id = r.id and ra.bed_number = b.n and ra.discharged_at is null
  left join public.hospitalizations h on h.id = ra.hospitalization_id
  left join public.patients pt on pt.id = h.patient_id
  where r.hospital_id = p_hospital_id
    and r.is_active
    and r.capacity > 0
    and not rt.is_office_room
    and rt.name not in ('Operating Room', 'Laboratory', 'Imaging')
  order by d.name nulls last, r.name, b.n;
end;
$$;

revoke execute on function public.get_bed_occupancy(uuid) from public, anon;
grant execute on function public.get_bed_occupancy(uuid) to authenticated;
