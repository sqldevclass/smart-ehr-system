-- Pharmacy / warehouse separation of reference data.
-- scope: 'pharmacy' | 'warehouse' (hospital-owned rows); 'shared' = system-wide default rows (hospital_id IS NULL).
-- units_of_measurement stays shared (used by prescriptions and service consumables).

alter table public.suppliers       add column scope text;
alter table public.manufacturers   add column scope text;
alter table public.release_forms   add column scope text;
alter table public.packaging_types add column scope text;

-- system catalog rows are shared by both areas
update public.release_forms   set scope = 'shared' where hospital_id is null;
update public.packaging_types set scope = 'shared' where hospital_id is null;

-- uniqueness becomes per scope
alter table public.suppliers     drop constraint if exists suppliers_hospital_id_name_key;
drop index if exists public.suppliers_hospital_id_name_key;
alter table public.manufacturers drop constraint if exists manufacturers_hospital_id_name_key;
drop index if exists public.manufacturers_hospital_id_name_key;
alter table public.release_forms   drop constraint if exists release_forms_code_hospital_unique;
drop index if exists public.release_forms_code_hospital_unique;
alter table public.packaging_types drop constraint if exists packaging_types_code_hospital_unique;
drop index if exists public.packaging_types_code_hospital_unique;

-- ---------------------------------------------------------------
-- Backfill. Used by one side -> that scope. Used by both -> cloned and re-pointed. Unused -> copied to both.
-- ---------------------------------------------------------------
do $$
declare r record; v_ph boolean; v_wh boolean; v_new uuid;
begin
  -- manufacturers: drugs = pharmacy; products and equipment = warehouse
  for r in select * from public.manufacturers where scope is null loop
    v_ph := exists (select 1 from public.drug_formulary where manufacturer_id = r.id);
    v_wh := exists (select 1 from public.products where manufacturer_id = r.id)
         or exists (select 1 from public.equipment where manufacturer_id = r.id);
    if v_wh and not v_ph then
      update public.manufacturers set scope = 'warehouse' where id = r.id;
    else
      update public.manufacturers set scope = 'pharmacy' where id = r.id;
      if v_wh or not v_ph then
        insert into public.manufacturers (hospital_id, name, country, is_active, created_at, scope)
        values (r.hospital_id, r.name, r.country, r.is_active, r.created_at, 'warehouse') returning id into v_new;
        update public.products  set manufacturer_id = v_new where manufacturer_id = r.id;
        update public.equipment set manufacturer_id = v_new where manufacturer_id = r.id;
      end if;
    end if;
  end loop;

  -- suppliers: batches by item kind (drug = pharmacy, product = warehouse); write-offs by warehouse type
  for r in select * from public.suppliers where scope is null loop
    v_ph := exists (select 1 from public.inventory_batches where supplier_id = r.id and drug_formulary_id is not null)
         or exists (select 1 from public.write_off_records o join public.warehouses w on w.id = o.warehouse_id
                    join public.warehouse_types wt on wt.id = w.warehouse_type_id
                    where o.supplier_id = r.id and wt.code = 'central_pharmacy');
    v_wh := exists (select 1 from public.inventory_batches where supplier_id = r.id and product_id is not null)
         or exists (select 1 from public.write_off_records o join public.warehouses w on w.id = o.warehouse_id
                    join public.warehouse_types wt on wt.id = w.warehouse_type_id
                    where o.supplier_id = r.id and wt.code = 'general');
    if v_wh and not v_ph then
      update public.suppliers set scope = 'warehouse' where id = r.id;
    else
      update public.suppliers set scope = 'pharmacy' where id = r.id;
      if v_wh or not v_ph then
        insert into public.suppliers (hospital_id, name, contact, phone, email, address, is_active, created_at, scope)
        values (r.hospital_id, r.name, r.contact, r.phone, r.email, r.address, r.is_active, r.created_at, 'warehouse') returning id into v_new;
        update public.inventory_batches set supplier_id = v_new where supplier_id = r.id and product_id is not null;
        update public.write_off_records set supplier_id = v_new
          where supplier_id = r.id and warehouse_id in (select w.id from public.warehouses w
                join public.warehouse_types wt on wt.id = w.warehouse_type_id where wt.code = 'general');
      end if;
    end if;
  end loop;

  -- hospital-added release forms (created from pharmacy settings): pharmacy unless only products use them
  for r in select * from public.release_forms where scope is null loop
    v_ph := exists (select 1 from public.drug_formulary where release_form_id = r.id);
    v_wh := exists (select 1 from public.products where release_form_id = r.id);
    if v_wh and not v_ph then
      update public.release_forms set scope = 'warehouse' where id = r.id;
    else
      update public.release_forms set scope = 'pharmacy' where id = r.id;
      if v_wh then
        insert into public.release_forms (code, name_ru, name_en, sort_order, hospital_id, scope)
        values (r.code, r.name_ru, r.name_en, r.sort_order, r.hospital_id, 'warehouse') returning id into v_new;
        update public.products set release_form_id = v_new where release_form_id = r.id;
      end if;
    end if;
  end loop;

  for r in select * from public.packaging_types where scope is null loop
    v_ph := exists (select 1 from public.drug_formulary where packaging_id = r.id);
    v_wh := exists (select 1 from public.products where packaging_type_id = r.id);
    if v_wh and not v_ph then
      update public.packaging_types set scope = 'warehouse' where id = r.id;
    else
      update public.packaging_types set scope = 'pharmacy' where id = r.id;
      if v_wh then
        insert into public.packaging_types (code, name_ru, name_en, sort_order, hospital_id, scope)
        values (r.code, r.name_ru, r.name_en, r.sort_order, r.hospital_id, 'warehouse') returning id into v_new;
        update public.products set packaging_type_id = v_new where packaging_type_id = r.id;
      end if;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------
