-- Two-step return: receiver rejects (stock stays in transit), sender confirms the return (stock goes back).

alter table public.transfer_records drop constraint transfer_records_status_check;
alter table public.transfer_records add constraint transfer_records_status_check
  check (status = any (array['pending_acceptance','accepted','cancelled','rejected','returned']));
alter table public.transfer_records
  add column if not exists returned_by uuid references public.profiles(id),
  add column if not exists returned_at timestamptz;

-- rejections made before this change already returned the stock immediately
update public.transfer_records set status = 'returned', returned_at = coalesce(rejected_at, now()), returned_by = rejected_by
where status = 'rejected';

-- pharmacy staff must be able to accept transfers sent to their warehouse
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from roles r, permissions p
where r.code in ('pharmacist', 'warehouse_staff') and p.code = 'warehouse.transfer_accept'
on conflict do nothing;

-- reject: no stock movement, goods are on their way back
create or replace function public.reject_transfer(p_transfer_record_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid(); t record;
begin
  if not has_permission('warehouse.transfer_accept') then raise exception 'Нет прав на отклонение перемещений'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'Укажите причину отклонения'; end if;
  select * into t from transfer_records where id = p_transfer_record_id and hospital_id = v_hosp for update;
  if not found then raise exception 'Перемещение не найдено'; end if;
  if not can_access_warehouse(t.to_warehouse_id) then raise exception 'Нет доступа к складу-получателю'; end if;
  if t.status <> 'pending_acceptance' then raise exception 'Перемещение уже обработано (статус: %)', t.status; end if;
  update transfer_records set status = 'rejected', rejected_by = v_uid, rejected_at = now(), reject_reason = btrim(p_reason) where id = t.id;
end $$;

-- sender confirms the goods are back: stock returns to the original batches
create or replace function public.accept_return(p_transfer_record_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_hosp uuid := get_my_hospital_id(); v_uid uuid := auth.uid(); t record;
begin
  if not (has_permission('warehouse.transfer_send') or has_permission('warehouse.transfer_accept')) then
    raise exception 'Нет прав на приём возврата'; end if;
  select * into t from transfer_records where id = p_transfer_record_id and hospital_id = v_hosp for update;
  if not found then raise exception 'Перемещение не найдено'; end if;
  if not can_access_warehouse(t.from_warehouse_id) then raise exception 'Нет доступа к складу-отправителю'; end if;
  if t.status <> 'rejected' then raise exception 'Возврат недоступен (статус: %)', t.status; end if;
  perform _transfer_return_stock(t.id, v_uid);
  update transfer_records set status = 'returned', returned_by = v_uid, returned_at = now() where id = t.id;
end $$;

revoke execute on function public.accept_return(uuid) from public, anon;
grant execute on function public.accept_return(uuid) to authenticated;
