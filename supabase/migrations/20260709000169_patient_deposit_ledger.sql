-- Migration 169: Patient deposit (Аванс) system.
--
-- Per clinic confirmation: deposits are collected against the
-- PATIENT, not a visit or hospitalization — usable for either
-- outpatient or inpatient billing, carry forward indefinitely, no
-- expiry, partially consumable across multiple future bills, and
-- refundable in cash. This requires an append-only ledger (not a
-- single mutable balance column), same philosophy already used
-- for audit_logs/inventory_transactions elsewhere in this schema.

-- ============================================================
-- 1. Widen payments — mirrors exactly how invoices was widened
--    in migration 067 (nullable visit_id + new linking column +
--    inclusive check), extended with a category distinguishing
--    a regular visit payment from a deposit collection or a
--    discharge settlement.
-- ============================================================
ALTER TABLE public.payments
  ALTER COLUMN visit_id DROP NOT NULL,
  ADD COLUMN patient_id uuid
    REFERENCES public.patients(id)
    ON DELETE CASCADE,
  ADD COLUMN hospitalization_id uuid
    REFERENCES public.hospitalizations(id)
    ON DELETE CASCADE,
  ADD COLUMN payment_category text NOT NULL DEFAULT 'regular'
    CHECK (payment_category IN ('regular', 'deposit', 'settlement'));

CREATE INDEX payments_patient_idx ON public.payments(patient_id);
CREATE INDEX payments_hospitalization_idx ON public.payments(hospitalization_id);

-- Each category has the association it actually needs:
--   regular    -> existing outpatient visit payment, visit_id
--   deposit    -> patient-level advance, no visit/hospitalization yet
--   settlement -> discharge payment, tied to the hospitalization
ALTER TABLE public.payments
  ADD CONSTRAINT payment_category_association_check CHECK (
    (payment_category = 'regular' AND visit_id IS NOT NULL)
    OR (payment_category = 'deposit' AND patient_id IS NOT NULL)
    OR (payment_category = 'settlement' AND hospitalization_id IS NOT NULL)
  );

-- ============================================================
-- 2. Append-only deposit ledger. Balance is always derived from
--    this table, never stored as a single number that could
--    drift out of sync.
-- ============================================================
CREATE TABLE public.patient_deposit_ledger (
  id                 uuid PRIMARY KEY
    DEFAULT gen_random_uuid(),
  hospital_id        uuid NOT NULL
    REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  patient_id         uuid NOT NULL
    REFERENCES public.patients(id)
    ON DELETE CASCADE,
  transaction_type    text NOT NULL
    CHECK (transaction_type IN ('deposit', 'applied_to_invoice', 'refund')),
  amount               numeric(12,2) NOT NULL CHECK (amount > 0),

  -- The deposit collection itself (type = 'deposit') or the
  -- settlement payment it offset (type = 'applied_to_invoice',
  -- when the discharge settlement still required additional
  -- money beyond the applied balance).
  related_payment_id    uuid
    REFERENCES public.payments(id)
    ON DELETE SET NULL,

  -- Which invoice this application reduced, when
  -- type = 'applied_to_invoice'.
  invoice_id              uuid
    REFERENCES public.invoices(id)
    ON DELETE SET NULL,

  -- For a cash refund receipt (type = 'refund').
  receipt_number            text UNIQUE,

  created_by                 uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  created_at                  timestamptz DEFAULT now()
);

CREATE INDEX patient_deposit_ledger_patient_idx
  ON public.patient_deposit_ledger(patient_id, created_at);

ALTER TABLE public.patient_deposit_ledger
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_deposit_ledger_select"
  ON public.patient_deposit_ledger
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "patient_deposit_ledger_insert"
  ON public.patient_deposit_ledger
  FOR INSERT TO authenticated
  WITH CHECK (hospital_id = public.get_my_hospital_id());

-- No UPDATE or DELETE policy — append-only, matching audit_logs.

-- ============================================================
-- 3. Helper: current available deposit balance for a patient.
--    SECURITY DEFINER so it can be called directly from the
--    frontend without needing broader table access.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_patient_deposit_balance(p_patient_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN transaction_type = 'deposit' THEN amount
      WHEN transaction_type IN ('applied_to_invoice', 'refund') THEN -amount
    END
  ), 0)
  FROM public.patient_deposit_ledger
  WHERE patient_id = p_patient_id
    AND hospital_id = public.get_my_hospital_id();
$$;
