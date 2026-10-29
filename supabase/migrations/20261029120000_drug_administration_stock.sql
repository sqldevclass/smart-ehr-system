-- Drug administration consumes department stock (authorized, atomic), direct "done" updates are blocked.

insert into public.permissions (code, name_ru, name_en, module, access_type)
values ('medication.administer', 'Выполнение назначений (введение препаратов)', 'Administer drugs', 'medication', 'write')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.code in ('admin', 'inpatient_nurse', 'head_nurse') and p.code = 'medication.administer'
on conflict do nothing;

drop function if exists public.administer_drug(uuid, uuid, uuid, text);

create or replace function public.administer_drug(
  p_slot_id uuid, p_dose_given text default null, p_administered_at timestamptz default null, p_notes text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid();
  s record; rx record; v_wh uuid; v_qty numeric; v_valid numeric; v_expired numeric; v_left numeric; v_use numeric;
  b record; v_inv uuid; v_tx uuid; v_at timestamp := (coalesce(p_administered_at, now()) at time zone 'UTC');
begin
  if not has_permission('medication.administer') then raise exception 'Нет прав на выполнение назначений'; end if;
  select * into s from drug_administration_slots where id = p_slot_id and hospital_id = v_hosp for update;
  if not found then raise exception 'Назначение не найдено'; end if;
  if s.status <> 'pending' then raise exception 'Назначение уже обработано (статус: %)', s.status; end if;

  select dp.is_patient_own_drug, dp.drug_formulary_id, df.min_write_off_qty, df.trade_name into rx
    from drug_prescriptions dp left join drug_formulary df on df.id = dp.drug_formulary_id
    where dp.id = s.prescription_id and dp.hospital_id = v_hosp;
  if not found then raise exception 'Назначение не найдено'; end if;

  perform set_config('app.administering', 'on', true);

  if not coalesce(rx.is_patient_own_drug, false) then
    if s.dispense_status <> 'ready_for_execution' then
      raise exception 'Препарат ещё не принят из аптеки (статус: %)', s.dispense_status; end if;
    v_qty := coalesce(rx.min_write_off_qty, 1);

    select w.id into v_wh from hospitalizations h
      join warehouses w on w.department_id = h.department_id and w.hospital_id = v_hosp and w.is_active
      where h.id = s.hospitalization_id;
    if v_wh is null then raise exception 'Склад отделения не найден'; end if;

    select coalesce(sum(quantity_units) filter (where expiry_date is null or expiry_date >= current_date), 0),
           coalesce(sum(quantity_units) filter (where expiry_date < current_date), 0)
      into v_valid, v_expired
      from inventory_batches
      where warehouse_id = v_wh and hospital_id = v_hosp and drug_formulary_id = rx.drug_formulary_id and quantity_units > 0;
    if v_valid < v_qty then
      if v_expired > 0 then
        raise exception 'Препарат «%» в отделении просрочен — введение невозможно. Запросите новую партию в аптеке', rx.trade_name;
      end if;
      raise exception 'Недостаточно препарата «%» в отделении (нужно %, есть %). Дождитесь поступления из аптеки', rx.trade_name, v_qty, v_valid;
    end if;

    select id into v_inv from invoices
      where hospitalization_id = s.hospitalization_id and hospital_id = v_hosp and status = 'active' limit 1;

    v_left := v_qty;
    for b in
      select * from inventory_batches
      where warehouse_id = v_wh and hospital_id = v_hosp and drug_formulary_id = rx.drug_formulary_id
        and quantity_units > 0 and (expiry_date is null or expiry_date >= current_date)
      order by coalesce(expiry_date, '9999-12-31'), received_at
      for update
    loop
      exit when v_left <= 0;
      v_use := least(v_left, b.quantity_units);
      update inventory_batches set quantity_units = quantity_units - v_use where id = b.id;
      v_tx := _stock_log(v_hosp, v_wh, b.id, null, rx.drug_formulary_id, 'consumable', -v_use, p_slot_id, v_uid);
      if v_inv is not null and coalesce(b.selling_price, 0) * v_use > 0 then
        insert into invoice_items (invoice_id, visit_service_id, amount, description, inventory_transaction_id)
        values (v_inv, null, b.selling_price * v_use, coalesce(rx.trade_name, 'Препарат') || ' × ' || v_use, v_tx);
      end if;
      v_left := v_left - v_use;
    end loop;
  end if;

  update drug_administration_slots set
    status = 'done', administered_at = v_at, administered_by = v_uid,
    dose_given = coalesce(p_dose_given, dose_given), notes = coalesce(p_notes, notes),
    dispense_status = 'completed', dispense_changed_at = now(), dispense_changed_by = v_uid
  where id = p_slot_id;
end $$;

revoke execute on function public.administer_drug(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.administer_drug(uuid, text, timestamptz, text) to authenticated;

-- direct "done" updates would bypass stock: only administer_drug may complete a slot
create or replace function public.drug_slots_guard_done()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'done' and old.status is distinct from 'done'
     and coalesce(current_setting('app.administering', true), '') <> 'on' then
    raise exception 'Выполнить назначение можно только через administer_drug';
  end if;
  return new;
end $$;
drop trigger if exists drug_slots_guard_done_trg on public.drug_administration_slots;
create trigger drug_slots_guard_done_trg before update on public.drug_administration_slots
  for each row execute function public.drug_slots_guard_done();

-- backfill: slots already done with a department batch but never consumed from stock
do $$
declare s record; b record; v_left numeric; v_use numeric; v_qty numeric; v_wh uuid; v_drug uuid; v_done int := 0; v_partial int := 0; v_skipped int := 0; v_units numeric := 0;
begin
  for s in
    select sl.id, sl.hospital_id, sl.dept_batch_id, sl.administered_at, sl.administered_by, dp.is_patient_own_drug
    from drug_administration_slots sl
    join drug_prescriptions dp on dp.id = sl.prescription_id
    where sl.status = 'done' and sl.dept_batch_id is not null and not coalesce(dp.is_patient_own_drug, false)
      and not exists (select 1 from inventory_transactions t where t.reference_id = sl.id and t.source_type = 'consumable')
    order by sl.administered_at nulls last, sl.id
  loop
    select warehouse_id, drug_formulary_id into v_wh, v_drug from inventory_batches where id = s.dept_batch_id;
    if v_drug is null then v_skipped := v_skipped + 1; continue; end if;
    select coalesce(df.min_write_off_qty, 1) into v_qty from drug_formulary df where df.id = v_drug;
    v_left := v_qty;
    for b in select * from inventory_batches
      where warehouse_id = v_wh and drug_formulary_id = v_drug and quantity_units > 0
      order by coalesce(expiry_date, '9999-12-31'), received_at for update
    loop
      exit when v_left <= 0;
      v_use := least(v_left, b.quantity_units);
      update inventory_batches set quantity_units = quantity_units - v_use where id = b.id;
      insert into inventory_transactions (hospital_id, warehouse_id, inventory_batch_id, product_id, drug_formulary_id,
        source_type, quantity_packages, quantity_units, reference_id, performed_by, performed_at)
      values (s.hospital_id, v_wh, b.id, null, v_drug, 'consumable', 0, -v_use, s.id, s.administered_by,
        coalesce((s.administered_at at time zone 'UTC'), now()));
      v_left := v_left - v_use; v_units := v_units + v_use;
    end loop;
    if v_left = v_qty then v_skipped := v_skipped + 1;
    elsif v_left > 0 then v_partial := v_partial + 1;
    else v_done := v_done + 1; end if;
  end loop;
  raise notice 'administration backfill: full=%, partial=%, skipped(no stock)=%, units=%', v_done, v_partial, v_skipped, v_units;
end $$;
