-- Warehouse hardening: atomic, authorized stock operations; no direct client writes to stock tables.
-- Quantity model: quantity_units (base unit) is the only stock counter. quantity_packages is deprecated (always written as 0).

-- ============================================================
-- 1. Schema changes
-- ============================================================
alter table public.inventory_transactions drop constraint inventory_transactions_source_type_check;
alter table public.inventory_transactions add constraint inventory_transactions_source_type_check
  check (source_type = any (array['incoming','transfer_out','transfer_in','transfer_return','writeoff','consumable']));

alter table public.transfer_records drop constraint transfer_records_status_check;
alter table public.transfer_records add constraint transfer_records_status_check
  check (status = any (array['pending_acceptance','accepted','cancelled','rejected']));
alter table public.transfer_records
  add column if not exists rejected_by uuid references public.profiles(id),
  add column if not exists rejected_at timestamptz,
  add column if not exists reject_reason text;

alter table public.invoice_items
  add column if not exists description text,
  add column if not exists inventory_transaction_id uuid references public.inventory_transactions(id);

comment on column public.inventory_batches.quantity_packages is 'DEPRECATED: always 0. Use quantity_units (base unit); pack size = products.units_per_package / drug_formulary for display only.';
comment on column public.inventory_transactions.quantity_packages is 'DEPRECATED: always 0.';

