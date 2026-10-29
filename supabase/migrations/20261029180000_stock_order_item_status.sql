-- Stock orders: status moves from the order to each line, so staff can release / reject items individually.
-- The order becomes a plain container (nurse, destination, source, date).

alter table public.stock_order_items
  add column status text not null default 'pending' check (status in ('pending', 'released', 'rejected', 'cancelled')),
  add column transfer_id uuid references public.transfer_records(id),
  add column released_by uuid references public.profiles(id), add column released_at timestamptz,
  add column rejected_by uuid references public.profiles(id), add column rejected_at timestamptz, add column reject_reason text,
  add column cancelled_by uuid references public.profiles(id), add column cancelled_at timestamptz;

-- carry existing order state down to its lines
update public.stock_order_items i set
  status = o.status, transfer_id = o.transfer_id,
  released_by = o.released_by, released_at = o.released_at,
  rejected_by = o.rejected_by, rejected_at = o.rejected_at, reject_reason = o.reject_reason,
  cancelled_by = o.cancelled_by, cancelled_at = o.cancelled_at
from public.stock_orders o where o.id = i.order_id;

alter table public.stock_order_items
  add constraint stock_order_items_rejected_reason_chk check (status <> 'rejected' or nullif(btrim(reject_reason), '') is not null),
  add constraint stock_order_items_released_transfer_chk check (status <> 'released' or transfer_id is not null);

-- the old whole-order RPCs go first (they reference the columns dropped below)
drop function public.cancel_stock_order(uuid);
drop function public.reject_stock_order(uuid, text);
drop function public.release_stock_order(uuid);

alter table public.stock_orders
  drop column status, drop column transfer_id,
  drop column released_by, drop column released_at,
  drop column rejected_by, drop column rejected_at, drop column reject_reason,
  drop column cancelled_by, drop column cancelled_at;

create index if not exists stock_orders_from_idx on public.stock_orders (hospital_id, from_warehouse_id, ordered_at desc);
create index stock_order_items_pending_idx on public.stock_order_items (order_id) where status = 'pending';
create index stock_order_items_transfer_idx on public.stock_order_items (transfer_id) where transfer_id is not null;

-- nurse side: cancel one pending line
create or replace function public.cancel_stock_order_item(p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare it stock_order_items; o stock_orders;
begin
  if not has_permission('warehouse.department_order') then raise exception 'Нет прав'; end if;
  select * into it from stock_order_items where id = p_item_id and hospital_id = get_my_hospital_id() for update;
  if not found then raise exception 'Позиция заказа не найдена'; end if;
  select * into o from stock_orders where id = it.order_id;
  if not can_access_warehouse(o.to_warehouse_id) then raise exception 'Нет доступа к заказу'; end if;
  if it.status <> 'pending' then raise exception 'Отменить можно только новую позицию'; end if;
  update stock_order_items set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now() where id = it.id;
end $$;

-- staff side: reject one line
create or replace function public.reject_stock_order_item(p_item_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare it stock_order_items; o stock_orders;
begin
  if not has_permission('warehouse.transfer_send') then raise exception 'Нет прав на выдачу заказов'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'Укажите причину отклонения'; end if;
  select * into it from stock_order_items where id = p_item_id and hospital_id = get_my_hospital_id() for update;
  if not found then raise exception 'Позиция заказа не найдена'; end if;
  select * into o from stock_orders where id = it.order_id;
  if not can_access_warehouse(o.from_warehouse_id) then raise exception 'Нет доступа к складу'; end if;
  if it.status <> 'pending' then raise exception 'Позиция уже обработана'; end if;
  update stock_order_items set status = 'rejected', rejected_by = auth.uid(), rejected_at = now(), reject_reason = btrim(p_reason) where id = it.id;
end $$;

-- staff side: release one line as its own transfer (FIFO by expiry, expired batches excluded)
create or replace function public.release_stock_order_item(p_item_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_hosp uuid := get_my_hospital_id(); it stock_order_items; o stock_orders; b record;
  v_need numeric; v_take numeric; v_items jsonb := '[]'::jsonb; v_tid uuid; v_name text;
begin
  if not has_permission('warehouse.transfer_send') then raise exception 'Нет прав на выдачу заказов'; end if;
  select * into it from stock_order_items where id = p_item_id and hospital_id = v_hosp for update;
  if not found then raise exception 'Позиция заказа не найдена'; end if;
  select * into o from stock_orders where id = it.order_id;
  if not can_access_warehouse(o.from_warehouse_id) then raise exception 'Нет доступа к складу'; end if;
  if it.status <> 'pending' then raise exception 'Позиция уже обработана'; end if;

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
    raise exception 'Недостаточно остатка для выдачи: % (не хватает %). Отклоните позицию.', v_name, v_need;
  end if;

  v_tid := send_transfer(o.from_warehouse_id, o.to_warehouse_id, 'Заказ отделения', v_items);
  update stock_order_items set status = 'released', transfer_id = v_tid, released_by = auth.uid(), released_at = now() where id = it.id;
  return v_tid;
end $$;

revoke execute on function public.cancel_stock_order_item(uuid), public.reject_stock_order_item(uuid, text), public.release_stock_order_item(uuid) from public, anon;
grant execute on function public.cancel_stock_order_item(uuid), public.reject_stock_order_item(uuid, text), public.release_stock_order_item(uuid) to authenticated;
