-- Инвентаризация, step 1:
--  * receiving a product of type «Инвентарь» creates one equipment unit per piece (status «ожидает информации»)
--  * the inventory manager completes the mandatory info per unit (complete_equipment_info)
--  * inventory products carry no markup / min stock / expiry warning / stale threshold
--  * permissions inventory.view / inventory.manage
--  * until step 2 (unit-level transfers and write-offs) the server refuses to move or write off inventory items

-- 1) permissions ----------------------------------------------------------------------------------
insert into public.permissions (code, module, access_type, name_ru, name_en)
select v.code, 'warehouse', v.access_type, v.name_ru, v.name_en
from (values
  ('inventory.view',   'read',  'Просмотр инвентаря',    'View inventory'),
  ('inventory.manage', 'write', 'Управление инвентарём', 'Manage inventory')
) v(code, access_type, name_ru, name_en)
where not exists (select 1 from public.permissions p where p.code = v.code);

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join (values
  ('admin', 'inventory.view'), ('warehouse_staff', 'inventory.view'), ('inventory_manager', 'inventory.view'), ('finance', 'inventory.view'),
  ('admin', 'inventory.manage'), ('inventory_manager', 'inventory.manage')
) g(role_code, perm_code) on g.role_code = r.code
join public.permissions p on p.code = g.perm_code
where not exists (select 1 from public.role_permissions x where x.role_id = r.id and x.permission_id = p.id);

-- 2) equipment = one row per physical unit ------------------------------------------------------------
-- (the table is empty; its location is now the warehouse, the department is derived from it)
alter table public.equipment drop column department_id;
alter table public.equipment
  add column product_id         uuid not null references public.products(id),
  add column warehouse_id       uuid not null references public.warehouses(id),
  add column supplier_id        uuid references public.suppliers(id),
  add column received_batch_id  uuid references public.inventory_batches(id),
  add column info_status        text not null default 'pending' check (info_status in ('pending', 'ready')),
  add column info_completed_at  timestamptz,
  add column info_completed_by  uuid references public.profiles(id);

alter table public.equipment add constraint equipment_ready_requires_info check (
  info_status = 'pending' or (
    nullif(btrim(serial_number), '') is not null
    and next_service_date is not null
    and warranty_expiry_date is not null
    and service_interval_days is not null and service_interval_days > 0));

create unique index equipment_hospital_serial_uq on public.equipment (hospital_id, lower(btrim(serial_number))) where serial_number is not null;
create index equipment_product_idx   on public.equipment (product_id);
create index equipment_warehouse_idx on public.equipment (warehouse_id);
create index equipment_status_idx    on public.equipment (hospital_id, info_status);

-- 3) RLS: units are created only by receive_stock and edited only by complete_equipment_info -----------------
drop policy equipment_insert on public.equipment;
drop policy equipment_update on public.equipment;
drop policy equipment_select on public.equipment;
create policy equipment_select on public.equipment for select to authenticated
  using (hospital_id = get_my_hospital_id() and (has_permission('inventory.view') or has_permission('inventory.manage')));

drop policy equipment_service_records_insert on public.equipment_service_records;
drop policy equipment_service_records_select on public.equipment_service_records;
create policy equipment_service_records_select on public.equipment_service_records for select to authenticated
  using (hospital_id = get_my_hospital_id() and (has_permission('inventory.view') or has_permission('inventory.manage')));
create policy equipment_service_records_insert on public.equipment_service_records for insert to authenticated
  with check (hospital_id = get_my_hospital_id() and has_permission('inventory.manage')
    and exists (select 1 from public.equipment e
                where e.id = equipment_service_records.equipment_id
                  and e.hospital_id = equipment_service_records.hospital_id
                  and e.info_status = 'ready'));

-- 4) complete (or later edit) the unit's info ---------------------------------------------------------------
create or replace function public.complete_equipment_info(
  p_equipment_id uuid, p_model text, p_serial_number text, p_manufacturer_id uuid,
  p_warranty_expiry_date date, p_next_service_date date, p_service_interval_days integer, p_notes text)
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
  if p_manufacturer_id is not null and not exists (select 1 from manufacturers where id = p_manufacturer_id and hospital_id = v_hosp) then
    raise exception 'Производитель не найден'; end if;
  begin
    update equipment set
      model = nullif(btrim(p_model), ''), serial_number = v_serial, manufacturer_id = p_manufacturer_id,
      warranty_expiry_date = p_warranty_expiry_date, next_service_date = p_next_service_date,
      service_interval_days = p_service_interval_days, notes = nullif(btrim(p_notes), ''),
      info_status = 'ready',
      info_completed_at = coalesce(e.info_completed_at, now()),
      info_completed_by = coalesce(e.info_completed_by, v_uid)
    where id = e.id;
  exception when unique_violation then
    raise exception 'Оборудование с таким серийным номером уже есть';
  end;
end $$;
revoke execute on function public.complete_equipment_info(uuid, text, text, uuid, date, date, integer, text) from public, anon;
grant  execute on function public.complete_equipment_info(uuid, text, text, uuid, date, date, integer, text) to authenticated;

