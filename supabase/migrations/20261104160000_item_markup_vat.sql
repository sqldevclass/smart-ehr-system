-- Наценка becomes an attribute of the drug / product; the server stamps it on each received batch.
-- НДС: each receipt records whether the purchase price includes НДС; the flag follows the stock.

-- 1) item-level markup (backfilled from the item's latest batch; never received => 0)
alter table public.drug_formulary add column markup_percent numeric(5,2) not null default 0 check (markup_percent >= 0);
alter table public.products       add column markup_percent numeric(5,2) not null default 0 check (markup_percent >= 0);

update public.drug_formulary d set markup_percent = x.m
from (select distinct on (drug_formulary_id) drug_formulary_id as id, markup_percent as m
        from public.inventory_batches where drug_formulary_id is not null and markup_percent is not null
       order by drug_formulary_id, received_at desc) x
where x.id = d.id;

update public.products p set markup_percent = x.m
from (select distinct on (product_id) product_id as id, markup_percent as m
        from public.inventory_batches where product_id is not null and markup_percent is not null
       order by product_id, received_at desc) x
where x.id = p.id;

-- 2) per-batch НДС flag (existing batches: false = not recorded)
alter table public.inventory_batches add column vat_included boolean not null default false;

-- 3) _stock_add carries the flag (and never merges VAT with non-VAT stock)
create or replace function public._stock_add(
  p_hospital uuid, p_wh uuid, p_product uuid, p_drug uuid, p_supplier uuid, p_series text, p_expiry date,
  p_qty numeric, p_price numeric, p_markup numeric, p_user uuid, p_vat boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from inventory_batches
  where warehouse_id = p_wh and hospital_id = p_hospital
    and product_id is not distinct from p_product
    and drug_formulary_id is not distinct from p_drug
    and supplier_id is not distinct from p_supplier
    and series_number is not distinct from p_series
    and expiry_date is not distinct from p_expiry
    and purchase_price is not distinct from p_price
    and coalesce(markup_percent, 0) = coalesce(p_markup, 0)
    and vat_included = coalesce(p_vat, false)
  order by received_at limit 1 for update;
  if v_id is not null then
    update inventory_batches set quantity_units = quantity_units + p_qty where id = v_id;
  else
    insert into inventory_batches (hospital_id, warehouse_id, product_id, drug_formulary_id, supplier_id,
      series_number, expiry_date, quantity_packages, quantity_units, purchase_price, markup_percent, vat_included, received_by, received_at)
    values (p_hospital, p_wh, p_product, p_drug, p_supplier, p_series, p_expiry, 0, p_qty, p_price,
      coalesce(p_markup, 0), coalesce(p_vat, false), p_user, now())
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- 4) copies made by transfers and department dispensing keep the flag
create or replace function public.accept_transfer(p_transfer_record_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid(); t record; i record; s record; v_new uuid;
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
  end loop;
  update transfer_records set status = 'accepted', accepted_by = v_uid, accepted_at = now() where id = t.id;
end $$;

create or replace function public.dispense_slot(p_slot_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid(); s record; rx record;
  v_pharm uuid; v_dept uuid; v_qty numeric; b record; v_new uuid;
begin
  if not has_permission('warehouse.transfer_accept') then raise exception 'Нет прав на приём препаратов'; end if;
  select * into s from drug_administration_slots where id = p_slot_id and hospital_id = v_hosp for update;
  if not found then raise exception 'Назначение не найдено'; end if;
  if s.dispense_status <> 'in_progress' then raise exception 'Слот не ожидает выдачи (статус: %)', s.dispense_status; end if;
  if s.dept_batch_id is not null then raise exception 'Препарат уже выдан'; end if;
  select dp.*, df.min_write_off_qty into rx
    from drug_prescriptions dp join drug_formulary df on df.id = dp.drug_formulary_id where dp.id = s.prescription_id;
  if not found then raise exception 'Назначение не найдено'; end if;
  if rx.is_patient_own_drug then raise exception 'Собственные препараты пациента не выдаются из аптеки'; end if;
  v_qty := coalesce(rx.min_write_off_qty, 1);

  select w.id into v_pharm from warehouses w join warehouse_types wt on wt.id = w.warehouse_type_id
    where w.hospital_id = v_hosp and wt.code = 'central_pharmacy' and w.is_active;
  if v_pharm is null then raise exception 'Склад аптеки не найден'; end if;
  select w.id into v_dept from hospitalizations h join warehouses w on w.department_id = h.department_id and w.hospital_id = v_hosp
    where h.id = s.hospitalization_id and w.is_active;
  if v_dept is null then raise exception 'Склад отделения не найден'; end if;
  if not can_access_warehouse(v_dept) then raise exception 'Нет доступа к складу отделения'; end if;

  select * into b from inventory_batches
    where warehouse_id = v_pharm and hospital_id = v_hosp and drug_formulary_id = rx.drug_formulary_id
      and quantity_units >= v_qty and (expiry_date is null or expiry_date >= current_date)
    order by coalesce(expiry_date, '9999-12-31'), received_at limit 1 for update;
  if not found then raise exception 'Недостаточно препарата в аптеке (или срок годности истёк)'; end if;

  update inventory_batches set quantity_units = quantity_units - v_qty where id = b.id;
  perform _stock_log(v_hosp, v_pharm, b.id, null, rx.drug_formulary_id, 'transfer_out', -v_qty, p_slot_id, v_uid);
  v_new := _stock_add(v_hosp, v_dept, null, rx.drug_formulary_id, b.supplier_id, b.series_number, b.expiry_date, v_qty, b.purchase_price, b.markup_percent, v_uid, b.vat_included);
  perform _stock_log(v_hosp, v_dept, v_new, null, rx.drug_formulary_id, 'transfer_in', v_qty, p_slot_id, v_uid);

  update drug_administration_slots set dept_batch_id = v_new, dispense_status = 'ready_for_execution',
    dispense_changed_at = now(), dispense_changed_by = v_uid where id = p_slot_id;
  return v_new;
end $$;

-- the old 11-argument helper is no longer called by anything
drop function public._stock_add(uuid, uuid, uuid, uuid, uuid, text, date, numeric, numeric, numeric, uuid);
revoke execute on function public._stock_add(uuid, uuid, uuid, uuid, uuid, text, date, numeric, numeric, numeric, uuid, boolean) from public, anon, authenticated;

-- 5) receive_stock: no client-supplied markup any more; it comes from the item. НДС flag added.
drop function public.receive_stock(uuid, uuid, uuid, uuid, text, date, numeric, numeric, numeric);

create or replace function public.receive_stock(
  p_warehouse_id uuid, p_product_id uuid, p_drug_formulary_id uuid, p_supplier_id uuid, p_series_number text,
  p_expiry_date date, p_quantity_units numeric, p_purchase_price numeric, p_vat_included boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid(); v_code text; v_active boolean; v_batch uuid; v_markup numeric;
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
    select markup_percent into v_markup from products where id = p_product_id and hospital_id = v_hosp and is_active;
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

  v_batch := _stock_add(v_hosp, p_warehouse_id, p_product_id, p_drug_formulary_id, p_supplier_id,
    nullif(btrim(p_series_number), ''), p_expiry_date, p_quantity_units, p_purchase_price, v_markup, v_uid, coalesce(p_vat_included, false));
  perform _stock_log(v_hosp, p_warehouse_id, v_batch, p_product_id, p_drug_formulary_id, 'incoming', p_quantity_units, v_batch, v_uid);
  return v_batch;
end $$;

revoke execute on function public.receive_stock(uuid, uuid, uuid, uuid, text, date, numeric, numeric, boolean) from public, anon;
grant execute on function public.receive_stock(uuid, uuid, uuid, uuid, text, date, numeric, numeric, boolean) to authenticated;
