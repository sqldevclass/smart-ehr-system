-- Department write-off rules.
--  * A department warehouse has no act write-off at all (perform_writeoff, every caller and role - the head nurse also holds
--    warehouse.writeoff): drugs / products leave it only to a patient (writeoff_to_patient); anything else (inventory, expired or damaged
--    stock) is returned to the central pharmacy / general warehouse by transfer and written off there.
--  * writeoff_to_patient refuses inventory batches (it would lower the batch quantity and leave the units active).

create or replace function public.perform_writeoff(p_warehouse_id uuid, p_write_off_type_id uuid, p_employee_id uuid, p_supplier_id uuid, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid(); w record; v_code text; v_rec uuid;
  e jsonb; v_qty numeric; v_left numeric; v_use numeric; b record; ub record; bb record;
  v_eids uuid[]; v_pid uuid; v_inv boolean; v_cnt int;
begin
  select * into w from warehouses where id = p_warehouse_id and hospital_id = v_hosp;
  if not found then raise exception 'Склад не найден'; end if;
  if not (has_permission('warehouse.writeoff') and can_access_warehouse(p_warehouse_id)) then
    raise exception 'Нет прав на списание с этого склада'; end if;
  if exists (select 1 from warehouse_types wt where wt.id = w.warehouse_type_id and wt.code = 'department') then
    raise exception 'Со склада отделения списание возможно только на пациента. Остальное верните на Центральную аптеку или Общий склад'; end if;
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

create or replace function public.writeoff_to_patient(p_batch_id uuid, p_quantity_units numeric, p_hospitalization_id uuid, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid(); b record; w record; v_tx uuid;
  v_inv uuid; v_price numeric; v_name text;
begin
  if p_quantity_units is null or p_quantity_units <= 0 then raise exception 'Количество должно быть больше нуля'; end if;
  select * into b from inventory_batches where id = p_batch_id and hospital_id = v_hosp for update;
  if not found then raise exception 'Партия не найдена'; end if;
  if b.product_id is not null and _is_inventory_product(b.product_id) then
    raise exception 'Инвентарь нельзя списать на пациента'; end if;
  select * into w from warehouses where id = b.warehouse_id;
  if not ((has_permission('warehouse.writeoff') and can_access_warehouse(w.id))
       or (has_permission('warehouse.department_writeoff') and w.department_id is not null
           and w.department_id = (select department_id from profiles where id = v_uid))) then
    raise exception 'Нет прав на списание с этого склада'; end if;
  if not exists (select 1 from hospitalizations where id = p_hospitalization_id and hospital_id = v_hosp and discharged_at is null) then
    raise exception 'Госпитализация не найдена или уже закрыта'; end if;
  if b.quantity_units < p_quantity_units then
    raise exception 'Недостаточно остатка (доступно %, запрошено %)', b.quantity_units, p_quantity_units; end if;

  v_price := coalesce(b.selling_price, 0) * p_quantity_units;
  if v_price > 0 then
    select id into v_inv from invoices
      where hospitalization_id = p_hospitalization_id and hospital_id = v_hosp and status = 'active' limit 1;
    if v_inv is null then raise exception 'У пациента нет активного счёта — списание невозможно'; end if;
  end if;

  update inventory_batches set quantity_units = quantity_units - p_quantity_units where id = b.id;
  v_tx := _stock_log(v_hosp, b.warehouse_id, b.id, b.product_id, b.drug_formulary_id, 'consumable', -p_quantity_units, p_hospitalization_id, v_uid);

  if v_inv is not null then
    select coalesce((select trade_name from drug_formulary where id = b.drug_formulary_id),
                    (select name from products where id = b.product_id), 'Расходный материал') into v_name;
    insert into invoice_items (invoice_id, visit_service_id, amount, description, inventory_transaction_id)
      values (v_inv, null, v_price, v_name || ' × ' || p_quantity_units || coalesce(' — ' || nullif(btrim(p_notes), ''), ''), v_tx);
  end if;
end $$;

revoke execute on function public.perform_writeoff(uuid, uuid, uuid, uuid, text, jsonb) from public, anon;
grant  execute on function public.perform_writeoff(uuid, uuid, uuid, uuid, text, jsonb) to authenticated;
revoke execute on function public.writeoff_to_patient(uuid, numeric, uuid, text) from public, anon;
grant  execute on function public.writeoff_to_patient(uuid, numeric, uuid, text) to authenticated;
