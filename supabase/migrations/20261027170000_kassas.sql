-- Касса (cash desk): one Касса = one paired computer = one POS terminal.
--
--   kassas          name, POS terminal (unique FK), active flag. Admin-managed.
--   kassa_devices   pairing state, kept apart from kassas so secrets are never readable or audited:
--                   hash of the device secret, hash of the one-time pairing code, last seen time/IP.
--   Pairing         admin issues a one-time code (15 min) -> the cashier enters it on the computer
--                   -> the server returns a random device secret kept in that browser. Only its
--                   SHA-256 hash is stored. Re-pairing replaces the old computer; unpair clears it.
--                   (A computer cannot be identified by IP: behind the clinic router every
--                   computer shares one public IP. The last seen IP is stored for audit only.)
--   payments / patient_deposit_ledger  + kassa_id. Every new payment and deposit refund must carry
--                   one; card payments must carry the Касса's own POS terminal.
--   process_payment, record_patient_deposit, pay_hospitalization_invoice, refund_patient_deposit
--                   now take p_device_token (instead of a terminal): the Касса is resolved from it
--                   server-side and the POS terminal comes from the Касса. A computer that is not
--                   paired cannot take any payment (cash included).
--   pos_terminals.location removed.
--   cash_flow_report_items  + kassa_id, kassa_name.

-- ------------------------------------------------------------ pos_terminals: drop location
alter table public.pos_terminals drop column location;

-- ------------------------------------------------------------ permission
insert into public.permissions (code, name_ru, name_en, module)
select 'payments.manage_kassas', 'Управление кассами', 'Manage cash desks', 'payments'
where not exists (select 1 from public.permissions where code = 'payments.manage_kassas');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'payments.manage_kassas'
where r.code = 'admin'
  and not exists (
    select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id
  );