-- 5) receiving an inventory product creates the units ---------------------------------------------------------
create or replace function public.receive_stock(
  p_warehouse_id uuid, p_product_id uuid, p_drug_formulary_id uuid, p_supplier_id uuid, p_series_number text,
  p_expiry_date date, p_quantity_units numeric, p_purchase_price numeric, p_vat_included boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid(); v_code text; v_active boolean; v_batch uuid; v_markup numeric;
  v_pname text; v_pmanuf uuid; v_is_inventory boolean := false;
begin
  if not has_permission('warehouse.receive_incoming') then raise exception 'Нет прав на приход товара'; end if;
  select wt.code, w.is_active into v_code, v_active
    from warehouses w join warehouse_types wt on wt.id = w.warehouse_type_id
    where w.id = p_warehouse_id and w.hospital_id = v_hosp;
  if v_code is null then raise exception 'Склад не найден'; end if;
  if not v_active then raise exception 'Склад неактивен'; end if;
  if v_code = 'department' then raise exception 'Приход на склад отделения невозможен — используйте перемещение'; end if;
  if (p_product_id is null) = (p_drug_formulary_id is null) then raise exception 'Укажите либо препарат, либо товар'; end if;
  if v_code = 'central_pharmacy' and p_drug_formulary_id is null then raise exception 'В аптеку принимаются только препараты'; end if;
  if v_code = 'general' and p_product_id is null then raise exception 'На общий склад принимаются только товары'; end if;
  if p_product_id is not null then
    select p.markup_percent, p.name, p.manufacturer_id, (pt.code = 'inventory')
      into v_markup, v_pname, v_pmanuf, v_is_inventory
      from products p join product_types pt on pt.id = p.product_type_id
      where p.id = p_product_id and p.hospital_id = v_hosp and p.is_active;
    if not found then raise exception 'Товар не найден или неактивен'; end if;
  end if;
  if p_drug_formulary_id is not null then
    select markup_percent into v_markup from drug_formulary where id = p_drug_formulary_id and hospital_id = v_hosp and is_active;
    if not found then raise exception 'Препарат не найден или неактивен'; end if;
  end if;
  if p_supplier_id is not null and not exists (select 1 from suppliers where id = p_supplier_id and hospital_id = v_hosp) then
    raise exception 'Поставщик не найден'; end if;
  if p_quantity_units is null or p_quantity_units <= 0 then raise exception 'Количество должно быть больше нуля'; end if;
  if p_purchase_price is null or p_purchase_price <= 0 then raise exception 'Цена закупки должна быть больше нуля'; end if;
  if p_drug_formulary_id is not null and p_expiry_date is null then raise exception 'Укажите срок годности препарата'; end if;
  if p_expiry_date is not null and p_expiry_date < current_date then raise exception 'Срок годности уже истёк'; end if;
  if v_is_inventory then
    if p_quantity_units <> trunc(p_quantity_units) then raise exception 'Инвентарь принимается целым количеством единиц'; end if;
    if p_quantity_units > 1000 then raise exception 'За один приход можно принять не более 1000 единиц инвентаря'; end if;
  end if;

  v_batch := _stock_add(v_hosp, p_warehouse_id, p_product_id, p_drug_formulary_id, p_supplier_id,
    nullif(btrim(p_series_number), ''), p_expiry_date, p_quantity_units, p_purchase_price, v_markup, v_uid, coalesce(p_vat_included, false));
  perform _stock_log(v_hosp, p_warehouse_id, v_batch, p_product_id, p_drug_formulary_id, 'incoming', p_quantity_units, v_batch, v_uid);

  if v_is_inventory then
    insert into equipment (hospital_id, product_id, warehouse_id, name, manufacturer_id, purchase_date, purchase_price,
                           supplier_id, received_batch_id, info_status)
    select v_hosp, p_product_id, p_warehouse_id, v_pname, v_pmanuf, current_date, p_purchase_price,
           p_supplier_id, v_batch, 'pending'
    from generate_series(1, p_quantity_units::int);
  end if;
  return v_batch;
end $$;
revoke execute on function public.receive_stock(uuid, uuid, uuid, uuid, text, date, numeric, numeric, boolean) from public, anon;
grant  execute on function public.receive_stock(uuid, uuid, uuid, uuid, text, date, numeric, numeric, boolean) to authenticated;

-- 6) inventory products carry no markup / min stock / expiry warning / stale threshold -------------------------
create or replace function public._normalize_inventory_product()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_new_inv boolean; v_old_inv boolean := false;
begin
  select (code = 'inventory') into v_new_inv from product_types where id = new.product_type_id;
  if tg_op = 'UPDATE' then
    select (code = 'inventory') into v_old_inv from product_types where id = old.product_type_id;
    if coalesce(v_old_inv, false) <> coalesce(v_new_inv, false)
       and exists (select 1 from inventory_transactions where product_id = new.id) then
      raise exception 'Нельзя менять тип «Инвентарь» у товара, по которому уже есть движения';
    end if;
  end if;
  if coalesce(v_new_inv, false) then
    new.markup_percent := 0; new.min_stock_quantity := null; new.expiry_notify_days := null; new.stale_after_days := null;
  end if;
  return new;
end $$;
create trigger products_normalize_inventory before insert or update on public.products
  for each row execute function public._normalize_inventory_product();

-- 7) until step 2: inventory items cannot be sent, written off or consumed -----------------------------------------
create or replace function public._guard_inventory_unit_moves()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source_type in ('transfer_out', 'writeoff', 'consumable') and new.product_id is not null
     and exists (select 1 from products p join product_types t on t.id = p.product_type_id where p.id = new.product_id and t.code = 'inventory') then
    raise exception 'Перемещение и списание инвентаря пока недоступны';
  end if;
  return new;
end $$;
create trigger inventory_transactions_unit_guard before insert on public.inventory_transactions
  for each row execute function public._guard_inventory_unit_moves();

revoke execute on function public._normalize_inventory_product(), public._guard_inventory_unit_moves() from public, anon, authenticated;
