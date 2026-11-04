-- Pharmacy / warehouse scope, part 2:
--  * units_of_measurement and product_types get the scope flag
--  * system release forms / packaging / units / product types are re-flagged per row
--  * guards also cover unit_id and product_type_id
--  * junk test rows removed, missing warehouse reference rows added

alter table public.product_types         add column scope text;
alter table public.units_of_measurement  add column scope text;

-- System rows may now belong to one side only, so "no hospital <=> shared" no longer holds.
alter table public.release_forms   drop constraint release_forms_scope_chk;
alter table public.packaging_types drop constraint packaging_types_scope_chk;
alter table public.release_forms   add constraint release_forms_scope_chk   check (scope in ('pharmacy', 'warehouse', 'shared'));
alter table public.packaging_types add constraint packaging_types_scope_chk check (scope in ('pharmacy', 'warehouse', 'shared'));

-- junk rows created while testing (all unused; FKs protect anything referenced)
delete from public.release_forms          where hospital_id is not null and code = 'cf74311c_1779177286102';
delete from public.units_of_measurement   where hospital_id is not null and code = 'cf74311c_1779177253958';
delete from public.packaging_types        where hospital_id is not null and code = 'cf74311c_1779212358481';

-- re-flag system rows (the immutability trigger is for users, not for this one-time correction)
alter table public.release_forms   disable trigger release_forms_scope_immutable;
alter table public.packaging_types disable trigger packaging_types_scope_immutable;

update public.release_forms set scope = 'pharmacy'
 where hospital_id is null and code in ('ampoule', 'gel', 'granules', 'drops', 'capsule', 'cream', 'ointment', 'tincture',
       'paste', 'patch', 'prefilled_syringe', 'syrup', 'spray', 'suppository', 'suspension', 'tablet', 'vial');

update public.packaging_types set scope = 'pharmacy'
 where hospital_id is null and code in ('cartridge', 'prefilled_syringe', 'tube', 'vial');

alter table public.release_forms   enable trigger release_forms_scope_immutable;
alter table public.packaging_types enable trigger packaging_types_scope_immutable;

-- reference rows the warehouse was missing
insert into public.release_forms (code, name_ru, name_en, sort_order, hospital_id, scope)
select v.code, v.name_ru, v.name_en, v.sort_order, null, 'warehouse'
from (values ('piece', 'Штучный', 'Piece', 100), ('set', 'Комплект', 'Set', 101)) v(code, name_ru, name_en, sort_order)
where not exists (select 1 from public.release_forms r where r.code = v.code and r.hospital_id is null);

insert into public.product_types (code, name_ru, name_en, sort_order, hospital_id, scope)
select 'inventory', 'Инвентарь', 'Inventory', coalesce((select max(sort_order) from public.product_types), 0) + 1, null, 'warehouse'
where not exists (select 1 from public.product_types where code = 'inventory' and hospital_id is null);

-- units: pharmacy / warehouse / shared (everything else, incl. vitals units, stays shared)
update public.units_of_measurement set scope = 'pharmacy'
 where hospital_id is null and code in ('mcg', 'mg', 'iu', 'dose', 'drops', 'tab', 'amp', 'vial');
update public.units_of_measurement set scope = 'warehouse'
 where hospital_id is null and code in ('m', 'cm', 'roll', 'pair');
update public.units_of_measurement set scope = 'shared' where scope is null;

-- product types: only "Медикаменты" is pharmacy
update public.product_types set scope = 'pharmacy'  where code = 'medications';
update public.product_types set scope = 'warehouse' where scope is null;

alter table public.units_of_measurement alter column scope set not null;
alter table public.product_types        alter column scope set not null;
alter table public.units_of_measurement add constraint units_of_measurement_scope_chk check (scope in ('pharmacy', 'warehouse', 'shared'));
alter table public.product_types        add constraint product_types_scope_chk        check (scope in ('pharmacy', 'warehouse', 'shared'));

create trigger units_of_measurement_scope_immutable before update on public.units_of_measurement for each row execute function public._guard_scope_immutable();
create trigger product_types_scope_immutable        before update on public.product_types        for each row execute function public._guard_scope_immutable();

-- the catalog guard now also checks the unit and the product type
create or replace function public._guard_catalog_scope()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_expected text := tg_argv[0]; v_row jsonb := to_jsonb(new); r record; v_id uuid; v_scope text;
begin
  for r in select * from (values
      ('manufacturer_id', 'manufacturers', 'Производитель'),
      ('release_form_id', 'release_forms', 'Форма выпуска'),
      ('packaging_id', 'packaging_types', 'Упаковка'),
      ('packaging_type_id', 'packaging_types', 'Упаковка'),
      ('unit_id', 'units_of_measurement', 'Единица измерения'),
      ('product_type_id', 'product_types', 'Вид товара')) v(col, tbl, label) loop
    v_id := nullif(v_row ->> r.col, '')::uuid;
    if v_id is not null then
      execute format('select scope from public.%I where id = $1', r.tbl) into v_scope using v_id;
      if v_scope is distinct from v_expected and v_scope is distinct from 'shared' then
        raise exception '% относится к другому разделу (%)', r.label,
          case v_expected when 'pharmacy' then 'нужен раздел «Аптека»' else 'нужен раздел «Склад»' end;
      end if;
    end if;
  end loop;
  return new;
end $$;
