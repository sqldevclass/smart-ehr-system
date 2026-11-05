-- Инвентаризация, step 2: transfers and write-offs of inventory items work on specific equipment units.
--  * a unit can be transferred only after its info is completed (info_status = 'ready')
--  * a unit can be written off in any state (e.g. a defective delivery returned to the supplier)
--  * stock quantity and unit count stay in step: units move with their batch
--  * a unit in transit stays attached to the sender's batch until the transfer is accepted / returned / cancelled

-- 1) schema -------------------------------------------------------------------------------------------
alter table public.equipment rename column received_batch_id to batch_id;   -- now: the stock batch the unit currently sits in
alter table public.equipment
  add column transit_transfer_id uuid references public.transfer_records(id),
  add column written_off_at      timestamptz,
  add column write_off_record_id uuid references public.write_off_records(id);
create index equipment_transit_idx on public.equipment (transit_transfer_id) where transit_transfer_id is not null;
create index equipment_batch_idx   on public.equipment (batch_id);

create table public.transfer_record_equipment (
  transfer_record_id uuid not null references public.transfer_records(id) on delete cascade,
  equipment_id       uuid not null references public.equipment(id),
  hospital_id        uuid not null references public.hospitals(id),
  primary key (transfer_record_id, equipment_id)
);
create table public.write_off_record_equipment (
  write_off_record_id uuid not null references public.write_off_records(id) on delete cascade,
  equipment_id        uuid not null references public.equipment(id),
  hospital_id         uuid not null references public.hospitals(id),
  primary key (write_off_record_id, equipment_id)
);
-- read only through the RPCs below
alter table public.transfer_record_equipment enable row level security;
alter table public.write_off_record_equipment enable row level security;
revoke all on public.transfer_record_equipment, public.write_off_record_equipment from anon, authenticated;

-- 2) helper ---------------------------------------------------------------------------------------------
create or replace function public._is_inventory_product(p_product uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select t.code = 'inventory' from products p join product_types t on t.id = p.product_type_id where p.id = p_product), false)
$$;

-- 3) the guard now allows moves only when the calling function validated the units ------------------------------
create or replace function public._guard_inventory_unit_moves()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.product_id is not null and new.source_type in ('transfer_out', 'writeoff', 'consumable') and _is_inventory_product(new.product_id) then
    if new.source_type = 'consumable' then raise exception 'Инвентарь нельзя списать на пациента'; end if;
    if coalesce(current_setting('app.inventory_units_ok', true), '') <> 'on' then
      raise exception 'Для инвентаря выберите конкретные единицы';
    end if;
  end if;
  return new;
end $$;

