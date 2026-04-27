-- Migration 013: Visits, Visit Services, Invoices, Payments, Refund Requests

-- ============================================================
-- VISITS
-- One visit per patient per day (outpatient) or per hospitalization
-- ============================================================

CREATE TABLE public.visits (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  hospital_id         uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  visit_type          text NOT NULL CHECK (visit_type IN ('outpatient','inpatient')),
  visit_date          date NOT NULL DEFAULT current_date,
  registration_source text,
  total_amount        numeric(12,2) DEFAULT 0,
  amount_paid         numeric(12,2) DEFAULT 0,
  status              text DEFAULT 'unpaid'
                        CHECK (status IN ('unpaid','partial','paid','cancelled')),
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX visits_hospital_idx ON public.visits(hospital_id);
CREATE INDEX visits_patient_idx ON public.visits(patient_id);
CREATE INDEX visits_date_idx ON public.visits(visit_date);
CREATE INDEX visits_status_idx ON public.visits(status);

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visits_select" ON public.visits
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "visits_insert" ON public.visits
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('services.add')
  );

CREATE POLICY "visits_update" ON public.visits
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (hospital_id = public.get_my_hospital_id());

-- ============================================================
-- VISIT SERVICES
-- Each row is a service instance attached to a patient visit
-- ============================================================

CREATE TABLE public.visit_services (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id                    uuid NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  patient_id                  uuid NOT NULL REFERENCES public.patients(id),
  hospital_id                 uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  service_id                  uuid NOT NULL REFERENCES public.services(id),
  hospitalization_id          uuid,
  assigned_physician_id       uuid REFERENCES public.physicians(id),
  assigned_room_id            uuid REFERENCES public.rooms(id),
  status_id                   uuid NOT NULL REFERENCES public.service_statuses(id),
  source                      text NOT NULL
                                CHECK (source IN (
                                  'registrar','physician','call_center',
                                  'inpatient_physician'
                                )),
  queue_number                int,
  scheduled_at                timestamptz,
  completed_at                timestamptz,
  cost_at_time                numeric(12,2) NOT NULL,
  hospitalization_recommended boolean DEFAULT false,
  created_by                  uuid REFERENCES public.profiles(id),
  created_at                  timestamptz DEFAULT now()
);

CREATE INDEX visit_services_hospital_idx ON public.visit_services(hospital_id);
CREATE INDEX visit_services_visit_idx ON public.visit_services(visit_id);
CREATE INDEX visit_services_patient_idx ON public.visit_services(patient_id);
CREATE INDEX visit_services_physician_idx ON public.visit_services(assigned_physician_id);
CREATE INDEX visit_services_status_idx ON public.visit_services(status_id);
CREATE INDEX visit_services_scheduled_idx ON public.visit_services(scheduled_at);

-- Audit trigger
CREATE TRIGGER visit_services_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.visit_services
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

ALTER TABLE public.visit_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visit_services_select" ON public.visit_services
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "visit_services_insert" ON public.visit_services
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('services.add')
  );

CREATE POLICY "visit_services_update" ON public.visit_services
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('services.status_forward')
  );

-- ============================================================
-- Add FK from schedule_slots to visit_services
-- (deferred in Migration 009)
-- ============================================================

ALTER TABLE public.schedule_slots
  ADD CONSTRAINT schedule_slots_visit_service_fk
  FOREIGN KEY (visit_service_id)
  REFERENCES public.visit_services(id)
  ON DELETE SET NULL;

-- ============================================================
-- INVOICES
-- ============================================================

CREATE TABLE public.invoices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id       uuid NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  hospital_id    uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  invoice_number text UNIQUE,
  status         text DEFAULT 'active'
                   CHECK (status IN ('active','cancelled')),
  created_by     uuid REFERENCES public.profiles(id),
  cancelled_by   uuid REFERENCES public.profiles(id),
  cancelled_at   timestamptz,
  cancel_reason  text,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX invoices_hospital_idx ON public.invoices(hospital_id);
CREATE INDEX invoices_visit_idx ON public.invoices(visit_id);

-- Invoice number generation trigger
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := public.generate_sequence_number(
      NEW.hospital_id,
      'invoice'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_generate_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.generate_invoice_number();

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select" ON public.invoices
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "invoices_insert" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('invoices.add')
  );

CREATE POLICY "invoices_update" ON public.invoices
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('invoices.cancel')
  );

-- ============================================================
-- INVOICE ITEMS
-- ============================================================

CREATE TABLE public.invoice_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  visit_service_id uuid NOT NULL REFERENCES public.visit_services(id),
  amount           numeric(12,2) NOT NULL
);

CREATE INDEX invoice_items_invoice_idx ON public.invoice_items(invoice_id);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_items_select" ON public.invoice_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND i.hospital_id = public.get_my_hospital_id()
    )
  );

CREATE POLICY "invoice_items_insert" ON public.invoice_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND i.hospital_id = public.get_my_hospital_id()
    )
    AND public.has_permission('invoices.add')
  );

-- ============================================================
-- PAYMENTS
-- ============================================================

