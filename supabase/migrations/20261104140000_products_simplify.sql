-- Warehouse products: simplify to the attributes the warehouse actually uses.
-- Removed: inn (МНН), packaging_type_id (Упаковка), units_per_package (Единиц в упаковке).
-- «Форма выпуска» is now the single "how it is supplied" field, so Коробка and Рулон become warehouse release forms.

-- 1) readers of products.inn first (the columns cannot be dropped while they depend on it)
create or replace view public.general_clinic_stock as
 select ib.hospital_id,
    ib.warehouse_id,
    w.name as warehouse_name,
    wt.code as warehouse_type,
    ib.product_id,
    null::uuid as drug_formulary_id,
    p.name as item_name,
    pt.code as product_type,
    null::text as inn,
    u.abbreviation as unit,
    coalesce(sum(ib.quantity_units), 0::numeric) as total_units,
    min(ib.expiry_date) as earliest_expiry,
    count(ib.id) as batch_count
   from public.inventory_batches ib
     join public.warehouses w on w.id = ib.warehouse_id
     join public.warehouse_types wt on wt.id = w.warehouse_type_id
     join public.products p on p.id = ib.product_id
     join public.product_types pt on pt.id = p.product_type_id
     left join public.units_of_measurement u on u.id = p.unit_id
  where ib.product_id is not null
    and coalesce(ib.quantity_units, 0::numeric) > 0::numeric
    and ib.hospital_id = public.get_my_hospital_id()
  group by ib.hospital_id, ib.warehouse_id, w.name, wt.code, ib.product_id, p.name, pt.code, u.abbreviation
union all
 select ib.hospital_id,
    ib.warehouse_id,
    w.name as warehouse_name,
    wt.code as warehouse_type,
    null::uuid as product_id,
    ib.drug_formulary_id,
    df.trade_name as item_name,
    'medications'::text as product_type,
    df.inn,
    u.abbreviation as unit,
    coalesce(sum(ib.quantity_units), 0::numeric) as total_units,
    min(ib.expiry_date) as earliest_expiry,
    count(ib.id) as batch_count
   from public.inventory_batches ib
     join public.warehouses w on w.id = ib.warehouse_id
     join public.warehouse_types wt on wt.id = w.warehouse_type_id
     join public.drug_formulary df on df.id = ib.drug_formulary_id
     left join public.units_of_measurement u on u.id = df.unit_id
  where ib.drug_formulary_id is not null
    and coalesce(ib.quantity_units, 0::numeric) > 0::numeric
    and ib.hospital_id = public.get_my_hospital_id()
  group by ib.hospital_id, ib.warehouse_id, w.name, wt.code, ib.drug_formulary_id, df.trade_name, df.inn, u.abbreviation;

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
  select case when ib.drug_formulary_id is not null then 'drug' else 'product' end,
         coalesce(ib.drug_formulary_id, ib.product_id),
         coalesce(df.trade_name, p.name), df.inn, df.dose, uom.name_ru,
         sum(ib.quantity_units), min(ib.expiry_date)
  from inventory_batches ib
  left join drug_formulary df on df.id = ib.drug_formulary_id
  left join products p on p.id = ib.product_id
  left join units_of_measurement uom on uom.id = coalesce(df.unit_id, p.unit_id)
  where ib.hospital_id = v_hosp and ib.warehouse_id = p_from_warehouse_id and ib.quantity_units > 0
    and (ib.expiry_date is null or ib.expiry_date >= current_date)
  group by 1, 2, 3, 4, 5, 6
  order by 3
  limit 2000;
end $$;

-- 2) the search column was generated from name + inn + barcode: rebuild it from name + barcode
alter table public.products drop column search_norm;
alter table public.products drop column inn;
alter table public.products drop column packaging_type_id;
alter table public.products drop column units_per_package;

alter table public.products add column search_norm text generated always as (
  lower(regexp_replace(coalesce(name, ''), '[^[:alnum:]]', '', 'g') || '|' || regexp_replace(coalesce(barcode, ''), '[^[:alnum:]]', '', 'g'))
) stored;
create index products_search_norm_trgm_idx on public.products using gin (search_norm extensions.gin_trgm_ops);

-- 3) a barcode identifies one product per hospital (scanning must not be ambiguous)
create unique index products_hospital_barcode_uq on public.products (hospital_id, barcode)
  where barcode is not null and barcode <> '';

-- 4) the warehouse's "how it is supplied" values from the clinic structure doc
insert into public.release_forms (code, name_ru, name_en, sort_order, hospital_id, scope)
select v.code, v.name_ru, v.name_en, v.sort_order, null, 'warehouse'
from (values ('box', 'Коробка', 'Box', 102), ('roll', 'Рулон', 'Roll', 103)) v(code, name_ru, name_en, sort_order)
where not exists (select 1 from public.release_forms r where r.code = v.code and r.hospital_id is null);
