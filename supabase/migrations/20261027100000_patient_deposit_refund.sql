-- Return a patient's surplus deposit balance (cashier).
--
--   patient_deposit_ledger  +payment_method_id, +note; a refund row must carry both.
--                           Audit trigger added; direct inserts removed (every writer is a
--                           SECURITY DEFINER function, so nothing legitimate breaks).
--   get_patient_refundable_deposit(patient)   balance, billed-but-unpaid, refundable
--   refund_patient_deposit(patient, amount, method, note)
--
-- refundable = deposit balance - outstanding of the patient's CONFIRMED (billed, unpaid)
-- hospitalization invoices, never below 0: the deposit is what pays a billed invoice.
-- The cap is enforced here, not only in the UI.

-- ------------------------------------------------------------ permission
insert into public.permissions (code, name_ru, name_en, module)
select 'payments.refund_deposit', 'Возврат депозита пациенту', 'Refund patient deposit', 'payments'
where not exists (select 1 from public.permissions where code = 'payments.refund_deposit');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'payments.refund_deposit'
where r.code in ('cashier', 'admin')
  and not exists (
    select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id
  );

-- ------------------------------------------------------------ ledger
alter table public.patient_deposit_ledger
  add column payment_method_id uuid references public.payment_methods(id),
  add column note text,
  add constraint patient_deposit_ledger_refund_details check (
    transaction_type <> 'refund'
    or (payment_method_id is not null and btrim(coalesce(note, '')) <> '')
  );

-- Only the SECURITY DEFINER functions write to the ledger.
drop policy if exists patient_deposit_ledger_insert on public.patient_deposit_ledger;
revoke insert, update, delete on public.patient_deposit_ledger from anon, authenticated;

create trigger patient_deposit_ledger_audit
  after insert or update or delete on public.patient_deposit_ledger
  for each row execute function public.audit_trigger_func();

-- ------------------------------------------------------------ refundable amount
create or replace function public.get_patient_refundable_deposit(p_patient_id uuid)
returns table(deposit_balance numeric, billed_outstanding numeric, refundable numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hospital uuid := public.get_my_hospital_id();
  v_balance  numeric;
  v_billed   numeric;
begin
  if not public.has_permission('payments.refund_deposit') then
    raise exception 'Not authorized to refund deposits';
  end if;
  if not exists (select 1 from public.patients where id = p_patient_id and hospital_id = v_hospital) then
    raise exception 'Patient not found';
  end if;

  v_balance := public.get_patient_deposit_balance(p_patient_id);

  select coalesce(sum(b.remaining_amount), 0) into v_billed
  from public.invoices i
  join public.hospitalizations h on h.id = i.hospitalization_id
  cross join lateral public.get_invoice_balance(i.id) b
  where h.patient_id = p_patient_id
    and i.hospital_id = v_hospital
    and i.status = 'confirmed';

  return query select v_balance, v_billed, greatest(v_balance - v_billed, 0);
end;
$$;

-- ------------------------------------------------------------ refund
create or replace function public.refund_patient_deposit(
  p_patient_id uuid,
  p_amount numeric,
  p_payment_method_id uuid,
  p_note text
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

  -- serialise with other refunds of this patient and with payment of the patient's
  -- billed invoices (pay_hospitalization_invoice locks the invoice row first)
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
    (hospital_id, patient_id, transaction_type, amount, receipt_number, created_by, payment_method_id, note)
  values
    (v_hospital, p_patient_id, 'refund', p_amount,
     public.generate_sequence_number(v_hospital, 'receipt'),
     auth.uid(), p_payment_method_id, btrim(p_note))
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

revoke execute on function public.get_patient_refundable_deposit(uuid) from public, anon;
revoke execute on function public.refund_patient_deposit(uuid, numeric, uuid, text) from public, anon;
grant execute on function public.get_patient_refundable_deposit(uuid) to authenticated;
grant execute on function public.refund_patient_deposit(uuid, numeric, uuid, text) to authenticated;