-- ------------------------------------------------------------ kassas
create table public.kassas (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null references public.hospitals(id) on delete cascade,
  name            text not null check (btrim(name) <> ''),
  pos_terminal_id uuid references public.pos_terminals(id),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create unique index kassas_hospital_name_uq on public.kassas (hospital_id, lower(btrim(name)));
create unique index kassas_pos_terminal_uq on public.kassas (pos_terminal_id) where pos_terminal_id is not null;

create function public.kassas_validate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pos_terminal_id is not null
     and not exists (select 1 from public.pos_terminals t where t.id = new.pos_terminal_id and t.hospital_id = new.hospital_id) then
    raise exception 'POS terminal not found';
  end if;
  return new;
end;
$$;

revoke execute on function public.kassas_validate() from public, anon, authenticated;

create trigger kassas_validate_trg
  before insert or update on public.kassas
  for each row execute function public.kassas_validate();

alter table public.kassas enable row level security;

create policy kassas_select on public.kassas
  for select to authenticated using (hospital_id = public.get_my_hospital_id());
create policy kassas_insert on public.kassas
  for insert to authenticated
  with check (hospital_id = public.get_my_hospital_id() and public.has_permission('payments.manage_kassas'));
create policy kassas_update on public.kassas
  for update to authenticated
  using (hospital_id = public.get_my_hospital_id() and public.has_permission('payments.manage_kassas'))
  with check (hospital_id = public.get_my_hospital_id() and public.has_permission('payments.manage_kassas'));

revoke all on public.kassas from public, anon;
revoke all on public.kassas from authenticated;
grant select, insert on public.kassas to authenticated;
grant update (name, pos_terminal_id, is_active) on public.kassas to authenticated;

create trigger kassas_audit
  after insert or update or delete on public.kassas
  for each row execute function public.audit_trigger_func();

-- ------------------------------------------------------------ kassa_devices (secrets stay server-side)
create table public.kassa_devices (
  kassa_id           uuid primary key references public.kassas(id) on delete cascade,
  hospital_id        uuid not null references public.hospitals(id) on delete cascade,
  token_hash         text,
  paired_at          timestamptz,
  pairing_code_hash  text,
  pairing_expires_at timestamptz,
  last_seen_at       timestamptz,
  last_seen_ip       text
);

create unique index kassa_devices_token_uq on public.kassa_devices (token_hash) where token_hash is not null;

alter table public.kassa_devices enable row level security;
create policy kassa_devices_select on public.kassa_devices
  for select to authenticated using (hospital_id = public.get_my_hospital_id());

revoke all on public.kassa_devices from public, anon;
revoke all on public.kassa_devices from authenticated;
-- clients may read status only, never the hashes
grant select (kassa_id, hospital_id, paired_at, last_seen_at, last_seen_ip) on public.kassa_devices to authenticated;

-- ------------------------------------------------------------ columns on money tables
alter table public.payments add column kassa_id uuid references public.kassas(id);
alter table public.patient_deposit_ledger add column kassa_id uuid references public.kassas(id);
create index payments_kassa_idx on public.payments (kassa_id) where kassa_id is not null;

create function public.require_kassa()
returns trigger
language plpgsql
as $$
begin
  if new.kassa_id is null then
    raise exception 'A Касса is required for this operation';
  end if;
  return new;
end;
$$;

create trigger payments_require_kassa
  before insert on public.payments
  for each row execute function public.require_kassa();
create trigger patient_deposit_ledger_refund_require_kassa
  before insert on public.patient_deposit_ledger
  for each row when (new.transaction_type = 'refund')
  execute function public.require_kassa();

-- the card terminal must be the Касса's own terminal
create or replace function public.enforce_pos_terminal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requires boolean;
  v_term     record;
  v_kassa    record;
begin
  new.auth_code := nullif(btrim(new.auth_code), '');

  if new.payment_method_id is null then
    if new.pos_terminal_id is not null or new.auth_code is not null then
      raise exception 'POS terminal data requires a payment method';
    end if;
    return new;
  end if;

  select requires_terminal into v_requires from public.payment_methods where id = new.payment_method_id;

  if coalesce(v_requires, false) then
    if new.pos_terminal_id is null then
      raise exception 'Select the POS terminal used for this card payment';
    end if;
    select hospital_id, is_active into v_term from public.pos_terminals where id = new.pos_terminal_id;
    if not found or v_term.hospital_id <> new.hospital_id or not v_term.is_active then
      raise exception 'Select an active POS terminal';
    end if;
  elsif new.pos_terminal_id is not null or new.auth_code is not null then
    raise exception 'A POS terminal can only be set for card payments';
  end if;

  if new.kassa_id is not null then
    select hospital_id, pos_terminal_id into v_kassa from public.kassas where id = new.kassa_id;
    if not found or v_kassa.hospital_id <> new.hospital_id then
      raise exception 'Invalid Касса';
    end if;
    if coalesce(v_requires, false) and new.pos_terminal_id is distinct from v_kassa.pos_terminal_id then
      raise exception 'The POS terminal does not belong to this Касса';
    end if;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------ internal helpers
create function public.request_client_ip()
returns text
language sql
stable
set search_path = public
as $$
  select nullif(btrim(split_part(
    coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'x-forwarded-for', ',', 1)), '')
$$;

-- Resolve the calling computer to its Касса, or refuse. Also records last seen time/IP.
create function public.resolve_kassa(p_device_token text)
returns public.kassas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kassa public.kassas;
  v_ip    text := public.request_client_ip();
begin
  if p_device_token is null or btrim(p_device_token) = '' then
    raise exception 'This computer is not registered as a Касса';
  end if;

  select k.* into v_kassa
  from public.kassa_devices d
  join public.kassas k on k.id = d.kassa_id
  where d.token_hash = encode(sha256(convert_to(p_device_token, 'UTF8')), 'hex')
    and k.hospital_id = public.get_my_hospital_id()
    and k.is_active;

  if not found then
    raise exception 'This computer is not registered as a Касса';
  end if;

  update public.kassa_devices
     set last_seen_at = now(), last_seen_ip = v_ip
   where kassa_id = v_kassa.id
     and (last_seen_at is null or last_seen_at < now() - interval '5 minutes' or last_seen_ip is distinct from v_ip);

  return v_kassa;
end;
$$;

-- The terminal to record for a payment method on this Касса (null for non-card methods).
create function public.kassa_terminal_for(p_kassa public.kassas, p_method uuid)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  v_requires boolean;
begin
  select requires_terminal into v_requires from public.payment_methods where id = p_method and is_active;
  if not found then
    raise exception 'Select a valid payment method';
  end if;
  if v_requires then
    if p_kassa.pos_terminal_id is null then
      raise exception 'Касса "%" has no POS terminal assigned', p_kassa.name;
    end if;
    return p_kassa.pos_terminal_id;
  end if;
  return null;
end;
$$;

revoke execute on function public.request_client_ip() from public, anon, authenticated;
revoke execute on function public.resolve_kassa(text) from public, anon, authenticated;
revoke execute on function public.kassa_terminal_for(public.kassas, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------ pairing
create function public.issue_kassa_pairing_code(p_kassa_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital uuid := public.get_my_hospital_id();
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 32 symbols, no I/O/0/1
  v_bytes    bytea := uuid_send(gen_random_uuid());
  v_code     text := '';
  i          int;
begin
  if not public.has_permission('payments.manage_kassas') then
    raise exception 'Not authorized to manage cash desks';
  end if;
  if not exists (select 1 from public.kassas where id = p_kassa_id and hospital_id = v_hospital and is_active) then
    raise exception 'Active Касса not found';
  end if;

  -- bytes 6 and 8 of a v4 uuid carry fixed bits; use the random ones
  foreach i in array array[0, 1, 2, 3, 4, 5, 9, 10, 11, 12] loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;

  insert into public.kassa_devices (kassa_id, hospital_id, pairing_code_hash, pairing_expires_at)
  values (p_kassa_id, v_hospital, encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), now() + interval '15 minutes')
  on conflict (kassa_id) do update
    set pairing_code_hash = excluded.pairing_code_hash,
        pairing_expires_at = excluded.pairing_expires_at;

  return substr(v_code, 1, 5) || '-' || substr(v_code, 6, 5);
end;
$$;

create function public.pair_kassa_device(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital uuid := public.get_my_hospital_id();
  v_norm     text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_kassa    public.kassas;
  v_token    text;
begin
  if not public.has_permission('payments.receive') then
    raise exception 'Not authorized to receive payments';
  end if;
  if length(v_norm) <> 10 then
    raise exception 'Invalid or expired pairing code';
  end if;

  select k.* into v_kassa
  from public.kassa_devices d
  join public.kassas k on k.id = d.kassa_id
  where d.pairing_code_hash = encode(sha256(convert_to(v_norm, 'UTF8')), 'hex')
    and d.pairing_expires_at > now()
    and k.hospital_id = v_hospital
    and k.is_active
  for update of d;

  if not found then
    raise exception 'Invalid or expired pairing code';
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  update public.kassa_devices
     set token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
         paired_at = now(),
         pairing_code_hash = null,
         pairing_expires_at = null,
         last_seen_at = now(),
         last_seen_ip = public.request_client_ip()
   where kassa_id = v_kassa.id;

  return jsonb_build_object(
    'device_token', v_token,
    'kassa_id', v_kassa.id,
    'kassa_name', v_kassa.name
  );
end;
$$;

create function public.unpair_kassa(p_kassa_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('payments.manage_kassas') then
    raise exception 'Not authorized to manage cash desks';
  end if;
  update public.kassa_devices
     set token_hash = null, paired_at = null, pairing_code_hash = null, pairing_expires_at = null
   where kassa_id = p_kassa_id and hospital_id = public.get_my_hospital_id();
end;
$$;

-- status of the calling computer; no rows = not paired
create function public.get_my_kassa(p_device_token text)
returns table(kassa_id uuid, kassa_name text, pos_terminal_id uuid, pos_terminal_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kassa public.kassas;
begin
  if not public.has_permission('payments.receive') then
    raise exception 'Not authorized to receive payments';
  end if;
  if p_device_token is null or btrim(p_device_token) = '' then
    return;
  end if;
  begin
    v_kassa := public.resolve_kassa(p_device_token);
  exception when others then
    return;
  end;
  return query
    select v_kassa.id, v_kassa.name, v_kassa.pos_terminal_id,
           (select t.name from public.pos_terminals t where t.id = v_kassa.pos_terminal_id);
end;
$$;

-- ------------------------------------------------------------ payment functions (device token)
drop function public.process_payment(uuid, numeric, uuid, uuid, text);
drop function public.record_patient_deposit(uuid, numeric, uuid, uuid, text);
drop function public.pay_hospitalization_invoice(uuid, uuid, uuid, text);
drop function public.refund_patient_deposit(uuid, numeric, uuid, text, uuid, text);

create function public.process_payment(
  p_visit_id uuid,
  p_amount numeric,
  p_payment_method_id uuid,
  p_device_token text,
  p_auth_code text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital     uuid := public.get_my_hospital_id();
  v_kassa        public.kassas;
  v_payment      public.payments;
  v_total        numeric;
  v_paid         numeric;
  v_new_paid     numeric;
  v_ready_status uuid;
begin
  if not public.has_permission('payments.receive') then
    raise exception 'Not authorized to receive payments';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;
  v_kassa := public.resolve_kassa(p_device_token);

  select total_amount, amount_paid into v_total, v_paid
  from public.visits
  where id = p_visit_id and hospital_id = v_hospital
  for update;
  if not found then
    raise exception 'Visit not found';
  end if;

  v_new_paid := v_paid + p_amount;
  select id into v_ready_status from public.service_statuses where code = 'ready_for_execution';

  insert into public.payments (
    visit_id, hospital_id, amount, payment_method_id, received_by, paid_at, pos_terminal_id, auth_code, kassa_id
  ) values (
    p_visit_id, v_hospital, p_amount, p_payment_method_id, auth.uid(), now(),
    public.kassa_terminal_for(v_kassa, p_payment_method_id), p_auth_code, v_kassa.id
  )
  returning * into v_payment;

  update public.visits
  set amount_paid = v_new_paid,
      status = case
                 when v_new_paid >= v_total then 'paid'
                 when v_new_paid > 0 then 'partial'
                 else 'unpaid'
               end
  where id = p_visit_id;

  update public.visit_services
  set status_id = v_ready_status
  where visit_id = p_visit_id
    and status_id in (select id from public.service_statuses where code in ('preliminary', 'reservation'));

  return v_payment;
end;
$$;

create function public.record_patient_deposit(
  p_patient_id uuid,
  p_amount numeric,
  p_payment_method_id uuid,
  p_device_token text,
  p_auth_code text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital uuid := public.get_my_hospital_id();
  v_kassa    public.kassas;
  v_payment  public.payments;
begin
  if not public.has_permission('payments.receive') then
    raise exception 'Not authorized to receive payments';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Deposit amount must be greater than zero';
  end if;
  v_kassa := public.resolve_kassa(p_device_token);
  if not exists (select 1 from public.patients where id = p_patient_id and hospital_id = v_hospital) then
    raise exception 'Patient not found';
  end if;

  insert into public.payments (
    hospital_id, patient_id, amount, payment_method_id, received_by, payment_category, pos_terminal_id, auth_code, kassa_id
  ) values (
    v_hospital, p_patient_id, p_amount, p_payment_method_id, auth.uid(), 'deposit',
    public.kassa_terminal_for(v_kassa, p_payment_method_id), p_auth_code, v_kassa.id
  )
  returning * into v_payment;

  insert into public.patient_deposit_ledger (
    hospital_id, patient_id, transaction_type, amount, related_payment_id, created_by
  ) values (
    v_hospital, p_patient_id, 'deposit', p_amount, v_payment.id, auth.uid()
  );

  return v_payment;
end;
$$;

create function public.pay_hospitalization_invoice(
  p_invoice_id uuid,
  p_device_token text,
  p_payment_method_id uuid default null,
  p_auth_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital        uuid := public.get_my_hospital_id();
  v_kassa           public.kassas;
  v_status          text;
  v_hosp_id         uuid;
  v_patient_id      uuid;
  v_balance         record;
  v_deposit_balance numeric;
  v_apply_amount    numeric;
  v_remaining_after numeric;
  v_payment         public.payments;
begin
  if not public.has_permission('payments.receive') then
    raise exception 'Not authorized to receive payments';
  end if;
  v_kassa := public.resolve_kassa(p_device_token);

  select i.status, i.hospitalization_id, h.patient_id
    into v_status, v_hosp_id, v_patient_id
  from public.invoices i
  join public.hospitalizations h on h.id = i.hospitalization_id
  where i.id = p_invoice_id and i.hospital_id = v_hospital
  for update of i;
  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_status <> 'confirmed' then
    raise exception 'Only a confirmed invoice can be paid (current status: %)', v_status;
  end if;

  select * into v_balance from public.get_invoice_balance(p_invoice_id);
  if v_balance.remaining_amount <= 0 then
    raise exception 'Invoice is already fully paid';
  end if;

  v_deposit_balance := public.get_patient_deposit_balance(v_patient_id);
  v_apply_amount := least(v_deposit_balance, v_balance.remaining_amount);

  if v_apply_amount > 0 then
    insert into public.patient_deposit_ledger (
      hospital_id, patient_id, transaction_type, amount, invoice_id, created_by
    ) values (
      v_hospital, v_patient_id, 'applied_to_invoice', v_apply_amount, p_invoice_id, auth.uid()
    );
  end if;

  v_remaining_after := v_balance.remaining_amount - v_apply_amount;

  if v_remaining_after > 0 then
    if p_payment_method_id is null then
      raise exception 'Payment method required to cover the remaining balance of %', v_remaining_after;
    end if;

    insert into public.payments (
      hospital_id, patient_id, hospitalization_id, invoice_id,
      amount, payment_method_id, received_by, payment_category, pos_terminal_id, auth_code, kassa_id
    ) values (
      v_hospital, v_patient_id, v_hosp_id, p_invoice_id,
      v_remaining_after, p_payment_method_id, auth.uid(), 'settlement',
      public.kassa_terminal_for(v_kassa, p_payment_method_id), p_auth_code, v_kassa.id
    )
    returning * into v_payment;
  end if;

  update public.invoices set status = 'paid' where id = p_invoice_id;

  return jsonb_build_object(
    'invoice_id', p_invoice_id,
    'applied_from_deposit', v_apply_amount,
    'settlement_payment_id', v_payment.id,
    'settlement_amount', v_remaining_after,
    'receipt_number', v_payment.receipt_number
  );
end;
$$;

create function public.refund_patient_deposit(
  p_patient_id uuid,
  p_amount numeric,
  p_payment_method_id uuid,
  p_note text,
  p_device_token text,
  p_auth_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital   uuid := public.get_my_hospital_id();
  v_kassa      public.kassas;
  v_refundable numeric;
  v_ledger     public.patient_deposit_ledger;
  v_balance    numeric;
begin
  if not public.has_permission('payments.refund_deposit') then
    raise exception 'Not authorized to refund deposits';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Refund amount must be greater than zero, with at most 2 decimals';
  end if;
  if btrim(coalesce(p_note, '')) = '' then
    raise exception 'A reason is required';
  end if;
  v_kassa := public.resolve_kassa(p_device_token);

  perform 1 from public.patients where id = p_patient_id and hospital_id = v_hospital for update;
  if not found then
    raise exception 'Patient not found';
  end if;
  perform 1
  from public.invoices i
  join public.hospitalizations h on h.id = i.hospitalization_id
  where h.patient_id = p_patient_id and i.hospital_id = v_hospital and i.status = 'confirmed'
  for update of i;

  select r.refundable into v_refundable from public.get_patient_refundable_deposit(p_patient_id) r;
  if p_amount > v_refundable then
    raise exception 'Refund exceeds the refundable amount (%)', v_refundable;
  end if;

  insert into public.patient_deposit_ledger
    (hospital_id, patient_id, transaction_type, amount, receipt_number, created_by,
     payment_method_id, note, pos_terminal_id, auth_code, kassa_id)
  values
    (v_hospital, p_patient_id, 'refund', p_amount,
     public.generate_sequence_number(v_hospital, 'receipt'),
     auth.uid(), p_payment_method_id, btrim(p_note),
     public.kassa_terminal_for(v_kassa, p_payment_method_id), p_auth_code, v_kassa.id)
  returning * into v_ledger;

  v_balance := public.get_patient_deposit_balance(p_patient_id);
  if v_balance < 0 then
    raise exception 'Deposit balance cannot become negative';
  end if;

  return jsonb_build_object(
    'refund_id', v_ledger.id,
    'receipt_number', v_ledger.receipt_number,
    'amount', v_ledger.amount,
    'balance_after', v_balance
  );
end;
$$;

-- ------------------------------------------------------------ grants
revoke execute on function public.process_payment(uuid, numeric, uuid, text, text) from public, anon;
revoke execute on function public.record_patient_deposit(uuid, numeric, uuid, text, text) from public, anon;
revoke execute on function public.pay_hospitalization_invoice(uuid, text, uuid, text) from public, anon;
revoke execute on function public.refund_patient_deposit(uuid, numeric, uuid, text, text, text) from public, anon;
revoke execute on function public.issue_kassa_pairing_code(uuid) from public, anon;
revoke execute on function public.pair_kassa_device(text) from public, anon;
revoke execute on function public.unpair_kassa(uuid) from public, anon;
revoke execute on function public.get_my_kassa(text) from public, anon;
grant execute on function public.process_payment(uuid, numeric, uuid, text, text) to authenticated;
grant execute on function public.record_patient_deposit(uuid, numeric, uuid, text, text) to authenticated;
grant execute on function public.pay_hospitalization_invoice(uuid, text, uuid, text) to authenticated;
grant execute on function public.refund_patient_deposit(uuid, numeric, uuid, text, text, text) to authenticated;
grant execute on function public.issue_kassa_pairing_code(uuid) to authenticated;
grant execute on function public.pair_kassa_device(text) to authenticated;
grant execute on function public.unpair_kassa(uuid) to authenticated;
grant execute on function public.get_my_kassa(text) to authenticated;

-- ------------------------------------------------------------ report view (+ kassa)
create or replace view public.cash_flow_report_items
with (security_invoker = true) as
select
  p.id, p.hospital_id, p.paid_at as occurred_at, p.payment_category as movement_type,
  p.amount as amount, p.receipt_number,
  case
    when p.hospitalization_id is not null then 'IP'
    when p.visit_id is not null then 'OP'
  end as care_type,
  pt.id as patient_id, pt.patient_number, pt.last_name, pt.first_name, pt.date_of_birth,
  h.hospitalization_number, inv.invoice_number,
  pm.code as payment_method_code, pm.name_ru as payment_method_name,
  pr.full_name as staff_name,
  null::text as note,
  tm.name as pos_terminal_name,
  p.auth_code,
  p.kassa_id,
  ks.name as kassa_name
from public.payments p
join public.payment_methods pm on pm.id = p.payment_method_id
left join public.visits v on v.id = p.visit_id
left join public.patients pt on pt.id = coalesce(p.patient_id, v.patient_id)
left join public.hospitalizations h on h.id = p.hospitalization_id
left join public.invoices inv on inv.id = p.invoice_id
left join public.profiles pr on pr.id = p.received_by
left join public.pos_terminals tm on tm.id = p.pos_terminal_id
left join public.kassas ks on ks.id = p.kassa_id
where not p.is_refunded

union all

select
  l.id, l.hospital_id, l.created_at, 'deposit_refund',
  -l.amount, l.receipt_number, null,
  pt.id, pt.patient_number, pt.last_name, pt.first_name, pt.date_of_birth,
  null, null,
  pm.code, pm.name_ru,
  pr.full_name,
  l.note,
  tm.name,
  l.auth_code,
  l.kassa_id,
  ks.name
from public.patient_deposit_ledger l
join public.patients pt on pt.id = l.patient_id
join public.payment_methods pm on pm.id = l.payment_method_id
left join public.profiles pr on pr.id = l.created_by
left join public.pos_terminals tm on tm.id = l.pos_terminal_id
left join public.kassas ks on ks.id = l.kassa_id
where l.transaction_type = 'refund';
