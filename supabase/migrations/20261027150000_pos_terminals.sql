-- POS terminals: record which terminal took every card movement.
--
--   pos_terminals               registry per hospital (admin-managed)
--   payment_methods.requires_terminal   true for 'card'
--   payments / patient_deposit_ledger   + pos_terminal_id, + auth_code (slip code / RRN)
--   enforce_pos_terminal()      ONE trigger on both tables: a card method needs an active
--                               terminal of the same hospital; other methods must not carry one
--   process_payment, record_patient_deposit, pay_hospitalization_invoice,
--   refund_patient_deposit      take the terminal + auth code
--   cash_flow_report_items      + terminal, auth code
--
-- The three payment functions are re-created with caller-derived identity: the hospital
-- and cashier come from the session (get_my_hospital_id / auth.uid), not from client
-- parameters, and payments.receive is checked. payments could also be inserted directly
-- under RLS; that is closed, so the functions are the only writers (like the ledger).
-- Historical payments keep a NULL terminal.

-- ------------------------------------------------------------ permission
insert into public.permissions (code, name_ru, name_en, module)
select 'payments.manage_terminals', 'Управление POS-терминалами', 'Manage POS terminals', 'payments'
where not exists (select 1 from public.permissions where code = 'payments.manage_terminals');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'payments.manage_terminals'
where r.code = 'admin'
  and not exists (
    select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id
  );