-- 4) send_transfer: inventory items carry equipment_ids ---------------------------------------------------------
create or replace function public.send_transfer(p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid(); v_id uuid; r record; v_b record;
  v_qty numeric; v_inv boolean; v_cnt int;
begin
  if not has_permission('warehouse.transfer_send') then raise exception 'Нет прав на отправку перемещений'; end if;
  if p_from_warehouse_id = p_to_warehouse_id then raise exception 'Склад-отправитель и получатель совпадают'; end if;
  if not can_access_warehouse(p_from_warehouse_id) then raise exception 'Нет доступа к складу-отправителю'; end if;
  if not exists (select 1 from warehouses where id = p_to_warehouse_id and hospital_id = v_hosp and is_active) then
    raise exception 'Склад-получатель не найден или неактивен'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Добавьте хотя бы одну позицию'; end if;

  insert into transfer_records (hospital_id, from_warehouse_id, to_warehouse_id, status, notes, sent_by, sent_at)
  values (v_hosp, p_from_warehouse_id, p_to_warehouse_id, 'pending_acceptance', nullif(btrim(p_notes), ''), v_uid, now())
  returning id into v_id;

  for r in
    select g.batch_id,
           (select sum((e2->>'quantity_units')::numeric) from jsonb_array_elements(p_items) e2 where (e2->>'batch_id')::uuid = g.batch_id) as qty,
           (select coalesce(array_agg(distinct v::uuid), '{}'::uuid[])
              from jsonb_array_elements(p_items) e3, jsonb_array_elements_text(coalesce(e3->'equipment_ids', '[]'::jsonb)) v
             where (e3->>'batch_id')::uuid = g.batch_id) as eids
    from (select distinct (e->>'batch_id')::uuid as batch_id from jsonb_array_elements(p_items) e) g
    order by g.batch_id
  loop
    select * into v_b from inventory_batches
      where id = r.batch_id and hospital_id = v_hosp and warehouse_id = p_from_warehouse_id for update;
    if not found then raise exception 'Партия не найдена на складе-отправителе'; end if;
    v_inv := v_b.product_id is not null and _is_inventory_product(v_b.product_id);

    if v_inv then
      if cardinality(r.eids) = 0 then raise exception 'Для инвентаря выберите конкретные единицы'; end if;
      if r.qty is not null and r.qty <> cardinality(r.eids) then raise exception 'Количество не совпадает с выбранными единицами'; end if;
      select count(*) into v_cnt from equipment
        where id = any(r.eids) and hospital_id = v_hosp and warehouse_id = p_from_warehouse_id and batch_id = v_b.id
          and is_active and transit_transfer_id is null and info_status = 'ready';
      if v_cnt <> cardinality(r.eids) then
        if exists (select 1 from equipment where id = any(r.eids) and info_status = 'pending') then
          raise exception 'Нельзя передать: у части единиц не заполнена информация (Инвентаризация → Добавить информацию)';
        end if;
        raise exception 'Часть выбранных единиц недоступна для перемещения';
      end if;
      v_qty := cardinality(r.eids);
    else
      if cardinality(r.eids) > 0 then raise exception 'Единицы указываются только для инвентаря'; end if;
      v_qty := r.qty;
    end if;

    if v_qty is null or v_qty <= 0 then raise exception 'Количество должно быть больше нуля'; end if;
    if v_b.quantity_units < v_qty then
      raise exception 'Недостаточно остатка в партии (доступно %, запрошено %)', v_b.quantity_units, v_qty; end if;
    update inventory_batches set quantity_units = quantity_units - v_qty where id = v_b.id;
    insert into transfer_record_items (transfer_record_id, hospital_id, inventory_batch_id, product_id, drug_formulary_id, quantity_packages, quantity_units)
      values (v_id, v_hosp, v_b.id, v_b.product_id, v_b.drug_formulary_id, 0, v_qty);
    if v_inv then perform set_config('app.inventory_units_ok', 'on', true); end if;
    perform _stock_log(v_hosp, p_from_warehouse_id, v_b.id, v_b.product_id, v_b.drug_formulary_id, 'transfer_out', -v_qty, v_id, v_uid);
    perform set_config('app.inventory_units_ok', 'off', true);   -- the permission is valid for this one ledger row only
    if v_inv then
      update equipment set transit_transfer_id = v_id where id = any(r.eids);
      insert into transfer_record_equipment (transfer_record_id, equipment_id, hospital_id)
        select v_id, x, v_hosp from unnest(r.eids) x;
    end if;
  end loop;
  return v_id;
end $$;

-- 5) accept: the units arrive with the new batch ----------------------------------------------------------------------
create or replace function public.accept_transfer(p_transfer_record_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid(); t record; i record; s record; v_new uuid; v_n int;
begin
  if not has_permission('warehouse.transfer_accept') then raise exception 'Нет прав на приём перемещений'; end if;
  select * into t from transfer_records where id = p_transfer_record_id and hospital_id = v_hosp for update;
  if not found then raise exception 'Перемещение не найдено'; end if;
  if not can_access_warehouse(t.to_warehouse_id) then raise exception 'Нет доступа к складу-получателю'; end if;
  if t.status <> 'pending_acceptance' then raise exception 'Перемещение уже обработано (статус: %)', t.status; end if;
  for i in select * from transfer_record_items where transfer_record_id = t.id order by id loop
    select * into s from inventory_batches where id = i.inventory_batch_id;
    v_new := _stock_add(v_hosp, t.to_warehouse_id, s.product_id, s.drug_formulary_id, s.supplier_id, s.series_number,
      s.expiry_date, i.quantity_units, s.purchase_price, s.markup_percent, v_uid, s.vat_included);
    perform _stock_log(v_hosp, t.to_warehouse_id, v_new, s.product_id, s.drug_formulary_id, 'transfer_in', i.quantity_units, t.id, v_uid);
    if s.product_id is not null and _is_inventory_product(s.product_id) then
      update equipment set warehouse_id = t.to_warehouse_id, batch_id = v_new, transit_transfer_id = null
        where transit_transfer_id = t.id and batch_id = s.id;
      get diagnostics v_n = row_count;
      if v_n <> i.quantity_units then raise exception 'Нарушена целостность перемещения инвентаря'; end if;
    end if;
  end loop;
  update transfer_records set status = 'accepted', accepted_by = v_uid, accepted_at = now() where id = t.id;
end $$;

-- 6) cancel / returned transfers: the units go back to the sender's batch ------------------------------------------------
create or replace function public._transfer_return_stock(p_transfer_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t record; i record; s record;
begin
  select * into t from transfer_records where id = p_transfer_id;
  for i in select * from transfer_record_items where transfer_record_id = p_transfer_id order by id loop
    select * into s from inventory_batches where id = i.inventory_batch_id for update;
    update inventory_batches set quantity_units = quantity_units + i.quantity_units where id = s.id;
    perform _stock_log(t.hospital_id, t.from_warehouse_id, s.id, s.product_id, s.drug_formulary_id, 'transfer_return', i.quantity_units, t.id, p_user);
    if s.product_id is not null and _is_inventory_product(s.product_id) then
      update equipment set transit_transfer_id = null where transit_transfer_id = p_transfer_id and batch_id = s.id;
    end if;
  end loop;
end $$;

-- 7) write-off: inventory by specific units (any info state) -------------------------------------------------------------
create or replace function public.perform_writeoff(
  p_warehouse_id uuid, p_write_off_type_id uuid, p_employee_id uuid, p_supplier_id uuid, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid(); w record; v_code text; v_rec uuid;
  e jsonb; v_qty numeric; v_left numeric; v_use numeric; b record; ub record; bb record;
  v_eids uuid[]; v_pid uuid; v_inv boolean; v_cnt int;
begin
  select * into w from warehouses where id = p_warehouse_id and hospital_id = v_hosp;
  if not found then raise exception 'Склад не найден'; end if;
  if not ((has_permission('warehouse.writeoff') and can_access_warehouse(p_warehouse_id))
       or (has_permission('warehouse.department_writeoff') and w.department_id is not null
           and w.department_id = (select department_id from profiles where id = v_uid))) then
    raise exception 'Нет прав на списание с этого склада'; end if;
  select code into v_code from write_off_types where id = p_write_off_type_id;
  if v_code is null then raise exception 'Тип списания не найден'; end if;
  if v_code = 'employee' and (p_employee_id is null or not exists (select 1 from profiles where id = p_employee_id and hospital_id = v_hosp)) then
    raise exception 'Укажите сотрудника'; end if;
  if v_code = 'return_supplier' and (p_supplier_id is null or not exists (select 1 from suppliers where id = p_supplier_id and hospital_id = v_hosp)) then
    raise exception 'Укажите поставщика'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Добавьте хотя бы одну позицию'; end if;

  insert into write_off_records (hospital_id, warehouse_id, write_off_type_id, employee_id, supplier_id, notes, written_off_by)
  values (v_hosp, p_warehouse_id, p_write_off_type_id,
          case when v_code = 'employee' then p_employee_id end,
          case when v_code = 'return_supplier' then p_supplier_id end,
          nullif(btrim(p_notes), ''), v_uid)
  returning id into v_rec;

  for e in select * from jsonb_array_elements(p_items) loop
    v_eids := coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(e->'equipment_ids', '[]'::jsonb)) x), '{}'::uuid[]);
    v_pid := coalesce((select product_id from inventory_batches where id = (e->>'batch_id')::uuid),
                      (e->>'product_id')::uuid);
    v_inv := v_pid is not null and _is_inventory_product(v_pid);

    if v_inv or cardinality(v_eids) > 0 then
      if not v_inv then raise exception 'Единицы указываются только для инвентаря'; end if;
      if cardinality(v_eids) = 0 then raise exception 'Для инвентаря выберите конкретные единицы'; end if;
      select count(*) into v_cnt from equipment
        where id = any(v_eids) and hospital_id = v_hosp and warehouse_id = p_warehouse_id and product_id = v_pid
          and is_active and transit_transfer_id is null;
      if v_cnt <> cardinality(v_eids) then raise exception 'Часть выбранных единиц недоступна для списания'; end if;
      for ub in select batch_id, count(*)::int as c from equipment where id = any(v_eids) group by batch_id loop
        select * into bb from inventory_batches where id = ub.batch_id for update;
        if bb.quantity_units < ub.c then raise exception 'Недостаточно остатка для списания'; end if;
        update inventory_batches set quantity_units = quantity_units - ub.c where id = bb.id;
        insert into write_off_record_items (write_off_record_id, hospital_id, inventory_batch_id, product_id, drug_formulary_id, quantity_packages, quantity_units)
          values (v_rec, v_hosp, bb.id, bb.product_id, bb.drug_formulary_id, 0, ub.c);
        perform set_config('app.inventory_units_ok', 'on', true);
        perform _stock_log(v_hosp, p_warehouse_id, bb.id, bb.product_id, bb.drug_formulary_id, 'writeoff', -ub.c, v_rec, v_uid);
        perform set_config('app.inventory_units_ok', 'off', true);
      end loop;
      update equipment set is_active = false, written_off_at = now(), write_off_record_id = v_rec where id = any(v_eids);
      insert into write_off_record_equipment (write_off_record_id, equipment_id, hospital_id)
        select v_rec, x, v_hosp from unnest(v_eids) x;
      continue;
    end if;

    v_qty := (e->>'quantity_units')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Количество должно быть больше нуля'; end if;
    v_left := v_qty;
    for b in
      select * from inventory_batches
      where warehouse_id = p_warehouse_id and hospital_id = v_hosp and quantity_units > 0
        and case when e->>'batch_id' is not null then id = (e->>'batch_id')::uuid
                 when e->>'product_id' is not null then product_id = (e->>'product_id')::uuid
                 when e->>'drug_formulary_id' is not null then drug_formulary_id = (e->>'drug_formulary_id')::uuid
                 else false end
      order by coalesce(expiry_date, '9999-12-31'), received_at
      for update
    loop
      exit when v_left <= 0;
      v_use := least(v_left, b.quantity_units);
      update inventory_batches set quantity_units = quantity_units - v_use where id = b.id;
      insert into write_off_record_items (write_off_record_id, hospital_id, inventory_batch_id, product_id, drug_formulary_id, quantity_packages, quantity_units)
        values (v_rec, v_hosp, b.id, b.product_id, b.drug_formulary_id, 0, v_use);
      perform _stock_log(v_hosp, p_warehouse_id, b.id, b.product_id, b.drug_formulary_id, 'writeoff', -v_use, v_rec, v_uid);
      v_left := v_left - v_use;
    end loop;
    if v_left > 0 then raise exception 'Недостаточно остатка для списания (не хватает %)', v_left; end if;
  end loop;
  return v_rec;
