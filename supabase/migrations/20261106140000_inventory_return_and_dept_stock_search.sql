-- 1) Inventory (equipment units) leaves a department warehouse only back to the main warehouses.
--    Drugs and ordinary products can still go to any warehouse. The rule lives in send_transfer, so every caller is covered;
--    warehouse staff sending from the central pharmacy / general warehouse are not restricted, and released department
--    orders (central pharmacy / general -> department) are unaffected.
create or replace function public.send_transfer(p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid(); v_id uuid; r record; v_b record;
  v_qty numeric; v_inv boolean; v_cnt int; v_from_dept boolean; v_to_main boolean;
begin
  if not has_permission('warehouse.transfer_send') then raise exception 'Нет прав на отправку перемещений'; end if;
  if p_from_warehouse_id = p_to_warehouse_id then raise exception 'Склад-отправитель и получатель совпадают'; end if;
  if not can_access_warehouse(p_from_warehouse_id) then raise exception 'Нет доступа к складу-отправителю'; end if;
  if not exists (select 1 from warehouses where id = p_to_warehouse_id and hospital_id = v_hosp and is_active) then
    raise exception 'Склад-получатель не найден или неактивен'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Добавьте хотя бы одну позицию'; end if;

  select exists (select 1 from warehouses w join warehouse_types wt on wt.id = w.warehouse_type_id
                 where w.id = p_from_warehouse_id and wt.code = 'department'),
         exists (select 1 from warehouses w join warehouse_types wt on wt.id = w.warehouse_type_id
                 where w.id = p_to_warehouse_id and wt.code in ('central_pharmacy', 'general'))
    into v_from_dept, v_to_main;

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
      if v_from_dept and not v_to_main then
        raise exception 'Инвентарь можно возвращать только на Центральную аптеку или Общий склад'; end if;
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

-- 2) Read-only availability in other departments' warehouses (nurses cannot read them directly: no prices, no batches).
--    Same availability rules as list_orderable_items; the caller's own department warehouse is left out.
create or replace function public.list_other_department_stock(p_exclude_warehouse_id uuid default null)
returns table (warehouse_id uuid, warehouse_name text, department_name text, item_kind text, item_id uuid, name text, inn text,
               dose text, unit_name text, available numeric, nearest_expiry date)
language plpgsql stable security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id();
begin
  if not has_permission('warehouse.department_order') then raise exception 'Нет прав на просмотр остатков отделений'; end if;
  return query
  select x.warehouse_id, x.warehouse_name, x.department_name, x.item_kind, x.item_id, x.name, x.inn, x.dose, x.unit_name, x.available, x.nearest_expiry
  from (
    select w.id as warehouse_id, w.name as warehouse_name, d.name as department_name,
           case when ib.drug_formulary_id is not null then 'drug' else 'product' end as item_kind,
           coalesce(ib.drug_formulary_id, ib.product_id) as item_id,
           coalesce(df.trade_name, p.name) as name, df.inn as inn, df.dose as dose, uom.name_ru as unit_name,
           case when max(pt.code) = 'inventory'
                then (select count(*) from equipment e
                      where e.hospital_id = v_hosp and e.warehouse_id = w.id and e.product_id = ib.product_id
                        and e.is_active and e.transit_transfer_id is null and e.info_status = 'ready')::numeric
                else sum(ib.quantity_units) end as available,
           min(ib.expiry_date) as nearest_expiry
    from inventory_batches ib
    join warehouses w on w.id = ib.warehouse_id
    join warehouse_types wt on wt.id = w.warehouse_type_id and wt.code = 'department'
    left join departments d on d.id = w.department_id
    left join drug_formulary df on df.id = ib.drug_formulary_id
    left join products p on p.id = ib.product_id
    left join product_types pt on pt.id = p.product_type_id
    left join units_of_measurement uom on uom.id = coalesce(df.unit_id, p.unit_id)
    where ib.hospital_id = v_hosp and w.hospital_id = v_hosp and w.is_active
      and (p_exclude_warehouse_id is null or w.id <> p_exclude_warehouse_id)
      and ib.quantity_units > 0 and (ib.expiry_date is null or ib.expiry_date >= current_date)
    group by w.id, w.name, d.name, 4, 5, 6, 7, 8, 9, ib.product_id
  ) x
  where x.available > 0
  order by x.name, x.department_name
  limit 5000;
end $$;

revoke execute on function public.send_transfer(uuid, uuid, text, jsonb) from public, anon;
grant  execute on function public.send_transfer(uuid, uuid, text, jsonb) to authenticated;
revoke execute on function public.list_other_department_stock(uuid) from public, anon;
grant  execute on function public.list_other_department_stock(uuid) to authenticated;