-- Invariants
-- ---------------------------------------------------------------
alter table public.suppliers       alter column scope set not null;
alter table public.manufacturers   alter column scope set not null;
alter table public.release_forms   alter column scope set not null;
alter table public.packaging_types alter column scope set not null;

alter table public.suppliers     add constraint suppliers_scope_chk     check (scope in ('pharmacy', 'warehouse'));
alter table public.manufacturers add constraint manufacturers_scope_chk check (scope in ('pharmacy', 'warehouse'));
alter table public.release_forms   add constraint release_forms_scope_chk
  check (scope in ('pharmacy', 'warehouse', 'shared') and ((hospital_id is null) = (scope = 'shared')));
alter table public.packaging_types add constraint packaging_types_scope_chk
  check (scope in ('pharmacy', 'warehouse', 'shared') and ((hospital_id is null) = (scope = 'shared')));

create unique index suppliers_hospital_scope_name_key     on public.suppliers (hospital_id, scope, name);
create unique index manufacturers_hospital_scope_name_key on public.manufacturers (hospital_id, scope, name);
create unique index release_forms_code_hospital_scope_key   on public.release_forms (code, hospital_id, scope);
create unique index packaging_types_code_hospital_scope_key on public.packaging_types (code, hospital_id, scope);

-- ---------------------------------------------------------------
-- Guards: the database, not only the UI, keeps the two areas apart
-- ---------------------------------------------------------------
create or replace function public._guard_scope_immutable()
returns trigger language plpgsql as $$
begin
  if new.scope is distinct from old.scope then raise exception 'Раздел записи (аптека / склад) изменить нельзя'; end if;
  return new;
end $$;

create trigger suppliers_scope_immutable       before update on public.suppliers       for each row execute function public._guard_scope_immutable();
create trigger manufacturers_scope_immutable   before update on public.manufacturers   for each row execute function public._guard_scope_immutable();
create trigger release_forms_scope_immutable   before update on public.release_forms   for each row execute function public._guard_scope_immutable();
create trigger packaging_types_scope_immutable before update on public.packaging_types for each row execute function public._guard_scope_immutable();

-- catalog rows (drug_formulary / products / equipment) may only reference their own area's lookups or shared ones
create or replace function public._guard_catalog_scope()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_expected text := tg_argv[0]; v_row jsonb := to_jsonb(new); r record; v_id uuid; v_scope text;
begin
  for r in select * from (values
      ('manufacturer_id', 'manufacturers', 'Производитель'),
      ('release_form_id', 'release_forms', 'Форма выпуска'),
      ('packaging_id', 'packaging_types', 'Упаковка'),
      ('packaging_type_id', 'packaging_types', 'Упаковка')) v(col, tbl, label) loop
    v_id := nullif(v_row ->> r.col, '')::uuid;
    if v_id is not null then
      execute format('select scope from public.%I where id = $1', r.tbl) into v_scope using v_id;
      if v_scope is distinct from v_expected and v_scope is distinct from 'shared' then
        raise exception '% относится к другому разделу (%)', r.label, case v_expected when 'pharmacy' then 'нужен раздел «Аптека»' else 'нужен раздел «Склад»' end;
      end if;
    end if;
  end loop;
  return new;
end $$;

create trigger drug_formulary_scope_guard before insert or update on public.drug_formulary for each row execute function public._guard_catalog_scope('pharmacy');
create trigger products_scope_guard       before insert or update on public.products       for each row execute function public._guard_catalog_scope('warehouse');
create trigger equipment_scope_guard      before insert or update on public.equipment      for each row execute function public._guard_catalog_scope('warehouse');

-- suppliers: batches by item kind, write-offs by warehouse type (department write-offs are not restricted)
create or replace function public._guard_supplier_scope()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_expected text; v_scope text;
begin
  if new.supplier_id is null then return new; end if;
  if tg_table_name = 'inventory_batches' then
    v_expected := case when new.drug_formulary_id is not null then 'pharmacy' else 'warehouse' end;
  else
    select case wt.code when 'central_pharmacy' then 'pharmacy' when 'general' then 'warehouse' end into v_expected
      from warehouses w join warehouse_types wt on wt.id = w.warehouse_type_id where w.id = new.warehouse_id;
  end if;
  if v_expected is null then return new; end if;
  select scope into v_scope from suppliers where id = new.supplier_id;
  if v_scope is distinct from v_expected then
    raise exception 'Поставщик относится к другому разделу (нужен поставщик раздела «%»)', case v_expected when 'pharmacy' then 'Аптека' else 'Склад' end;
  end if;
  return new;
end $$;

create trigger inventory_batches_supplier_scope_guard before insert or update of supplier_id on public.inventory_batches for each row execute function public._guard_supplier_scope();
create trigger write_off_records_supplier_scope_guard before insert or update of supplier_id on public.write_off_records for each row execute function public._guard_supplier_scope();
