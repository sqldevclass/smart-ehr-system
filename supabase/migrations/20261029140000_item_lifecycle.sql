-- Товарооборот: item lifecycle diagram data + movement history

create index if not exists inventory_transactions_hosp_drug_idx
  on public.inventory_transactions (hospital_id, drug_formulary_id) where drug_formulary_id is not null;
create index if not exists inventory_transactions_hosp_product_idx
  on public.inventory_transactions (hospital_id, product_id) where product_id is not null;
create index if not exists inventory_transactions_reference_idx
  on public.inventory_transactions (reference_id) where reference_id is not null;

-- p_kind: 'drug' | 'product'; p_item_id: one item or NULL for all items of the kind
create or replace function public.get_item_lifecycle(p_kind text, p_item_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_hosp uuid := get_my_hospital_id();
  v_unit text; v_name text; v_res jsonb;
begin
  if not has_permission('warehouse.view_all') then raise exception 'Нет прав на просмотр товарооборота'; end if;
  if p_kind not in ('drug', 'product') then raise exception 'Укажите тип: препарат или товар'; end if;

  if p_item_id is not null then
    if p_kind = 'drug' then
      select df.trade_name, uom.name_ru into v_name, v_unit from drug_formulary df
        left join units_of_measurement uom on uom.id = df.unit_id where df.id = p_item_id and df.hospital_id = v_hosp;
    else
      select p.name, uom.name_ru into v_name, v_unit from products p
        left join units_of_measurement uom on uom.id = p.unit_id where p.id = p_item_id and p.hospital_id = v_hosp;
    end if;
    if v_name is null then raise exception 'Позиция не найдена'; end if;
  end if;

  with l as (   -- ledger rows in scope, valued at purchase price of their batch
    select t.source_type, t.quantity_units as qty, wt.code as wh_type, tr_from_wt.code as from_type,
           coalesce(t.drug_formulary_id, t.product_id) as item_id,
           t.quantity_units * coalesce(ib.purchase_price, 0) as val, t.reference_id
    from inventory_transactions t
    join inventory_batches ib on ib.id = t.inventory_batch_id
    join warehouses w on w.id = t.warehouse_id
    join warehouse_types wt on wt.id = w.warehouse_type_id
    left join transfer_records tr on tr.id = t.reference_id and t.source_type in ('transfer_in', 'transfer_return')
    left join warehouses fw on fw.id = tr.from_warehouse_id
    left join warehouse_types tr_from_wt on tr_from_wt.id = fw.warehouse_type_id
    where t.hospital_id = v_hosp
      and case when p_kind = 'drug' then t.drug_formulary_id is not null else t.product_id is not null end
      and (p_item_id is null or coalesce(t.drug_formulary_id, t.product_id) = p_item_id)
  ),
  sums as (
    select
      jsonb_build_object('units', coalesce(sum(qty) filter (where source_type = 'incoming'), 0),
                         'value', coalesce(sum(val) filter (where source_type = 'incoming'), 0),
                         'items', count(distinct item_id) filter (where source_type = 'incoming')) as received,
      jsonb_build_object('units', coalesce(-sum(qty) filter (where source_type = 'consumable'), 0),
                         'value', coalesce(-sum(val) filter (where source_type = 'consumable'), 0),
                         'items', count(distinct item_id) filter (where source_type = 'consumable')) as patient,
      jsonb_build_object('units', coalesce(-sum(qty) filter (where source_type = 'writeoff'), 0),
                         'value', coalesce(-sum(val) filter (where source_type = 'writeoff'), 0),
                         'items', count(distinct item_id) filter (where source_type = 'writeoff')) as written_off,
      jsonb_build_object(
        'to_departments', jsonb_build_object(
           'units', coalesce(sum(qty) filter (where source_type = 'transfer_in' and wh_type = 'department'), 0),
           'value', coalesce(sum(val) filter (where source_type = 'transfer_in' and wh_type = 'department'), 0)),
        'returns_to_stock', jsonb_build_object(
           'units', coalesce(sum(qty) filter (where (source_type = 'transfer_in' and wh_type <> 'department' and from_type = 'department')
                                                  or source_type = 'transfer_return'), 0),
           'value', coalesce(sum(val) filter (where (source_type = 'transfer_in' and wh_type <> 'department' and from_type = 'department')
                                                  or source_type = 'transfer_return'), 0))) as edges
    from l
  ),
  wo as (
    select coalesce(jsonb_agg(jsonb_build_object('code', x.code, 'name', x.name_ru, 'units', x.units, 'value', x.value, 'items', x.items)), '[]'::jsonb) as write_off_types
    from (
      select wot.code, wot.name_ru, sum(-l.qty) as units, sum(-l.val) as value, count(distinct l.item_id) as items
      from l join write_off_records r on r.id = l.reference_id join write_off_types wot on wot.id = r.write_off_type_id
      where l.source_type = 'writeoff' group by wot.code, wot.name_ru
    ) x
  ),
  whs as (   -- current stock per warehouse
    select coalesce(jsonb_agg(jsonb_build_object(
             'warehouse_id', w.id, 'name', w.name, 'type_code', wt.code, 'department_name', d.name, 'is_active', w.is_active,
             'units', coalesce(s.units, 0), 'value', coalesce(s.value, 0), 'items', coalesce(s.items, 0)
           ) order by wt.sort_order, w.name), '[]'::jsonb) as warehouses
    from warehouses w
    join warehouse_types wt on wt.id = w.warehouse_type_id
    left join departments d on d.id = w.department_id
    left join lateral (
      select sum(ib.quantity_units) as units, sum(ib.quantity_units * coalesce(ib.purchase_price, 0)) as value,
             count(distinct coalesce(ib.drug_formulary_id, ib.product_id)) as items
      from inventory_batches ib
      where ib.warehouse_id = w.id and ib.quantity_units > 0
        and case when p_kind = 'drug' then ib.drug_formulary_id is not null else ib.product_id is not null end
        and (p_item_id is null or coalesce(ib.drug_formulary_id, ib.product_id) = p_item_id)
    ) s on true
    where w.hospital_id = v_hosp
  ),
  transit as (   -- pending, or rejected and awaiting accept_return
    select jsonb_build_object('units', coalesce(sum(tri.quantity_units), 0),
                              'value', coalesce(sum(tri.quantity_units * coalesce(ib.purchase_price, 0)), 0),
                              'items', count(distinct coalesce(ib.drug_formulary_id, ib.product_id))) as in_transit
    from transfer_records tr
    join transfer_record_items tri on tri.transfer_record_id = tr.id
    join inventory_batches ib on ib.id = tri.inventory_batch_id
    where tr.hospital_id = v_hosp and tr.status in ('pending_acceptance', 'rejected')
      and case when p_kind = 'drug' then ib.drug_formulary_id is not null else ib.product_id is not null end
      and (p_item_id is null or coalesce(ib.drug_formulary_id, ib.product_id) = p_item_id)
  )
  select jsonb_build_object(
    'generated_at', now(), 'kind', p_kind, 'item_id', p_item_id, 'item_name', v_name, 'unit_name', v_unit,
    'received', sums.received, 'warehouses', whs.warehouses, 'in_transit', transit.in_transit,
    'patient', sums.patient, 'written_off', sums.written_off, 'write_off_types', wo.write_off_types, 'edges', sums.edges)
  into v_res from sums, wo, whs, transit;
  return v_res;
end $$;

revoke execute on function public.get_item_lifecycle(text, uuid) from public, anon;
grant execute on function public.get_item_lifecycle(text, uuid) to authenticated;

-- movement history of ONE item (newest first), optional period, paged
create or replace function public.get_item_movements(
  p_kind text, p_item_id uuid, p_from timestamptz default null, p_to timestamptz default null,
  p_limit integer default 100, p_offset integer default 0)
returns table (
  performed_at timestamptz, source_type text, warehouse_name text, department_name text,
  quantity numeric, series_number text, performed_by_name text, detail text)
language plpgsql stable security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id();
begin
  if not has_permission('warehouse.view_all') then raise exception 'Нет прав на просмотр товарооборота'; end if;
  if p_kind not in ('drug', 'product') or p_item_id is null then raise exception 'Укажите позицию'; end if;
  return query
  select t.performed_at, t.source_type, w.name, d.name, t.quantity_units, ib.series_number, pr.full_name,
         case when t.source_type = 'writeoff' then (select wot.name_ru from write_off_records r join write_off_types wot on wot.id = r.write_off_type_id where r.id = t.reference_id)
              when t.source_type = 'consumable' then 'Пациенту' end
  from inventory_transactions t
  join warehouses w on w.id = t.warehouse_id
  left join departments d on d.id = w.department_id
  left join inventory_batches ib on ib.id = t.inventory_batch_id
  left join profiles pr on pr.id = t.performed_by
  where t.hospital_id = v_hosp
    and case when p_kind = 'drug' then t.drug_formulary_id = p_item_id else t.product_id = p_item_id end
    and (p_from is null or t.performed_at >= p_from) and (p_to is null or t.performed_at <= p_to)
  order by t.performed_at desc, t.id
  limit least(greatest(p_limit, 1), 500) offset greatest(p_offset, 0);
end $$;

revoke execute on function public.get_item_movements(text, uuid, timestamptz, timestamptz, integer, integer) from public, anon;
grant execute on function public.get_item_movements(text, uuid, timestamptz, timestamptz, integer, integer) to authenticated;
