-- Migration 171: Invoice lifecycle — active -> confirmed (Долг)
-- -> paid (История), with a cancel path back from confirmed.
--
-- inpatient_order_service needs NO changes at all — it already
-- looks up the invoice to reuse via status = 'active' specifically
-- (not "not cancelled"), so once an invoice is confirmed it will
-- automatically be skipped and a fresh active one created for the
-- same hospitalization. That's what guarantees exactly one open
-- invoice per hospitalization at a time.

-- ============================================================
-- 1. Widen invoices.status (dynamic constraint lookup, since the
--    original inline CHECK's auto-generated name shouldn't be
--    assumed).
-- ============================================================
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att
    ON att.attrelid = rel.oid
   AND att.attnum = ANY (con.conkey)
  WHERE rel.relname = 'invoices'
    AND con.contype = 'c'
    AND att.attname = 'status'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.invoices DROP CONSTRAINT %I',
      v_constraint_name
    );
  END IF;

  ALTER TABLE public.invoices
    ADD CONSTRAINT invoices_status_check
    CHECK (status IN ('active', 'confirmed', 'paid', 'cancelled'));
END $$;

-- ============================================================
-- 2. Confirm (Создать Счет-фактура -> Подтвердить). Locks the
--    invoice — inpatient_order_service will no longer find it,
--    guaranteeing new services spawn a fresh active invoice.
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_hospitalization_invoice(
  p_invoice_id  uuid,
  p_confirmed_by uuid
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices;
BEGIN
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
  END IF;

  IF v_invoice.status != 'active' THEN
    RAISE EXCEPTION 'Only an active invoice can be confirmed (current status: %)', v_invoice.status;
  END IF;

  UPDATE public.invoices
  SET status = 'confirmed'
  WHERE id = p_invoice_id
  RETURNING * INTO v_invoice;

  RETURN v_invoice;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'confirm_hospitalization_invoice failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 3. Cancel a confirmed invoice — active hospitalizations only.
--    If an active invoice already exists for the same
--    hospitalization (new services were ordered since confirm),
--    merge this one's items into it and retire this one
--    permanently as 'cancelled'. Otherwise, simply revert to
--    'active' — nothing to merge into.
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancel_hospitalization_invoice(
  p_invoice_id  uuid,
  p_cancelled_by uuid
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice        public.invoices;
  v_discharged_at   timestamptz;
  v_active_invoice_id uuid;
BEGIN
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
  END IF;

  IF v_invoice.status != 'confirmed' THEN
    RAISE EXCEPTION 'Only a confirmed invoice can be cancelled (current status: %)', v_invoice.status;
  END IF;

  IF v_invoice.hospitalization_id IS NULL THEN
    RAISE EXCEPTION 'This invoice is not tied to a hospitalization';
  END IF;

  SELECT discharged_at INTO v_discharged_at
  FROM public.hospitalizations
  WHERE id = v_invoice.hospitalization_id;

  IF v_discharged_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot cancel — this hospitalization has already been discharged';
  END IF;

  SELECT id INTO v_active_invoice_id
  FROM public.invoices
  WHERE hospitalization_id = v_invoice.hospitalization_id
    AND status = 'active'
    AND id != p_invoice_id
  LIMIT 1;

  IF v_active_invoice_id IS NOT NULL THEN
    -- Merge this invoice's items into the already-active one,
    -- then retire this one permanently.
    UPDATE public.invoice_items
    SET invoice_id = v_active_invoice_id
    WHERE invoice_id = p_invoice_id;

    UPDATE public.invoices
    SET status = 'cancelled'
    WHERE id = p_invoice_id
    RETURNING * INTO v_invoice;
  ELSE
    -- Nothing to merge into — simply reopen this one.
    UPDATE public.invoices
    SET status = 'active'
    WHERE id = p_invoice_id
    RETURNING * INTO v_invoice;
  END IF;

  RETURN v_invoice;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'cancel_hospitalization_invoice failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 4. pay_hospitalization_invoice: guard to confirmed-only, and
--    actually set status = 'paid' once fully settled (it never
--    did either of these before).
-- ============================================================
CREATE OR REPLACE FUNCTION public.pay_hospitalization_invoice(
  p_invoice_id        uuid,
  p_hospital_id       uuid,
  p_patient_id        uuid,
  p_hospitalization_id uuid,
  p_payment_method_id  uuid DEFAULT NULL,
  p_received_by         uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status          text;
  v_balance         record;
  v_deposit_balance  numeric;
  v_apply_amount      numeric;
  v_remaining_after     numeric;
  v_payment               public.payments;
BEGIN
  SELECT status INTO v_status
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found: %', p_invoice_id;
  END IF;

  IF v_status != 'confirmed' THEN
    RAISE EXCEPTION 'Only a confirmed invoice can be paid (current status: %)', v_status;
  END IF;

  SELECT * INTO v_balance
  FROM public.get_invoice_balance(p_invoice_id);

  IF v_balance.remaining_amount <= 0 THEN
    RAISE EXCEPTION 'Invoice is already fully paid';
  END IF;

  v_deposit_balance := public.get_patient_deposit_balance(p_patient_id);
  v_apply_amount := LEAST(v_deposit_balance, v_balance.remaining_amount);

  IF v_apply_amount > 0 THEN
    INSERT INTO public.patient_deposit_ledger (
      hospital_id, patient_id, transaction_type, amount,
      invoice_id, created_by
    ) VALUES (
      p_hospital_id, p_patient_id, 'applied_to_invoice', v_apply_amount,
      p_invoice_id, p_received_by
    );
  END IF;

  v_remaining_after := v_balance.remaining_amount - v_apply_amount;

  IF v_remaining_after > 0 THEN
    IF p_payment_method_id IS NULL THEN
      RAISE EXCEPTION 'Payment method required to cover the remaining balance of %', v_remaining_after;
    END IF;

    INSERT INTO public.payments (
      hospital_id, patient_id, hospitalization_id, invoice_id,
      amount, payment_method_id, received_by, payment_category
    ) VALUES (
      p_hospital_id, p_patient_id, p_hospitalization_id, p_invoice_id,
      v_remaining_after, p_payment_method_id, p_received_by, 'settlement'
    )
    RETURNING * INTO v_payment;
  END IF;

  UPDATE public.invoices
  SET status = 'paid'
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'invoice_id', p_invoice_id,
    'applied_from_deposit', v_apply_amount,
    'settlement_payment_id', v_payment.id,
    'settlement_amount', v_remaining_after,
    'receipt_number', v_payment.receipt_number
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'pay_hospitalization_invoice failed: %', SQLERRM;
END;
$$;