end $$;

-- 8) department stock orders: inventory lines are filled with ready units automatically ------------------------------------
create or replace function public.release_stock_order_item(p_item_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_hosp uuid := get_my_hospital_id(); it stock_order_items; o stock_orders; b record;
  v_need numeric; v_take numeric; v_items jsonb := '[]'::jsonb; v_tid uuid; v_name text; ub record; v_ready int;
begin
  if not has_permission('warehouse.transfer_send') then raise exception 'Нет прав на выдачу заказов'; end if;
  select * into it from stock_order_items where id = p_item_id and hospital_id = v_hosp for update;
  if not found then raise exception 'Позиция заказа не найдена'; end if;
  select * into o from stock_orders where id = it.order_id;
  if not can_access_warehouse(o.from_warehouse_id) then raise exception 'Нет доступа к складу'; end if;
  if it.status <> 'pending' then raise exception 'Позиция уже обработана'; end if;

  if it.product_id is not null and _is_inventory_product(it.product_id) then
    select count(*) into v_ready from equipment
      where hospital_id = v_hosp and warehouse_id = o.from_warehouse_id and product_id = it.product_id
        and is_active and transit_transfer_id is null and info_status = 'ready';
    if v_ready < it.quantity_units then
      select name into v_name from products where id = it.product_id;
      raise exception 'Недостаточно готового инвентаря: % (готово %, нужно %). Заполните информацию в разделе Инвентаризация или отклоните позицию.',
        v_name, v_ready, it.quantity_units;
    end if;
    for ub in
      select batch_id, array_agg(id order by id) as ids
      from (select id, batch_id, row_number() over (order by purchase_date, id) as rn
            from equipment
            where hospital_id = v_hosp and warehouse_id = o.from_warehouse_id and product_id = it.product_id
              and is_active and transit_transfer_id is null and info_status = 'ready') q
      where rn <= it.quantity_units group by batch_id order by batch_id
    loop
      v_items := v_items || jsonb_build_object('batch_id', ub.batch_id, 'equipment_ids', to_jsonb(ub.ids));
    end loop;
  else
    v_need := it.quantity_units;
    for b in
      select id, quantity_units from inventory_batches
      where warehouse_id = o.from_warehouse_id and hospital_id = v_hosp and quantity_units > 0
        and (expiry_date is null or expiry_date >= current_date)
        and coalesce(drug_formulary_id, product_id) = coalesce(it.drug_formulary_id, it.product_id)
      order by expiry_date nulls last, received_at, id
      for update
    loop
      exit when v_need <= 0;
      v_take := least(b.quantity_units, v_need);
      v_items := v_items || jsonb_build_object('batch_id', b.id, 'quantity_units', v_take);
      v_need := v_need - v_take;
    end loop;
    if v_need > 0 then
      select coalesce((select trade_name from drug_formulary where id = it.drug_formulary_id), (select name from products where id = it.product_id)) into v_name;
      raise exception 'Недостаточно остатка для выдачи: % (не хватает %). Отклоните позицию.', v_name, v_need;
    end if;
  end if;

  v_tid := send_transfer(o.from_warehouse_id, o.to_warehouse_id, 'Заказ отделения', v_items);
  update stock_order_items set status = 'released', transfer_id = v_tid, released_by = auth.uid(), released_at = now() where id = it.id;
  return v_tid;
end $$;

-- what a department can order: inventory counts only ready units
create or replace function public.list_orderable_items(p_from_warehouse_id uuid)
returns table (item_kind text, item_id uuid, name text, inn text, dose text, unit_name text, available numeric, nearest_expiry date)
language plpgsql stable security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id();
begin
  if not has_permission('warehouse.department_order') then raise exception 'Нет прав на заказ со склада'; end if;
  if not exists (select 1 from warehouses w join warehouse_types wt on wt.id = w.warehouse_type_id
                 where w.id = p_from_warehouse_id and w.hospital_id = v_hosp and w.is_active and wt.code in ('central_pharmacy', 'general')) then
    raise exception 'Заказывать можно только с центральной аптеки или общего склада'; end if;
  return query
  select x.item_kind, x.item_id, x.name, x.inn, x.dose, x.unit_name, x.available, x.nearest_expiry
  from (
    select case when ib.drug_formulary_id is not null then 'drug' else 'product' end as item_kind,
           coalesce(ib.drug_formulary_id, ib.product_id) as item_id,
           coalesce(df.trade_name, p.name) as name, df.inn as inn, df.dose as dose, uom.name_ru as unit_name,
           case when max(pt.code) = 'inventory'
                then (select count(*) from equipment e
                      where e.hospital_id = v_hosp and e.warehouse_id = p_from_warehouse_id and e.product_id = ib.product_id
                        and e.is_active and e.transit_transfer_id is null and e.info_status = 'ready')::numeric
                else sum(ib.quantity_units) end as available,
           min(ib.expiry_date) as nearest_expiry
    from inventory_batches ib
    left join drug_formulary df on df.id = ib.drug_formulary_id
    left join products p on p.id = ib.product_id
    left join product_types pt on pt.id = p.product_type_id
    left join units_of_measurement uom on uom.id = coalesce(df.unit_id, p.unit_id)
    where ib.hospital_id = v_hosp and ib.warehouse_id = p_from_warehouse_id and ib.quantity_units > 0
      and (ib.expiry_date is null or ib.expiry_date >= current_date)
    group by 1, 2, 3, 4, 5, 6, ib.product_id
  ) x
  where x.available > 0
  order by x.name
  limit 2000;
end $$;

-- availability used when an order is created: inventory counts ready units only (same rule as the orderable list)
create or replace function public._order_available(p_wh uuid, p_kind text, p_item uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when p_kind = 'product' and _is_inventory_product(p_item) then
      (select count(*) from equipment e
        where e.warehouse_id = p_wh and e.product_id = p_item and e.is_active
          and e.transit_transfer_id is null and e.info_status = 'ready')::numeric
    else
      coalesce((select sum(quantity_units) from inventory_batches
                where warehouse_id = p_wh and quantity_units > 0 and (expiry_date is null or expiry_date >= current_date)
                  and case when p_kind = 'drug' then drug_formulary_id = p_item else product_id = p_item end), 0)
  end
$$;

-- 8b) receive_stock: units now reference their current batch through batch_id (renamed column)
create or replace function public.receive_stock(p_warehouse_id uuid, p_product_id uuid, p_drug_formulary_id uuid, p_supplier_id uuid, p_series_number text, p_expiry_date date, p_quantity_units numeric, p_purchase_price numeric, p_vat_included boolean default false)
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
                           supplier_id, batch_id, info_status)
    select v_hosp, p_product_id, p_warehouse_id, v_pname, v_pmanuf, current_date, p_purchase_price,
           p_supplier_id, v_batch, 'pending'
    from generate_series(1, p_quantity_units::int);
  end if;
  return v_batch;
