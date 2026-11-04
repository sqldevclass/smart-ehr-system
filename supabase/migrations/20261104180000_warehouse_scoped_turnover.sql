-- Товарооборот for ONE warehouse (nurse: own department warehouse; reports: any department warehouse, read-only).
-- get_item_lifecycle / get_item_movements get an optional p_warehouse_id (NULL = hospital-wide, exactly as before).
-- Report viewers (reports.view_warehouse_stock) may read stock rows, so the read-only department view is not empty for them.

-- 1) who may read ONE warehouse's ledger
create or replace function public._can_read_warehouse_ledger(p_wh uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from warehouses w
    where w.id = p_wh and w.hospital_id = get_my_hospital_id()
      and (has_permission('warehouse.view_all') or has_permission('reports.view_warehouse_stock') or can_access_warehouse(p_wh))
  )
$$;
revoke execute on function public._can_read_warehouse_ledger(uuid) from public, anon, authenticated;

-- 2) stock rows readable by report viewers too (they already see stock values in the Склады report)
alter policy inventory_batches_select on public.inventory_batches using (
  hospital_id = get_my_hospital_id() and (
    has_permission('warehouse.view_all')
    or has_permission('reports.view_warehouse_stock')
    or (has_permission('warehouse.department_view') and exists (
          select 1 from warehouses w join profiles pr on pr.department_id = w.department_id
          where w.id = inventory_batches.warehouse_id and w.department_id is not null and pr.id = auth.uid()))
  )
);

-- 3) lifecycle: optional single-warehouse scope
drop function public.get_item_lifecycle(text, uuid);

