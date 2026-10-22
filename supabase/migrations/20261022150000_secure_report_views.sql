-- SECURITY FIX: three views ran with owner (postgres) privileges, bypassing RLS,
-- and were SELECT-able by the `anon` role. With only the public anon key (shipped
-- in the frontend bundle) anyone could read every hospital's revenue rows incl.
-- patient names / DOB / patient numbers, all payments, and all stock.
--
-- 1) finance_revenue_report_items, cash_inflow_report_items: every underlying
--    table is hospital-scoped by RLS, so run them as the caller (security_invoker).
-- 2) general_clinic_stock: intentionally owner-privileged (physicians must see
--    clinic stock when prescribing without warehouse permissions), so keep it,
--    but scope rows to the caller's hospital. For anon get_my_hospital_id() is
--    NULL -> no rows.
-- 3) Revoke anon access and write privileges on all public views.

alter view public.finance_revenue_report_items set (security_invoker = true);
alter view public.cash_inflow_report_items     set (security_invoker = true);

create or replace view public.general_clinic_stock as
 select ib.hospital_id,
    ib.warehouse_id,
    w.name as warehouse_name,
    wt.code as warehouse_type,
    ib.product_id,
    null::uuid as drug_formulary_id,
    p.name as item_name,
    pt.code as product_type,
    p.inn,
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
  group by ib.hospital_id, ib.warehouse_id, w.name, wt.code, ib.product_id, p.name, pt.code, p.inn, u.abbreviation
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

comment on view public.general_clinic_stock is
  'Owner-privileged on purpose (stock visible to prescribers); rows scoped to get_my_hospital_id(). Do not remove that filter.';

-- Views are read-only reporting surfaces: no anon access, no writes for anyone.
do $$
declare v record;
begin
  for v in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    execute format('revoke all on public.%I from anon', v.relname);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated', v.relname);
  end loop;
end $$;
