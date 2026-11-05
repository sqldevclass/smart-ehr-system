-- Clinic structure: Block -> Floor -> Department -> Room -> Bed.
-- Blocks and floors are new tables; rooms, departments and warehouses point to a floor (nullable: existing rows are assigned in the UI).
-- A bed stays "capacity + bed_number" for now (no beds table).

create table public.clinic_blocks (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id),
  name        text not null check (btrim(name) <> ''),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index clinic_blocks_hospital_name_uq on public.clinic_blocks (hospital_id, lower(btrim(name)));

create table public.clinic_floors (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id),
  block_id    uuid not null references public.clinic_blocks(id) on delete cascade,
  number      integer not null check (number between -10 and 200),
  label       text,
  created_at  timestamptz not null default now(),
  unique (block_id, number)
);
create index clinic_floors_hospital_idx on public.clinic_floors (hospital_id);

alter table public.rooms       add column floor_id uuid references public.clinic_floors(id) on delete restrict;
alter table public.departments add column floor_id uuid references public.clinic_floors(id) on delete restrict;
alter table public.warehouses  add column floor_id uuid references public.clinic_floors(id) on delete restrict;
create index rooms_floor_idx       on public.rooms (floor_id)       where floor_id is not null;
create index departments_floor_idx on public.departments (floor_id) where floor_id is not null;
create index warehouses_floor_idx  on public.warehouses (floor_id)  where floor_id is not null;

-- RLS: everyone in the hospital reads; only settings managers write. Blocks are deactivated, never deleted.
alter table public.clinic_blocks enable row level security;
alter table public.clinic_floors enable row level security;
revoke all on public.clinic_blocks, public.clinic_floors from anon;

create policy clinic_blocks_select on public.clinic_blocks for select to authenticated
  using (hospital_id = get_my_hospital_id());
create policy clinic_blocks_insert on public.clinic_blocks for insert to authenticated
  with check (hospital_id = get_my_hospital_id() and has_permission('system.manage_settings'));
create policy clinic_blocks_update on public.clinic_blocks for update to authenticated
  using (hospital_id = get_my_hospital_id())
  with check (hospital_id = get_my_hospital_id() and has_permission('system.manage_settings'));

create policy clinic_floors_select on public.clinic_floors for select to authenticated
  using (hospital_id = get_my_hospital_id());
create policy clinic_floors_insert on public.clinic_floors for insert to authenticated
  with check (hospital_id = get_my_hospital_id() and has_permission('system.manage_settings'));
create policy clinic_floors_update on public.clinic_floors for update to authenticated
  using (hospital_id = get_my_hospital_id())
  with check (hospital_id = get_my_hospital_id() and has_permission('system.manage_settings'));
create policy clinic_floors_delete on public.clinic_floors for delete to authenticated
  using (hospital_id = get_my_hospital_id() and has_permission('system.manage_settings'));

-- Guards ---------------------------------------------------------------------------------------
-- a floor must belong to the same hospital as its block
create or replace function public._guard_floor_block()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from clinic_blocks b where b.id = new.block_id and b.hospital_id = new.hospital_id) then
    raise exception 'Блок не найден';
  end if;
  return new;
end $$;
create trigger clinic_floors_block_guard before insert or update of block_id, hospital_id on public.clinic_floors
  for each row execute function public._guard_floor_block();

-- a room / department / warehouse can only point to a floor of its own hospital
create or replace function public._guard_floor_hospital()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.floor_id is not null and not exists (
       select 1 from clinic_floors f where f.id = new.floor_id and f.hospital_id = new.hospital_id) then
    raise exception 'Этаж не найден';
  end if;
  return new;
end $$;
create trigger rooms_floor_guard       before insert or update of floor_id on public.rooms       for each row execute function public._guard_floor_hospital();
create trigger departments_floor_guard before insert or update of floor_id on public.departments for each row execute function public._guard_floor_hospital();
create trigger warehouses_floor_guard  before insert or update of floor_id on public.warehouses  for each row execute function public._guard_floor_hospital();

-- a floor that is still used cannot be deleted (also covers the block cascade); tell the user what uses it
create or replace function public._guard_floor_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_r int; v_d int; v_w int;
begin
  select count(*) into v_r from rooms       where floor_id = old.id;
  select count(*) into v_d from departments where floor_id = old.id;
  select count(*) into v_w from warehouses  where floor_id = old.id;
  if v_r + v_d + v_w > 0 then
    raise exception 'Этаж используется: палат %, отделений %, складов %. Сначала переназначьте их.', v_r, v_d, v_w;
  end if;
  return old;
end $$;
create trigger clinic_floors_delete_guard before delete on public.clinic_floors
  for each row execute function public._guard_floor_delete();

-- Create a block together with its floors 1..N in one transaction ----------------------------------
create or replace function public.create_clinic_block(p_name text, p_floors integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id(); v_id uuid;
begin
  if not has_permission('system.manage_settings') then raise exception 'Нет прав на изменение структуры клиники'; end if;
  if p_name is null or btrim(p_name) = '' then raise exception 'Укажите название блока'; end if;
  if p_floors is null or p_floors < 1 or p_floors > 100 then raise exception 'Количество этажей: от 1 до 100'; end if;
  begin
    insert into clinic_blocks (hospital_id, name) values (v_hosp, btrim(p_name)) returning id into v_id;
  exception when unique_violation then
    raise exception 'Блок с таким названием уже существует';
  end;
  insert into clinic_floors (hospital_id, block_id, number)
  select v_hosp, v_id, g from generate_series(1, p_floors) g;
  return v_id;
end $$;
revoke execute on function public.create_clinic_block(text, integer) from public, anon;
grant  execute on function public.create_clinic_block(text, integer) to authenticated;

revoke execute on function public._guard_floor_block(), public._guard_floor_hospital(), public._guard_floor_delete() from public, anon, authenticated;