create or replace function public.get_item_lifecycle(p_kind text, p_item_id uuid default null, p_warehouse_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_hosp uuid := get_my_hospital_id();
  v_unit text; v_name text; v_res jsonb;
begin
  if p_warehouse_id is not null then
    if not _can_read_warehouse_ledger(p_warehouse_id) then raise exception 'Нет доступа к товарообороту склада'; end if;
  elsif not has_permission('warehouse.view_all') then
    raise exception 'Нет прав на просмотр товарооборота';
  end if;
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

  if p_warehouse_id is not null then
    -- one warehouse: received (incoming + transfers in) = stock + patients + written off + sent out (net of returns)
    with l as (
      select t.source_type, t.quantity_units as qty, coalesce(t.drug_formulary_id, t.product_id) as item_id,
             t.quantity_units * coalesce(ib.purchase_price, 0) as val, t.reference_id
      from inventory_transactions t
      join inventory_batches ib on ib.id = t.inventory_batch_id
      where t.hospital_id = v_hosp and t.warehouse_id = p_warehouse_id
        and case when p_kind = 'drug' then t.drug_formulary_id is not null else t.product_id is not null end
        and (p_item_id is null or coalesce(t.drug_formulary_id, t.product_id) = p_item_id)
    ),
    sums as (
      select
        jsonb_build_object('units', coalesce(sum(qty) filter (where source_type in ('incoming', 'transfer_in')), 0),
                           'value', coalesce(sum(val) filter (where source_type in ('incoming', 'transfer_in')), 0),
                           'items', count(distinct item_id) filter (where source_type in ('incoming', 'transfer_in'))) as received,
        jsonb_build_object('units', coalesce(-sum(qty) filter (where source_type = 'consumable'), 0),
                           'value', coalesce(-sum(val) filter (where source_type = 'consumable'), 0),
                           'items', count(distinct item_id) filter (where source_type = 'consumable')) as patient,
        jsonb_build_object('units', coalesce(-sum(qty) filter (where source_type = 'writeoff'), 0),
                           'value', coalesce(-sum(val) filter (where source_type = 'writeoff'), 0),
                           'items', count(distinct item_id) filter (where source_type = 'writeoff')) as written_off,
        jsonb_build_object('units', coalesce(-sum(qty) filter (where source_type in ('transfer_out', 'transfer_return')), 0),
                           'value', coalesce(-sum(val) filter (where source_type in ('transfer_out', 'transfer_return')), 0),
                           'items', count(distinct item_id) filter (where source_type = 'transfer_out')) as sent_out
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
    whs as (
      select coalesce(jsonb_agg(jsonb_build_object(
               'warehouse_id', w.id, 'name', w.name, 'type_code', wt.code, 'department_name', d.name, 'is_active', w.is_active,
               'units', coalesce(s.units, 0), 'value', coalesce(s.value, 0), 'items', coalesce(s.items, 0))), '[]'::jsonb) as warehouses
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
      where w.id = p_warehouse_id and w.hospital_id = v_hosp
    ),
    transit_out as (   -- sent from this warehouse, not yet accepted (or rejected and awaiting return)
      select jsonb_build_object('units', coalesce(sum(tri.quantity_units), 0),
                                'value', coalesce(sum(tri.quantity_units * coalesce(ib.purchase_price, 0)), 0),
                                'items', count(distinct coalesce(ib.drug_formulary_id, ib.product_id))) as b
      from transfer_records tr
      join transfer_record_items tri on tri.transfer_record_id = tr.id
      join inventory_batches ib on ib.id = tri.inventory_batch_id
      where tr.hospital_id = v_hosp and tr.from_warehouse_id = p_warehouse_id and tr.status in ('pending_acceptance', 'rejected')
        and case when p_kind = 'drug' then ib.drug_formulary_id is not null else ib.product_id is not null end
        and (p_item_id is null or coalesce(ib.drug_formulary_id, ib.product_id) = p_item_id)
    ),
    transit_in as (    -- on its way TO this warehouse, waiting for acceptance
      select jsonb_build_object('units', coalesce(sum(tri.quantity_units), 0),
                                'value', coalesce(sum(tri.quantity_units * coalesce(ib.purchase_price, 0)), 0),
                                'items', count(distinct coalesce(ib.drug_formulary_id, ib.product_id))) as b
      from transfer_records tr
      join transfer_record_items tri on tri.transfer_record_id = tr.id
      join inventory_batches ib on ib.id = tri.inventory_batch_id
      where tr.hospital_id = v_hosp and tr.to_warehouse_id = p_warehouse_id and tr.status = 'pending_acceptance'
        and case when p_kind = 'drug' then ib.drug_formulary_id is not null else ib.product_id is not null end
        and (p_item_id is null or coalesce(ib.drug_formulary_id, ib.product_id) = p_item_id)
    )
    select jsonb_build_object(
      'generated_at', now(), 'kind', p_kind, 'item_id', p_item_id, 'item_name', v_name, 'unit_name', v_unit,
      'scope', 'warehouse', 'warehouse_id', p_warehouse_id,
      'received', sums.received, 'warehouses', whs.warehouses, 'in_transit', transit_out.b, 'pending_in', transit_in.b,
      'patient', sums.patient, 'written_off', sums.written_off, 'sent_out', sums.sent_out, 'write_off_types', wo.write_off_types,
      'edges', jsonb_build_object('to_departments', jsonb_build_object('units', 0, 'value', 0),
                                  'returns_to_stock', jsonb_build_object('units', 0, 'value', 0)))
    into v_res from sums, wo, whs, transit_out, transit_in;
    return v_res;
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

revoke execute on function public.get_item_lifecycle(text, uuid, uuid) from public, anon;
grant execute on function public.get_item_lifecycle(text, uuid, uuid) to authenticated;

-- 4) movement history: optional single-warehouse scope
drop function public.get_item_movements(text, uuid, timestamptz, timestamptz, integer, integer);

create or replace function public.get_item_movements(
  p_kind text, p_item_id uuid, p_from timestamptz default null, p_to timestamptz default null,
  p_limit integer default 100, p_offset integer default 0, p_warehouse_id uuid default null)
returns table (
  performed_at timestamptz, source_type text, warehouse_name text, department_name text,
  quantity numeric, series_number text, performed_by_name text, detail text)
language plpgsql stable security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id();
begin
  if p_warehouse_id is not null then
    if not _can_read_warehouse_ledger(p_warehouse_id) then raise exception 'Нет доступа к товарообороту склада'; end if;
  elsif not has_permission('warehouse.view_all') then
    raise exception 'Нет прав на просмотр товарооборота';
  end if;
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
    and (p_warehouse_id is null or t.warehouse_id = p_warehouse_id)
    and case when p_kind = 'drug' then t.drug_formulary_id = p_item_id else t.product_id = p_item_id end
    and (p_from is null or t.performed_at >= p_from) and (p_to is null or t.performed_at <= p_to)
  order by t.performed_at desc, t.id
  limit least(greatest(p_limit, 1), 500) offset greatest(p_offset, 0);
end $$;

revoke execute on function public.get_item_movements(text, uuid, timestamptz, timestamptz, integer, integer, uuid) from public, anon;
grant execute on function public.get_item_movements(text, uuid, timestamptz, timestamptz, integer, integer, uuid) to authenticated;

-- 5) item picker for one warehouse: only items that have moved through it
create or replace function public.list_warehouse_turnover_items(p_warehouse_id uuid, p_kind text)
returns table (item_id uuid, name text)
language plpgsql stable security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id();
begin
  if not _can_read_warehouse_ledger(p_warehouse_id) then raise exception 'Нет доступа к товарообороту склада'; end if;
  if p_kind not in ('drug', 'product') then raise exception 'Укажите тип: препарат или товар'; end if;
  return query
  select x.id, x.name from (
    select df.id, df.trade_name as name from drug_formulary df
     where p_kind = 'drug' and df.hospital_id = v_hosp
       and exists (select 1 from inventory_transactions t where t.warehouse_id = p_warehouse_id and t.drug_formulary_id = df.id)
    union all
    select p.id, p.name from products p
     where p_kind = 'product' and p.hospital_id = v_hosp
       and exists (select 1 from inventory_transactions t where t.warehouse_id = p_warehouse_id and t.product_id = p.id)
  ) x order by x.name;
end $$;

revoke execute on function public.list_warehouse_turnover_items(uuid, text) from public, anon;
grant execute on function public.list_warehouse_turnover_items(uuid, text) to authenticated;
