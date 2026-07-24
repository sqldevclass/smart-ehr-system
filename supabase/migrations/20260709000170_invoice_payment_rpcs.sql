-- Migration 170: invoice paid/not-paid is computed live, never
-- stored — matches the plan's "never store what can be computed"
-- standard, and means it can never drift out of sync with the
-- underlying payments/deposit-applications.

-- ============================================================
-- 1. payments needs to point at the specific invoice it paid
--    down (settlement payments), not just the hospitalization.
-- ============================================================
ALTER TABLE public.payments
  ADD COLUMN invoice_id uuid
    REFERENCES public.invoices(id)
    ON DELETE SET NULL;

CREATE INDEX payments_invoice_idx ON public.payments(invoice_id);

-- ============================================================
-- 2. Computed balance for a single invoice.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_invoice_balance(p_invoice_id uuid)
RETURNS TABLE(
  total_amount     numeric,
  paid_amount      numeric,
  remaining_amount numeric,
  is_paid          boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(items.total, 0) AS total_amount,
    COALESCE(pay.paid, 0) + COALESCE(dep.applied, 0) AS paid_amount,
    GREATEST(
      COALESCE(items.total, 0) - (COALESCE(pay.paid, 0) + COALESCE(dep.applied, 0)),
      0
    ) AS remaining_amount,
    COALESCE(items.total, 0) <= (COALESCE(pay.paid, 0) + COALESCE(dep.applied, 0)) AS is_paid
  FROM
    (SELECT SUM(amount) AS total FROM public.invoice_items WHERE invoice_id = p_invoice_id) items,
    (SELECT SUM(amount) AS paid FROM public.payments
       WHERE invoice_id = p_invoice_id AND payment_category = 'settlement') pay,
    (SELECT SUM(amount) AS applied FROM public.patient_deposit_ledger
       WHERE invoice_id = p_invoice_id AND transaction_type = 'applied_to_invoice') dep;
$$;

-- ============================================================
-- 3. Record a patient deposit (Принять аванс) — atomic: one
--    payments row + one ledger row together.
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_patient_deposit(
  p_patient_id       uuid,
  p_hospital_id      uuid,
  p_amount           numeric,
  p_payment_method_id uuid,
  p_received_by      uuid
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Deposit amount must be greater than zero';
  END IF;

  INSERT INTO public.payments (
    hospital_id, patient_id, amount, payment_method_id,
    received_by, payment_category
  ) VALUES (
    p_hospital_id, p_patient_id, p_amount, p_payment_method_id,
    p_received_by, 'deposit'
  )
  RETURNING * INTO v_payment;

  INSERT INTO public.patient_deposit_ledger (
    hospital_id, patient_id, transaction_type, amount,
    related_payment_id, created_by
  ) VALUES (
    p_hospital_id, p_patient_id, 'deposit', p_amount,
    v_payment.id, p_received_by
  );

  RETURN v_payment;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'record_patient_deposit failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 4. Pay a hospitalization's invoice (Счет-фактура -> Pay) —
--    atomic: applies available deposit balance first, then
--    collects a settlement payment for whatever remains. Correctly
--    handles the case where deposit alone fully covers the
--    invoice (no payments row created, since amount must be > 0).
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
  v_balance        record;
  v_deposit_balance numeric;
  v_apply_amount     numeric;
  v_remaining_after   numeric;
  v_payment            public.payments;
BEGIN
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