end $$;

-- 9) readers for the UI (units are not directly readable by nurses, who lack inventory.view) ------------------------------------
create or replace function public.list_available_units(p_warehouse_id uuid, p_product_id uuid default null)
returns table (equipment_id uuid, product_id uuid, product_name text, batch_id uuid, serial_number text, model text,
               info_status text, purchase_price numeric, purchase_date date)
language plpgsql stable security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id();
begin
  if not can_access_warehouse(p_warehouse_id) then raise exception 'Нет доступа к складу'; end if;
  return query
  select e.id, e.product_id, e.name, e.batch_id, e.serial_number, e.model, e.info_status, e.purchase_price, e.purchase_date
  from equipment e
  where e.hospital_id = v_hosp and e.warehouse_id = p_warehouse_id and e.is_active and e.transit_transfer_id is null
    and (p_product_id is null or e.product_id = p_product_id)
  order by e.name, e.serial_number nulls last, e.id;
end $$;

create or replace function public.get_transfer_units(p_transfer_id uuid)
returns table (equipment_id uuid, product_id uuid, product_name text, serial_number text, model text)
language plpgsql stable security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id(); t record;
begin
  select * into t from transfer_records where id = p_transfer_id and hospital_id = v_hosp;
  if not found then raise exception 'Перемещение не найдено'; end if;
  if not (_can_read_warehouse_ledger(t.from_warehouse_id) or _can_read_warehouse_ledger(t.to_warehouse_id)) then
    raise exception 'Нет доступа к перемещению'; end if;
  return query
  select e.id, e.product_id, e.name, e.serial_number, e.model
  from transfer_record_equipment x join equipment e on e.id = x.equipment_id
  where x.transfer_record_id = p_transfer_id
  order by e.name, e.serial_number nulls last, e.id;