CREATE TABLE public.payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id          uuid NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  hospital_id       uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  amount            numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method_id uuid NOT NULL REFERENCES public.payment_methods(id),
  received_by       uuid REFERENCES public.profiles(id),
  receipt_number    text UNIQUE,
  paid_at           timestamptz DEFAULT now(),
  is_refunded       boolean DEFAULT false,
  refunded_at       timestamptz,
  refunded_by       uuid REFERENCES public.profiles(id)
);

CREATE INDEX payments_hospital_idx ON public.payments(hospital_id);
CREATE INDEX payments_visit_idx ON public.payments(visit_id);

-- Receipt number generation trigger
CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.receipt_number IS NULL THEN
    NEW.receipt_number := public.generate_sequence_number(
      NEW.hospital_id,
      'receipt'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payments_generate_number
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.generate_receipt_number();

-- Audit trigger
CREATE TRIGGER payments_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select" ON public.payments
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "payments_insert" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('payments.receive')
  );

-- ============================================================
-- REFUND REQUESTS
-- ============================================================

CREATE TABLE public.refund_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id    uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  hospital_id   uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  requested_by  uuid NOT NULL REFERENCES public.profiles(id),
  requested_at  timestamptz DEFAULT now(),
  reason        text NOT NULL,
  status        text DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
  approved_by   uuid REFERENCES public.profiles(id),
  approved_at   timestamptz,
  rejected_by   uuid REFERENCES public.profiles(id),
  rejected_at   timestamptz
);

CREATE INDEX refund_requests_hospital_idx ON public.refund_requests(hospital_id);
CREATE INDEX refund_requests_payment_idx ON public.refund_requests(payment_id);
CREATE INDEX refund_requests_status_idx ON public.refund_requests(status);

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refund_requests_select" ON public.refund_requests
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "refund_requests_insert" ON public.refund_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('payments.refund_request')
  );

CREATE POLICY "refund_requests_update" ON public.refund_requests
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('payments.refund_approve')
  );

-- ============================================================
-- process_payment RPC function
-- Called by cashier when patient pays
-- Atomically:
--   1. Inserts payment record
--   2. Updates visit totals
--   3. Moves all visit_services to ready_for_execution
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_payment(
  p_visit_id          uuid,
  p_amount            numeric,
  p_payment_method_id uuid,
  p_received_by       uuid
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment        public.payments;
  v_hospital_id    uuid;
  v_new_paid       numeric;
  v_total          numeric;
  v_ready_status   uuid;
BEGIN
  -- Get hospital_id and totals
  SELECT hospital_id, total_amount, amount_paid
  INTO v_hospital_id, v_total, v_new_paid
  FROM public.visits
  WHERE id = p_visit_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit not found: %', p_visit_id;
  END IF;

  v_new_paid := v_new_paid + p_amount;

  -- Get ready_for_execution status id
  SELECT id INTO v_ready_status
  FROM public.service_statuses
  WHERE code = 'ready_for_execution';

  -- Insert payment
  INSERT INTO public.payments (
    visit_id,
    hospital_id,
    amount,
    payment_method_id,
    received_by,
    paid_at
  ) VALUES (
    p_visit_id,
    v_hospital_id,
    p_amount,
    p_payment_method_id,
    p_received_by,
    now()
  )
  RETURNING * INTO v_payment;

  -- Update visit totals and status
  UPDATE public.visits
  SET
    amount_paid  = v_new_paid,
    status       = CASE
                     WHEN v_new_paid >= v_total THEN 'paid'
                     WHEN v_new_paid > 0 THEN 'partial'
                     ELSE 'unpaid'
                   END
  WHERE id = p_visit_id;

  -- Move all preliminary/reservation services to ready_for_execution
  UPDATE public.visit_services
  SET status_id = v_ready_status
  WHERE visit_id = p_visit_id
    AND status_id IN (
      SELECT id FROM public.service_statuses
      WHERE code IN ('preliminary', 'reservation')
    );

  RETURN v_payment;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Payment processing failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- complete_service RPC function
-- Called by physician when marking a service as completed
-- Atomically:
--   1. Updates visit_service status to completed
--   2. Sets completed_at timestamp
-- (consumables writeoff added in Phase 5 when products table exists)
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_service(
  p_visit_service_id uuid,
  p_completed_by     uuid
)
RETURNS public.visit_services
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service        public.visit_services;
  v_completed_status uuid;
  v_ready_status     uuid;
BEGIN
  -- Get status IDs
  SELECT id INTO v_completed_status
  FROM public.service_statuses WHERE code = 'completed';

  SELECT id INTO v_ready_status
  FROM public.service_statuses WHERE code = 'ready_for_execution';

  -- Fetch and lock the service row
  SELECT * INTO v_service
  FROM public.visit_services
  WHERE id = p_visit_service_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit service not found: %', p_visit_service_id;
  END IF;

  -- Only allow completion from ready_for_execution
  IF v_service.status_id != v_ready_status THEN
    RAISE EXCEPTION 'Service must be in Ready for Execution status to complete. Current status id: %',
      v_service.status_id;
  END IF;

  -- Update to completed
  UPDATE public.visit_services
  SET
    status_id    = v_completed_status,
    completed_at = now()
  WHERE id = p_visit_service_id
  RETURNING * INTO v_service;

  RETURN v_service;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Service completion failed: %', SQLERRM;
END;
$$;