-- ------------------------------------------------------------ registry
create table public.pos_terminals (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  name        text not null check (btrim(name) <> ''),
  bank_name   text,
  terminal_code text,   -- TID printed on the device / slip
  merchant_id text,
  location    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index pos_terminals_hospital_name_uq on public.pos_terminals (hospital_id, lower(btrim(name)));

alter table public.pos_terminals enable row level security;

create policy pos_terminals_select on public.pos_terminals
  for select to authenticated using (hospital_id = public.get_my_hospital_id());
create policy pos_terminals_insert on public.pos_terminals
  for insert to authenticated
  with check (hospital_id = public.get_my_hospital_id() and public.has_permission('payments.manage_terminals'));
create policy pos_terminals_update on public.pos_terminals
  for update to authenticated
  using (hospital_id = public.get_my_hospital_id() and public.has_permission('payments.manage_terminals'))
  with check (hospital_id = public.get_my_hospital_id() and public.has_permission('payments.manage_terminals'));

revoke all on public.pos_terminals from public, anon;
revoke all on public.pos_terminals from authenticated;
grant select, insert on public.pos_terminals to authenticated;
grant update (name, bank_name, terminal_code, merchant_id, location, is_active) on public.pos_terminals to authenticated;

create trigger pos_terminals_audit
  after insert or update or delete on public.pos_terminals
  for each row execute function public.audit_trigger_func();

-- ------------------------------------------------------------ method flag
alter table public.payment_methods add column requires_terminal boolean not null default false;
update public.payment_methods set requires_terminal = true where code = 'card';

-- ------------------------------------------------------------ columns
alter table public.payments
  add column pos_terminal_id uuid references public.pos_terminals(id),
  add column auth_code text check (auth_code is null or (btrim(auth_code) <> '' and length(auth_code) <= 64));

alter table public.patient_deposit_ledger
  add column pos_terminal_id uuid references public.pos_terminals(id),
  add column auth_code text check (auth_code is null or (btrim(auth_code) <> '' and length(auth_code) <= 64));

create index payments_pos_terminal_idx on public.payments (pos_terminal_id) where pos_terminal_id is not null;

-- ------------------------------------------------------------ single enforcement point
create function public.enforce_pos_terminal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requires boolean;
  v_term     record;
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

  return new;
end;
$$;

revoke execute on function public.enforce_pos_terminal() from public, anon, authenticated;

create trigger payments_enforce_pos_terminal
  before insert on public.payments
  for each row execute function public.enforce_pos_terminal();
create trigger patient_deposit_ledger_enforce_pos_terminal
  before insert on public.patient_deposit_ledger
  for each row execute function public.enforce_pos_terminal();

-- ------------------------------------------------------------ close direct writes to payments
drop policy if exists payments_insert on public.payments;
revoke all on public.payments from anon;
revoke insert, update, delete, truncate, references, trigger on public.payments from authenticated;

-- ------------------------------------------------------------ process_payment (visit)
drop function public.process_payment(uuid, numeric, uuid, uuid);

create function public.process_payment(
  p_visit_id uuid,
  p_amount numeric,
  p_payment_method_id uuid,
  p_pos_terminal_id uuid default null,
  p_auth_code text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital     uuid := public.get_my_hospital_id();
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
    visit_id, hospital_id, amount, payment_method_id, received_by, paid_at, pos_terminal_id, auth_code
  ) values (
    p_visit_id, v_hospital, p_amount, p_payment_method_id, auth.uid(), now(), p_pos_terminal_id, p_auth_code
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

-- ------------------------------------------------------------ record_patient_deposit
drop function public.record_patient_deposit(uuid, uuid, numeric, uuid, uuid);

create function public.record_patient_deposit(
  p_patient_id uuid,
  p_amount numeric,
  p_payment_method_id uuid,
  p_pos_terminal_id uuid default null,
  p_auth_code text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital uuid := public.get_my_hospital_id();
  v_payment  public.payments;
begin
  if not public.has_permission('payments.receive') then
    raise exception 'Not authorized to receive payments';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Deposit amount must be greater than zero';
  end if;
  if not exists (select 1 from public.patients where id = p_patient_id and hospital_id = v_hospital) then
    raise exception 'Patient not found';
  end if;

  insert into public.payments (
    hospital_id, patient_id, amount, payment_method_id, received_by, payment_category, pos_terminal_id, auth_code
  ) values (
    v_hospital, p_patient_id, p_amount, p_payment_method_id, auth.uid(), 'deposit', p_pos_terminal_id, p_auth_code
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

-- ------------------------------------------------------------ pay_hospitalization_invoice
drop function public.pay_hospitalization_invoice(uuid, uuid, uuid, uuid, uuid, uuid);

create function public.pay_hospitalization_invoice(
  p_invoice_id uuid,
  p_payment_method_id uuid default null,
  p_pos_terminal_id uuid default null,
  p_auth_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital        uuid := public.get_my_hospital_id();
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
      amount, payment_method_id, received_by, payment_category, pos_terminal_id, auth_code
    ) values (
      v_hospital, v_patient_id, v_hosp_id, p_invoice_id,
      v_remaining_after, p_payment_method_id, auth.uid(), 'settlement', p_pos_terminal_id, p_auth_code
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

-- ------------------------------------------------------------ refund_patient_deposit
drop function public.refund_patient_deposit(uuid, numeric, uuid, text);

create function public.refund_patient_deposit(
  p_patient_id uuid,
  p_amount numeric,
  p_payment_method_id uuid,
  p_note text,
  p_pos_terminal_id uuid default null,
  p_auth_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital   uuid := public.get_my_hospital_id();
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
  if not exists (select 1 from public.payment_methods where id = p_payment_method_id and is_active) then
    raise exception 'Select a valid payment method';
  end if;

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
     payment_method_id, note, pos_terminal_id, auth_code)
  values
    (v_hospital, p_patient_id, 'refund', p_amount,
     public.generate_sequence_number(v_hospital, 'receipt'),
     auth.uid(), p_payment_method_id, btrim(p_note), p_pos_terminal_id, p_auth_code)
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

-- ------------------------------------------------------------ grants (new signatures)
revoke execute on function public.process_payment(uuid, numeric, uuid, uuid, text) from public, anon;
revoke execute on function public.record_patient_deposit(uuid, numeric, uuid, uuid, text) from public, anon;
revoke execute on function public.pay_hospitalization_invoice(uuid, uuid, uuid, text) from public, anon;
revoke execute on function public.refund_patient_deposit(uuid, numeric, uuid, text, uuid, text) from public, anon;
grant execute on function public.process_payment(uuid, numeric, uuid, uuid, text) to authenticated;
grant execute on function public.record_patient_deposit(uuid, numeric, uuid, uuid, text) to authenticated;
grant execute on function public.pay_hospitalization_invoice(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.refund_patient_deposit(uuid, numeric, uuid, text, uuid, text) to authenticated;

-- ------------------------------------------------------------ report view (+ terminal, auth code)
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
  p.auth_code
from public.payments p
join public.payment_methods pm on pm.id = p.payment_method_id
left join public.visits v on v.id = p.visit_id
left join public.patients pt on pt.id = coalesce(p.patient_id, v.patient_id)
left join public.hospitalizations h on h.id = p.hospitalization_id
left join public.invoices inv on inv.id = p.invoice_id
left join public.profiles pr on pr.id = p.received_by
left join public.pos_terminals tm on tm.id = p.pos_terminal_id
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
  l.auth_code
from public.patient_deposit_ledger l
join public.patients pt on pt.id = l.patient_id
join public.payment_methods pm on pm.id = l.payment_method_id
left join public.profiles pr on pr.id = l.created_by
left join public.pos_terminals tm on tm.id = l.pos_terminal_id
where l.transaction_type = 'refund';
