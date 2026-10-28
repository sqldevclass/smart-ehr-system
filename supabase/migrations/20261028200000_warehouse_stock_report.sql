-- Warehouse stock report for Дневной отчёт -> Склады

insert into public.permissions (code, name_ru, name_en, module, access_type)
values ('reports.view_warehouse_stock', 'Просмотр отчёта по складам', 'View warehouse stock report', 'reports', 'read')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.code in ('admin', 'senior_manager', 'finance') and p.code = 'reports.view_warehouse_stock'
on conflict do nothing;

create or replace function public.get_warehouse_stock_report()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id(); v_items jsonb; v_wh jsonb;
begin
  if not has_permission('reports.view_warehouse_stock') then
    raise exception 'Нет прав на просмотр отчёта по складам';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.item_name), '[]'::jsonb) into v_items
  from (
    select s.warehouse_id, s.kind as item_kind, s.item_id, s.item_name, s.unit_name, s.min_quantity,
           s.quantity, s.batches, s.nearest_expiry, s.cost_value, s.sell_value,
           coalesce(s.expired_qty, 0) as expired_qty, coalesce(s.expired_cost, 0) as expired_cost,
           coalesce(s.expiring_qty, 0) as expiring_qty, coalesce(s.expiring_cost, 0) as expiring_cost,
           (s.min_quantity is not null and (s.quantity - coalesce(s.expired_qty, 0)) <= s.min_quantity) as is_low
    from (
      select ib.warehouse_id,
             case when ib.drug_formulary_id is not null then 'drug' else 'product' end as kind,
             coalesce(ib.drug_formulary_id, ib.product_id) as item_id,
             coalesce(df.trade_name, p.name, '—') as item_name,
             uom.name_ru as unit_name,
             coalesce(df.min_quantity, p.min_stock_quantity) as min_quantity,
             coalesce(df.expiry_notify_days, p.expiry_notify_days, 30) as notify_days,
             sum(ib.quantity_units) as quantity,
             count(*) as batches,
             min(ib.expiry_date) as nearest_expiry,
             sum(ib.quantity_units * coalesce(ib.purchase_price, 0)) as cost_value,
             sum(ib.quantity_units * coalesce(ib.selling_price, 0)) as sell_value,
             sum(ib.quantity_units) filter (where ib.expiry_date < current_date) as expired_qty,
             sum(ib.quantity_units * coalesce(ib.purchase_price, 0)) filter (where ib.expiry_date < current_date) as expired_cost,
             sum(ib.quantity_units) filter (where ib.expiry_date >= current_date
               and ib.expiry_date <= current_date + coalesce(df.expiry_notify_days, p.expiry_notify_days, 30)) as expiring_qty,
             sum(ib.quantity_units * coalesce(ib.purchase_price, 0)) filter (where ib.expiry_date >= current_date
               and ib.expiry_date <= current_date + coalesce(df.expiry_notify_days, p.expiry_notify_days, 30)) as expiring_cost
      from inventory_batches ib
      left join drug_formulary df on df.id = ib.drug_formulary_id
      left join products p on p.id = ib.product_id
      left join units_of_measurement uom on uom.id = coalesce(df.unit_id, p.unit_id)
      where ib.hospital_id = v_hosp and ib.quantity_units > 0
      group by ib.warehouse_id, 2, 3, 4, 5, 6, 7
    ) s
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
           'warehouse_id', w.id, 'warehouse_name', w.name, 'type_code', wt.code, 'type_name', wt.name_ru,
           'department_name', d.name, 'is_active', w.is_active,
           'in_transit_cost', coalesce(t.cost, 0), 'in_transit_positions', coalesce(t.positions, 0)
         ) order by wt.sort_order, w.name), '[]'::jsonb) into v_wh
  from warehouses w
  join warehouse_types wt on wt.id = w.warehouse_type_id
  left join departments d on d.id = w.department_id
  left join lateral (
    select sum(tri.quantity_units * coalesce(ib.purchase_price, 0)) as cost, count(*) as positions
    from transfer_records tr
    join transfer_record_items tri on tri.transfer_record_id = tr.id
    join inventory_batches ib on ib.id = tri.inventory_batch_id
    where tr.from_warehouse_id = w.id and tr.status in ('pending_acceptance', 'rejected')
  ) t on true
  where w.hospital_id = v_hosp;

  return jsonb_build_object('generated_at', now(), 'warehouses', v_wh, 'items', v_items);
end $$;

revoke execute on function public.get_warehouse_stock_report() from public, anon;
grant execute on function public.get_warehouse_stock_report() to authenticated;