end $$;

create or replace function public.get_writeoff_units(p_write_off_record_id uuid)
returns table (equipment_id uuid, product_id uuid, product_name text, serial_number text, model text)
language plpgsql stable security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id(); r record;
begin
  select * into r from write_off_records where id = p_write_off_record_id and hospital_id = v_hosp;
  if not found then raise exception 'Списание не найдено'; end if;
  if not _can_read_warehouse_ledger(r.warehouse_id) then raise exception 'Нет доступа к списанию'; end if;
  return query
  select e.id, e.product_id, e.name, e.serial_number, e.model
  from write_off_record_equipment x join equipment e on e.id = x.equipment_id
  where x.write_off_record_id = p_write_off_record_id
  order by e.name, e.serial_number nulls last, e.id;
end $$;

revoke execute on function public.list_available_units(uuid, uuid), public.get_transfer_units(uuid), public.get_writeoff_units(uuid) from public, anon;
grant  execute on function public.list_available_units(uuid, uuid), public.get_transfer_units(uuid), public.get_writeoff_units(uuid) to authenticated;
revoke execute on function public._is_inventory_product(uuid) from public, anon, authenticated;

-- 10) a written-off unit takes no more service records ---------------------------------------------------------------------
drop policy equipment_service_records_insert on public.equipment_service_records;
create policy equipment_service_records_insert on public.equipment_service_records for insert to authenticated
  with check (hospital_id = get_my_hospital_id() and has_permission('inventory.manage')
    and exists (select 1 from equipment e
                where e.id = equipment_service_records.equipment_id and e.hospital_id = equipment_service_records.hospital_id
                  and e.info_status = 'ready' and e.is_active));
