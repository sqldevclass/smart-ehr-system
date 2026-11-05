-- Инвентаризация: end-of-life date, per-unit warning periods, department inventory reader.
--  * end_of_life_date is optional (a warning only, never part of the "ready" gate, nothing is written off automatically)
--  * warning periods are stored in days: 15 / 30 (1m) / 90 (3m) / 180 (6m) / 365 (1y)

-- 1) schema -------------------------------------------------------------------------------------------
alter table public.equipment
  add column end_of_life_date          date,
  add column service_notice_days       integer not null default 30  check (service_notice_days       in (15, 30, 90, 180, 365)),
  add column warranty_notice_days      integer not null default 90  check (warranty_notice_days      in (15, 30, 90, 180, 365)),
  add column end_of_life_notice_days   integer not null default 90  check (end_of_life_notice_days   in (15, 30, 90, 180, 365));

-- 2) complete_equipment_info: the same RPC fills and edits the unit; new optional parameters keep the rule set in one place
drop function public.complete_equipment_info(uuid, text, text, uuid, date, date, integer, text);

create or replace function public.complete_equipment_info(
  p_equipment_id uuid, p_model text, p_serial_number text, p_manufacturer_id uuid,
  p_warranty_expiry_date date, p_next_service_date date, p_service_interval_days integer, p_notes text,
  p_end_of_life_date date default null,
  p_service_notice_days integer default 30, p_warranty_notice_days integer default 90, p_end_of_life_notice_days integer default 90)
returns void language plpgsql security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid(); e record; v_serial text := nullif(btrim(p_serial_number), '');
begin
  if not has_permission('inventory.manage') then raise exception 'Нет прав на заполнение информации об оборудовании'; end if;
  select * into e from equipment where id = p_equipment_id and hospital_id = v_hosp for update;
  if not found then raise exception 'Оборудование не найдено'; end if;
  if not e.is_active then raise exception 'Оборудование неактивно'; end if;
  if v_serial is null then raise exception 'Укажите серийный номер'; end if;
  if p_warranty_expiry_date is null then raise exception 'Укажите окончание гарантии'; end if;
  if p_next_service_date is null then raise exception 'Укажите дату следующего обслуживания'; end if;
  if p_service_interval_days is null or p_service_interval_days < 1 or p_service_interval_days > 3650 then
    raise exception 'Интервал обслуживания: от 1 до 3650 дней'; end if;
  if e.info_status = 'pending' and p_next_service_date < current_date then
    raise exception 'Дата следующего обслуживания не может быть в прошлом'; end if;
  if p_end_of_life_date is not null and e.purchase_date is not null and p_end_of_life_date < e.purchase_date then
    raise exception 'Срок службы не может заканчиваться раньше даты закупки'; end if;
  if coalesce(p_service_notice_days, 0) not in (15, 30, 90, 180, 365)
     or coalesce(p_warranty_notice_days, 0) not in (15, 30, 90, 180, 365)
     or coalesce(p_end_of_life_notice_days, 0) not in (15, 30, 90, 180, 365) then
    raise exception 'Недопустимый срок предупреждения'; end if;
  if p_manufacturer_id is not null and not exists (select 1 from manufacturers where id = p_manufacturer_id and hospital_id = v_hosp) then
    raise exception 'Производитель не найден'; end if;
  begin
    update equipment set
      model = nullif(btrim(p_model), ''), serial_number = v_serial, manufacturer_id = p_manufacturer_id,
      warranty_expiry_date = p_warranty_expiry_date, next_service_date = p_next_service_date,
      service_interval_days = p_service_interval_days, notes = nullif(btrim(p_notes), ''),
      end_of_life_date = p_end_of_life_date,
      service_notice_days = p_service_notice_days, warranty_notice_days = p_warranty_notice_days,
      end_of_life_notice_days = p_end_of_life_notice_days,
      info_status = 'ready',
      info_completed_at = coalesce(e.info_completed_at, now()),
      info_completed_by = coalesce(e.info_completed_by, v_uid)
    where id = e.id;
  exception when unique_violation then
    raise exception 'Оборудование с таким серийным номером уже есть';
  end;
end $$;

revoke execute on function public.complete_equipment_info(uuid, text, text, uuid, date, date, integer, text, date, integer, integer, integer) from public, anon;
grant  execute on function public.complete_equipment_info(uuid, text, text, uuid, date, date, integer, text, date, integer, integer, integer) to authenticated;

-- 3) department inventory reader (nurses have no inventory.view, so the table stays closed; no price on purpose) ----------------
create or replace function public.list_department_inventory(p_warehouse_id uuid)
returns table (equipment_id uuid, name text, model text, serial_number text, info_status text,
               next_service_date date, warranty_expiry_date date, end_of_life_date date,
               service_notice_days integer, warranty_notice_days integer, end_of_life_notice_days integer)
language plpgsql stable security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id();
begin
  if not can_access_warehouse(p_warehouse_id) then raise exception 'Нет доступа к складу'; end if;
  return query
  select e.id, e.name, e.model, e.serial_number, e.info_status,
         e.next_service_date, e.warranty_expiry_date, e.end_of_life_date,
         e.service_notice_days, e.warranty_notice_days, e.end_of_life_notice_days
  from equipment e
  where e.hospital_id = v_hosp and e.warehouse_id = p_warehouse_id and e.is_active and e.transit_transfer_id is null
  order by e.name, e.serial_number nulls last, e.id;
end $$;

revoke execute on function public.list_department_inventory(uuid) from public, anon;
grant  execute on function public.list_department_inventory(uuid) to authenticated;
