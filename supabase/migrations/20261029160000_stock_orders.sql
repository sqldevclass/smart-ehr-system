-- Department stock orders (nurse cart -> pharmacy / general warehouse -> existing transfer flow)

-- nurses may order, not only head_nurse
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from roles r, permissions p
where r.code = 'inpatient_nurse' and p.code = 'warehouse.department_order'
on conflict do nothing;

create table public.stock_orders (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id),
  from_warehouse_id uuid not null references public.warehouses(id),
  to_warehouse_id uuid not null references public.warehouses(id),
  status text not null default 'pending' check (status in ('pending', 'released', 'rejected', 'cancelled')),
  notes text,
  ordered_by uuid not null references public.profiles(id),
  ordered_at timestamptz not null default now(),
  transfer_id uuid references public.transfer_records(id),
  released_by uuid references public.profiles(id), released_at timestamptz,
  rejected_by uuid references public.profiles(id), rejected_at timestamptz, reject_reason text,
  cancelled_by uuid references public.profiles(id), cancelled_at timestamptz,
  check (from_warehouse_id <> to_warehouse_id),
  check (status <> 'rejected' or nullif(btrim(reject_reason), '') is not null),
  check (status <> 'released' or transfer_id is not null)
);
create index stock_orders_from_idx on public.stock_orders (hospital_id, from_warehouse_id, status, ordered_at desc);
create index stock_orders_to_idx on public.stock_orders (hospital_id, to_warehouse_id, ordered_at desc);

create table public.stock_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.stock_orders(id) on delete cascade,
  hospital_id uuid not null references public.hospitals(id),
  product_id uuid references public.products(id),
  drug_formulary_id uuid references public.drug_formulary(id),
  quantity_units numeric(14,3) not null check (quantity_units > 0),
  check ((product_id is null) <> (drug_formulary_id is null))
);
create index stock_order_items_order_idx on public.stock_order_items (order_id);

alter table public.stock_orders enable row level security;
alter table public.stock_order_items enable row level security;

create policy stock_orders_select on public.stock_orders for select to authenticated
  using (hospital_id = get_my_hospital_id()
         and (can_access_warehouse(from_warehouse_id) or can_access_warehouse(to_warehouse_id)));
create policy stock_order_items_select on public.stock_order_items for select to authenticated
  using (hospital_id = get_my_hospital_id()
         and exists (select 1 from stock_orders o where o.id = order_id
                     and (can_access_warehouse(o.from_warehouse_id) or can_access_warehouse(o.to_warehouse_id))));

revoke all on public.stock_orders, public.stock_order_items from anon;
revoke insert, update, delete, truncate, references, trigger on public.stock_orders, public.stock_order_items from authenticated;

-- ---------------------------------------------------------------
-- Items the nurse can order from a central warehouse (free stock only, expired batches excluded)
-- ---------------------------------------------------------------
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
         coalesce(df.trade_name, p.name), coalesce(df.inn, p.inn), df.dose, uom.name_ru,
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

-- internal: free (non-expired) quantity of one item in a warehouse
create or replace function public._order_available(p_wh uuid, p_kind text, p_item uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(quantity_units), 0) from inventory_batches
  where warehouse_id = p_wh and quantity_units > 0 and (expiry_date is null or expiry_date >= current_date)
    and case when p_kind = 'drug' then drug_formulary_id = p_item else product_id = p_item end
$$;

