-- Stale (неликвид) tracking: per-item threshold + function listing items without movement

alter table public.products
  add column if not exists stale_after_days integer check (stale_after_days is null or stale_after_days > 0);
alter table public.drug_formulary
  add column if not exists stale_after_days integer check (stale_after_days is null or stale_after_days > 0);
comment on column public.products.stale_after_days is 'Item is stale (неликвид) when it has stock and no outgoing movement for this many days. NULL = not tracked.';
comment on column public.drug_formulary.stale_after_days is 'Item is stale (неликвид) when it has stock and no outgoing movement for this many days. NULL = not tracked.';

-- Movement = stock leaving the warehouse (transfer_out, writeoff, consumable).
-- Arrival (incoming / transfer_in) is the baseline so fresh deliveries are not stale.
create or replace function public.get_warehouse_stale_items(p_warehouse_id uuid)
returns table (
  item_kind text, item_id uuid, item_name text, unit_name text, quantity numeric,
  last_movement_at timestamptz, last_movement_type text, days_idle integer,
  stale_after_days integer, sell_value numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id();
begin
  if not can_access_warehouse(p_warehouse_id) then
    raise exception 'Нет доступа к складу';
  end if;

  return query
  select x.kind, x.item_id, x.item_name, x.unit_name, x.quantity,
         x.activity_at,
         case when x.out_at is not null and x.out_at >= coalesce(x.in_at, x.recv_at) then x.out_type else 'incoming' end,
         (current_date - x.activity_at::date)::integer,
         x.threshold, x.sell_value
  from (
    select s.*, lo.performed_at as out_at, lo.source_type as out_type, li.performed_at as in_at,
           greatest(lo.performed_at, coalesce(li.performed_at, s.recv_at)) as activity_at
    from (
      select case when ib.drug_formulary_id is not null then 'drug' else 'product' end as kind,
             coalesce(ib.drug_formulary_id, ib.product_id) as item_id,
             coalesce(df.trade_name, p.name, '—') as item_name,
             uom.name_ru as unit_name,
             coalesce(df.stale_after_days, p.stale_after_days) as threshold,
             sum(ib.quantity_units) as quantity,
             sum(ib.quantity_units * coalesce(ib.selling_price, 0)) as sell_value,
             max(ib.received_at) as recv_at
      from inventory_batches ib
      left join drug_formulary df on df.id = ib.drug_formulary_id
      left join products p on p.id = ib.product_id
      left join units_of_measurement uom on uom.id = coalesce(df.unit_id, p.unit_id)
      where ib.hospital_id = v_hosp and ib.warehouse_id = p_warehouse_id and ib.quantity_units > 0
      group by 1, 2, 3, 4, 5
    ) s
    left join lateral (
      select t.performed_at, t.source_type from inventory_transactions t
      where t.hospital_id = v_hosp and t.warehouse_id = p_warehouse_id
        and case when s.kind = 'drug' then t.drug_formulary_id = s.item_id else t.product_id = s.item_id end
        and t.source_type in ('transfer_out', 'writeoff', 'consumable')
      order by t.performed_at desc limit 1
    ) lo on true
    left join lateral (
      select t.performed_at from inventory_transactions t
      where t.hospital_id = v_hosp and t.warehouse_id = p_warehouse_id
        and case when s.kind = 'drug' then t.drug_formulary_id = s.item_id else t.product_id = s.item_id end
        and t.source_type in ('incoming', 'transfer_in')
      order by t.performed_at desc limit 1
    ) li on true
    where s.threshold is not null
  ) x
  where x.activity_at is not null and (current_date - x.activity_at::date) > x.threshold
  order by (current_date - x.activity_at::date) desc, x.item_name;
end $$;

revoke execute on function public.get_warehouse_stale_items(uuid) from public, anon;
grant execute on function public.get_warehouse_stale_items(uuid) to authenticated;