-- products: effective uniqueness + sanity checks
alter table public.products drop constraint products_hospital_id_name_release_form_id_key;
create unique index products_hospital_name_form_uq
  on public.products (hospital_id, lower(btrim(name)), coalesce(release_form_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.products
  add constraint products_units_per_package_chk check (units_per_package is null or units_per_package > 0),
  add constraint products_min_stock_chk check (min_stock_quantity is null or min_stock_quantity >= 0),
  add constraint products_expiry_notify_chk check (expiry_notify_days is null or expiry_notify_days >= 0);

-- product_types: no cross-hospital leak
drop policy if exists product_types_select on public.product_types;
create policy product_types_select on public.product_types for select to authenticated
  using (hospital_id is null or hospital_id = public.get_my_hospital_id());

-- warehouses: one central/general per hospital, one warehouse per department
create unique index warehouses_hospital_type_uq on public.warehouses (hospital_id, warehouse_type_id) where department_id is null;
create unique index warehouses_department_uq on public.warehouses (department_id) where department_id is not null;

create or replace function public.warehouses_validate()
returns trigger language plpgsql set search_path = public as $$
declare v_code text; v_dept_hosp uuid; v_has_history boolean; v_stock numeric;
begin
  select code into v_code from warehouse_types where id = new.warehouse_type_id;
  if v_code = 'department' then
    if new.department_id is null then
      raise exception 'Для склада отделения нужно указать отделение';
    end if;
    select hospital_id into v_dept_hosp from departments where id = new.department_id;
    if v_dept_hosp is distinct from new.hospital_id then
      raise exception 'Отделение принадлежит другой больнице';
    end if;
  elsif new.department_id is not null then
    raise exception 'Отделение можно указывать только для склада отделения';
  end if;

  if tg_op = 'UPDATE' then
    if new.hospital_id <> old.hospital_id then
      raise exception 'Нельзя сменить больницу склада';
    end if;
    if new.warehouse_type_id <> old.warehouse_type_id or new.department_id is distinct from old.department_id then
      select exists(select 1 from inventory_batches where warehouse_id = old.id)
          or exists(select 1 from inventory_transactions where warehouse_id = old.id) into v_has_history;
      if v_has_history then
        raise exception 'Нельзя менять тип или отделение склада, по которому уже есть движения';
      end if;
    end if;
    if old.is_active and not new.is_active then
      select coalesce(sum(quantity_units), 0) into v_stock from inventory_batches where warehouse_id = old.id;
      if v_stock > 0 then
        raise exception 'Нельзя деактивировать склад с остатками (%). Сначала переместите или спишите товар', v_stock;
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger warehouses_validate_trg before insert or update on public.warehouses
  for each row execute function public.warehouses_validate();

-- head_nurse may return stock to pharmacy
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from roles r, permissions p
where r.code = 'head_nurse' and p.code = 'warehouse.transfer_send'
on conflict do nothing;

-- ============================================================
-- 2. Helpers
-- ============================================================
create or replace function public.can_access_warehouse(p_warehouse_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from warehouses w
    where w.id = p_warehouse_id
      and w.hospital_id = get_my_hospital_id()
      and (has_permission('warehouse.view_all')
           or (has_permission('warehouse.department_view') and w.department_id is not null
               and w.department_id = (select department_id from profiles where id = auth.uid())))
  )
$$;

-- merge into identical batch or create one; returns batch id. Internal only.
create or replace function public._stock_add(
  p_hospital uuid, p_wh uuid, p_product uuid, p_drug uuid, p_supplier uuid, p_series text,
  p_expiry date, p_qty numeric, p_price numeric, p_markup numeric, p_user uuid)
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
  order by received_at limit 1 for update;
  if v_id is not null then
    update inventory_batches set quantity_units = quantity_units + p_qty where id = v_id;
  else
    insert into inventory_batches (hospital_id, warehouse_id, product_id, drug_formulary_id, supplier_id,
      series_number, expiry_date, quantity_packages, quantity_units, purchase_price, markup_percent, received_by, received_at)
    values (p_hospital, p_wh, p_product, p_drug, p_supplier, p_series, p_expiry, 0, p_qty, p_price,
      coalesce(p_markup, 0), p_user, now())
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public._stock_log(
  p_hospital uuid, p_wh uuid, p_batch uuid, p_product uuid, p_drug uuid,
  p_type text, p_qty numeric, p_ref uuid, p_user uuid)
returns uuid language sql security definer set search_path = public as $$
  insert into inventory_transactions (hospital_id, warehouse_id, inventory_batch_id, product_id, drug_formulary_id,
    source_type, quantity_packages, quantity_units, reference_id, performed_by, performed_at)
  values (p_hospital, p_wh, p_batch, p_product, p_drug, p_type, 0, p_qty, p_ref, p_user, now())
  returning id
$$;

-- ============================================================
-- 3. receive_stock
-- ============================================================
create or replace function public.receive_stock(
  p_warehouse_id uuid, p_product_id uuid, p_drug_formulary_id uuid, p_supplier_id uuid,
  p_series_number text, p_expiry_date date, p_quantity_units numeric, p_purchase_price numeric,
  p_markup_percent numeric default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid(); v_code text; v_active boolean; v_batch uuid;
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
  if p_product_id is not null and not exists (select 1 from products where id = p_product_id and hospital_id = v_hosp and is_active) then
    raise exception 'Товар не найден или неактивен'; end if;
  if p_drug_formulary_id is not null and not exists (select 1 from drug_formulary where id = p_drug_formulary_id and hospital_id = v_hosp and is_active) then
    raise exception 'Препарат не найден или неактивен'; end if;
  if p_supplier_id is not null and not exists (select 1 from suppliers where id = p_supplier_id and hospital_id = v_hosp) then
    raise exception 'Поставщик не найден'; end if;
  if p_quantity_units is null or p_quantity_units <= 0 then raise exception 'Количество должно быть больше нуля'; end if;
  if p_purchase_price is null or p_purchase_price <= 0 then raise exception 'Цена закупки должна быть больше нуля'; end if;
  if coalesce(p_markup_percent, 0) < 0 then raise exception 'Наценка не может быть отрицательной'; end if;
  if p_drug_formulary_id is not null and p_expiry_date is null then raise exception 'Укажите срок годности препарата'; end if;
  if p_expiry_date is not null and p_expiry_date < current_date then raise exception 'Срок годности уже истёк'; end if;

  v_batch := _stock_add(v_hosp, p_warehouse_id, p_product_id, p_drug_formulary_id, p_supplier_id,
    nullif(btrim(p_series_number), ''), p_expiry_date, p_quantity_units, p_purchase_price, p_markup_percent, v_uid);
  perform _stock_log(v_hosp, p_warehouse_id, v_batch, p_product_id, p_drug_formulary_id, 'incoming', p_quantity_units, v_batch, v_uid);
  return v_batch;
end $$;

-- ============================================================
-- 4. Transfers: deduct at send, cancel/reject return stock
-- ============================================================
drop function if exists public.accept_transfer(uuid, uuid, uuid);

create or replace function public.send_transfer(p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid(); v_id uuid; r record; v_b record;
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
    select (e->>'batch_id')::uuid as batch_id, sum((e->>'quantity_units')::numeric) as qty
    from jsonb_array_elements(p_items) e group by 1 order by 1
  loop
    if r.qty is null or r.qty <= 0 then raise exception 'Количество должно быть больше нуля'; end if;
    select * into v_b from inventory_batches
      where id = r.batch_id and hospital_id = v_hosp and warehouse_id = p_from_warehouse_id for update;
    if not found then raise exception 'Партия не найдена на складе-отправителе'; end if;
    if v_b.quantity_units < r.qty then
      raise exception 'Недостаточно остатка в партии (доступно %, запрошено %)', v_b.quantity_units, r.qty; end if;
    update inventory_batches set quantity_units = quantity_units - r.qty where id = v_b.id;
    insert into transfer_record_items (transfer_record_id, hospital_id, inventory_batch_id, product_id, drug_formulary_id, quantity_packages, quantity_units)
      values (v_id, v_hosp, v_b.id, v_b.product_id, v_b.drug_formulary_id, 0, r.qty);
    perform _stock_log(v_hosp, p_from_warehouse_id, v_b.id, v_b.product_id, v_b.drug_formulary_id, 'transfer_out', -r.qty, v_id, v_uid);
  end loop;
  return v_id;
end $$;

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
      s.expiry_date, i.quantity_units, s.purchase_price, s.markup_percent, v_uid);
    perform _stock_log(v_hosp, t.to_warehouse_id, v_new, s.product_id, s.drug_formulary_id, 'transfer_in', i.quantity_units, t.id, v_uid);
  end loop;
  update transfer_records set status = 'accepted', accepted_by = v_uid, accepted_at = now() where id = t.id;
end $$;

create or replace function public._transfer_return_stock(p_transfer_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t record; i record; s record;
begin
  select * into t from transfer_records where id = p_transfer_id;
  for i in select * from transfer_record_items where transfer_record_id = p_transfer_id order by id loop
    select * into s from inventory_batches where id = i.inventory_batch_id for update;
    update inventory_batches set quantity_units = quantity_units + i.quantity_units where id = s.id;
    perform _stock_log(t.hospital_id, t.from_warehouse_id, s.id, s.product_id, s.drug_formulary_id, 'transfer_return', i.quantity_units, t.id, p_user);
  end loop;
end $$;

create or replace function public.cancel_transfer(p_transfer_record_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid(); t record;
begin
  select * into t from transfer_records where id = p_transfer_record_id and hospital_id = v_hosp for update;
  if not found then raise exception 'Перемещение не найдено'; end if;
  if not (has_permission('warehouse.transfer_send') and (t.sent_by = v_uid or can_access_warehouse(t.from_warehouse_id))) then
    raise exception 'Нет прав на отмену перемещения'; end if;
  if t.status <> 'pending_acceptance' then raise exception 'Перемещение уже обработано (статус: %)', t.status; end if;
  perform _transfer_return_stock(t.id, v_uid);
  update transfer_records set status = 'cancelled', cancelled_by = v_uid, cancelled_at = now() where id = t.id;
end $$;

create or replace function public.reject_transfer(p_transfer_record_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid(); t record;
begin
  if not has_permission('warehouse.transfer_accept') then raise exception 'Нет прав на отклонение перемещений'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'Укажите причину отклонения'; end if;
  select * into t from transfer_records where id = p_transfer_record_id and hospital_id = v_hosp for update;
  if not found then raise exception 'Перемещение не найдено'; end if;
  if not can_access_warehouse(t.to_warehouse_id) then raise exception 'Нет доступа к складу-получателю'; end if;
  if t.status <> 'pending_acceptance' then raise exception 'Перемещение уже обработано (статус: %)', t.status; end if;
  perform _transfer_return_stock(t.id, v_uid);
  update transfer_records set status = 'rejected', rejected_by = v_uid, rejected_at = now(), reject_reason = btrim(p_reason) where id = t.id;
end $$;

-- ============================================================
-- 5. Write-offs
-- ============================================================
drop function if exists public.perform_writeoff(uuid, uuid, uuid, uuid, uuid, text, uuid, jsonb);

create or replace function public.perform_writeoff(
  p_warehouse_id uuid, p_write_off_type_id uuid, p_employee_id uuid, p_supplier_id uuid, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid(); w record; v_code text; v_rec uuid;
  e jsonb; v_qty numeric; v_left numeric; v_use numeric; b record;
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

drop function if exists public.writeoff_to_patient(uuid, numeric, uuid, uuid, uuid, text);

create or replace function public.writeoff_to_patient(
  p_batch_id uuid, p_quantity_units numeric, p_hospitalization_id uuid, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid(); b record; w record; v_tx uuid;
  v_inv uuid; v_price numeric; v_name text;
begin
  if p_quantity_units is null or p_quantity_units <= 0 then raise exception 'Количество должно быть больше нуля'; end if;
  select * into b from inventory_batches where id = p_batch_id and hospital_id = v_hosp for update;
  if not found then raise exception 'Партия не найдена'; end if;
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

-- ============================================================
-- 6. dispense_slot (pharmacy -> department stock for a prescription slot)
-- ============================================================
drop function if exists public.dispense_slot(uuid, uuid, uuid);

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
  v_new := _stock_add(v_hosp, v_dept, null, rx.drug_formulary_id, b.supplier_id, b.series_number, b.expiry_date, v_qty, b.purchase_price, b.markup_percent, v_uid);
  perform _stock_log(v_hosp, v_dept, v_new, null, rx.drug_formulary_id, 'transfer_in', v_qty, p_slot_id, v_uid);

  update drug_administration_slots set dept_batch_id = v_new, dispense_status = 'ready_for_execution',
    dispense_changed_at = now(), dispense_changed_by = v_uid where id = p_slot_id;
  return v_new;
end $$;

-- administer_drug has no caller and no authorization; close the hole (re-introduce hardened when wired into the nurse flow)
revoke execute on function public.administer_drug(uuid, uuid, uuid, text) from public, anon, authenticated;

-- ============================================================
-- 7. Grants & lock-down of direct writes
-- ============================================================
revoke all on function public._stock_add(uuid,uuid,uuid,uuid,uuid,text,date,numeric,numeric,numeric,uuid) from public, anon, authenticated;
revoke all on function public._stock_log(uuid,uuid,uuid,uuid,uuid,text,numeric,uuid,uuid) from public, anon, authenticated;
revoke all on function public._transfer_return_stock(uuid,uuid) from public, anon, authenticated;

revoke execute on function public.can_access_warehouse(uuid) from public, anon;
revoke execute on function public.receive_stock(uuid,uuid,uuid,uuid,text,date,numeric,numeric,numeric) from public, anon;
revoke execute on function public.send_transfer(uuid,uuid,text,jsonb) from public, anon;
revoke execute on function public.accept_transfer(uuid) from public, anon;
revoke execute on function public.cancel_transfer(uuid) from public, anon;
revoke execute on function public.reject_transfer(uuid,text) from public, anon;
revoke execute on function public.perform_writeoff(uuid,uuid,uuid,uuid,text,jsonb) from public, anon;
revoke execute on function public.writeoff_to_patient(uuid,numeric,uuid,text) from public, anon;
revoke execute on function public.dispense_slot(uuid) from public, anon;
grant execute on function public.can_access_warehouse(uuid) to authenticated;
grant execute on function public.receive_stock(uuid,uuid,uuid,uuid,text,date,numeric,numeric,numeric) to authenticated;
grant execute on function public.send_transfer(uuid,uuid,text,jsonb) to authenticated;
grant execute on function public.accept_transfer(uuid) to authenticated;
grant execute on function public.cancel_transfer(uuid) to authenticated;
grant execute on function public.reject_transfer(uuid,text) to authenticated;
grant execute on function public.perform_writeoff(uuid,uuid,uuid,uuid,text,jsonb) to authenticated;
grant execute on function public.writeoff_to_patient(uuid,numeric,uuid,text) to authenticated;
grant execute on function public.dispense_slot(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['inventory_batches','inventory_transactions','transfer_records','transfer_record_items','write_off_records','write_off_record_items'] loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated, anon', t);
    execute format('revoke select on public.%I from anon', t);
  end loop;
end $$;

drop policy if exists inventory_batches_insert on public.inventory_batches;
drop policy if exists inventory_batches_update on public.inventory_batches;
drop policy if exists inventory_transactions_insert on public.inventory_transactions;
drop policy if exists transfer_records_insert on public.transfer_records;
drop policy if exists transfer_records_update on public.transfer_records;
drop policy if exists transfer_record_items_insert on public.transfer_record_items;
drop policy if exists write_off_records_insert on public.write_off_records;
drop policy if exists write_off_record_items_insert on public.write_off_record_items;