-- p_items: [{item_kind:'drug'|'product', item_id, quantity_units}]
create or replace function public.create_stock_order(p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_items jsonb, p_notes text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid();
  v_to uuid := p_to_warehouse_id; v_id uuid; r record; v_short text := ''; v_name text; v_avail numeric; v_lines jsonb;
begin
  if not has_permission('warehouse.department_order') then raise exception 'Нет прав на заказ со склада'; end if;
  if not exists (select 1 from warehouses w join warehouse_types wt on wt.id = w.warehouse_type_id
                 where w.id = p_from_warehouse_id and w.hospital_id = v_hosp and w.is_active and wt.code in ('central_pharmacy', 'general')) then
    raise exception 'Заказывать можно только с центральной аптеки или общего склада'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Корзина пуста'; end if;

  if not exists (select 1 from warehouses w join warehouse_types wt on wt.id = w.warehouse_type_id
                 where w.id = v_to and w.hospital_id = v_hosp and w.is_active and wt.code = 'department') then
    raise exception 'Склад отделения не найден или неактивен'; end if;
  if not can_access_warehouse(v_to) then raise exception 'Нет доступа к складу этого отделения'; end if;

  select jsonb_agg(jsonb_build_object('kind', k, 'item', i, 'qty', q)) into v_lines from (
    select e->>'item_kind' as k, (e->>'item_id')::uuid as i, sum((e->>'quantity_units')::numeric) as q
    from jsonb_array_elements(p_items) e group by 1, 2) g;

  if exists (select 1 from jsonb_to_recordset(v_lines) as x(kind text, item uuid, qty numeric)
             where kind not in ('drug', 'product') or qty is null or qty <= 0) then
    raise exception 'Некорректная позиция или количество'; end if;

  for r in select * from jsonb_to_recordset(v_lines) as x(kind text, item uuid, qty numeric) loop
    v_avail := _order_available(p_from_warehouse_id, r.kind, r.item);
    if v_avail < r.qty then
      select case when r.kind = 'drug' then (select trade_name from drug_formulary where id = r.item and hospital_id = v_hosp)
                  else (select name from products where id = r.item and hospital_id = v_hosp) end into v_name;
      v_short := v_short || format('%s (доступно %s, запрошено %s); ', coalesce(v_name, 'позиция'), v_avail, r.qty);
    end if;
  end loop;
  if v_short <> '' then raise exception 'Недостаточно на складе: %', v_short; end if;

  insert into stock_orders (hospital_id, from_warehouse_id, to_warehouse_id, notes, ordered_by)
  values (v_hosp, p_from_warehouse_id, v_to, nullif(btrim(p_notes), ''), v_uid) returning id into v_id;
  insert into stock_order_items (order_id, hospital_id, product_id, drug_formulary_id, quantity_units)
  select v_id, v_hosp, case when kind = 'product' then item end, case when kind = 'drug' then item end, qty
  from jsonb_to_recordset(v_lines) as x(kind text, item uuid, qty numeric);
  return v_id;
end $$;

create or replace function public.cancel_stock_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o stock_orders;
begin
  if not has_permission('warehouse.department_order') then raise exception 'Нет прав'; end if;
  select * into o from stock_orders where id = p_order_id and hospital_id = get_my_hospital_id() for update;
  if not found then raise exception 'Заказ не найден'; end if;
  if not can_access_warehouse(o.to_warehouse_id) then raise exception 'Нет доступа к заказу'; end if;
  if o.status <> 'pending' then raise exception 'Отменить можно только новый заказ'; end if;
  update stock_orders set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now() where id = o.id;
end $$;

create or replace function public.reject_stock_order(p_order_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare o stock_orders;
begin
  if not has_permission('warehouse.transfer_send') then raise exception 'Нет прав на выдачу заказов'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'Укажите причину отклонения'; end if;
  select * into o from stock_orders where id = p_order_id and hospital_id = get_my_hospital_id() for update;
  if not found then raise exception 'Заказ не найден'; end if;
  if not can_access_warehouse(o.from_warehouse_id) then raise exception 'Нет доступа к складу'; end if;
  if o.status <> 'pending' then raise exception 'Заказ уже обработан'; end if;
  update stock_orders set status = 'rejected', rejected_by = auth.uid(), rejected_at = now(), reject_reason = btrim(p_reason) where id = o.id;
end $$;

-- Releases the whole order as ONE transfer (existing flow: В пути -> nurse accepts)
create or replace function public.release_stock_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_hosp uuid := get_my_hospital_id(); o stock_orders; it record; b record;
  v_need numeric; v_take numeric; v_items jsonb := '[]'::jsonb; v_tid uuid; v_name text;
begin
  if not has_permission('warehouse.transfer_send') then raise exception 'Нет прав на выдачу заказов'; end if;
  select * into o from stock_orders where id = p_order_id and hospital_id = v_hosp for update;
  if not found then raise exception 'Заказ не найден'; end if;
  if not can_access_warehouse(o.from_warehouse_id) then raise exception 'Нет доступа к складу'; end if;
  if o.status <> 'pending' then raise exception 'Заказ уже обработан'; end if;

  for it in select * from stock_order_items where order_id = o.id loop
    v_need := it.quantity_units;
    for b in
      select id, quantity_units from inventory_batches
      where warehouse_id = o.from_warehouse_id and hospital_id = v_hosp and quantity_units > 0
        and (expiry_date is null or expiry_date >= current_date)
        and coalesce(drug_formulary_id, product_id) = coalesce(it.drug_formulary_id, it.product_id)
      order by expiry_date nulls last, received_at, id
      for update
    loop
      exit when v_need <= 0;
      v_take := least(b.quantity_units, v_need);
      v_items := v_items || jsonb_build_object('batch_id', b.id, 'quantity_units', v_take);
      v_need := v_need - v_take;
    end loop;
    if v_need > 0 then
      select coalesce((select trade_name from drug_formulary where id = it.drug_formulary_id), (select name from products where id = it.product_id)) into v_name;
      raise exception 'Недостаточно остатка для выдачи: % (не хватает %). Отклоните заказ.', v_name, v_need;
    end if;
  end loop;

  v_tid := send_transfer(o.from_warehouse_id, o.to_warehouse_id, 'Заказ отделения', v_items);
  update stock_orders set status = 'released', transfer_id = v_tid, released_by = auth.uid(), released_at = now() where id = o.id;
  return v_tid;
end $$;

revoke execute on function public.list_orderable_items(uuid), public._order_available(uuid, text, uuid),
  public.create_stock_order(uuid, uuid, jsonb, text), public.cancel_stock_order(uuid),
  public.reject_stock_order(uuid, text), public.release_stock_order(uuid) from public, anon;
grant execute on function public.list_orderable_items(uuid), public.create_stock_order(uuid, uuid, jsonb, text),
  public.cancel_stock_order(uuid), public.reject_stock_order(uuid, text), public.release_stock_order(uuid) to authenticated;
