-- Migration 120: Slot-level dispensing architecture
-- Pharmacy lifecycle moves from drug_prescriptions to drug_administration_slots.
-- Each slot is dispensed/accepted/administered independently.
--
-- 1. patients: weight_kg, height_cm
-- 2. drug_administration_slots: dispense_status, dept_batch_id, audit fields
-- 3. Backfill existing slots from prescription state
-- 4. update_slot_status RPC (pharmacist per-slot status changes)
-- 5. dispense_slot RPC (nurse per-slot acceptance → stock movement)
-- 6. administer_drug: reads dept_batch_id from slot
-- 7. order_prn_drug: simplified — creates slot only
-- 8. submit_prescriptions: own-drug slots created ready_for_execution

-- ============================================================
-- 1. Patients: weight and height
-- ============================================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS weight_kg numeric CHECK (weight_kg > 0),
  ADD COLUMN IF NOT EXISTS height_cm numeric CHECK (height_cm > 0);

-- ============================================================
-- 2. Slot-level dispense lifecycle
-- ============================================================

ALTER TABLE public.drug_administration_slots
  ADD COLUMN IF NOT EXISTS dispense_status text NOT NULL DEFAULT 'preliminary'
    REFERENCES public.medication_order_statuses(code),
  ADD COLUMN IF NOT EXISTS dept_batch_id uuid
    REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispense_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispense_changed_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS drug_admin_slots_dispense_status_idx
  ON public.drug_administration_slots(hospital_id, dispense_status);

-- ============================================================
-- 3. Backfill existing slots
-- ============================================================

-- Own-drug slots never touch pharmacy: ready immediately
UPDATE public.drug_administration_slots s
SET dispense_status = 'ready_for_execution'
FROM public.drug_prescriptions p
WHERE p.id = s.prescription_id
  AND p.is_patient_own_drug = true
  AND s.status = 'pending';

-- Administered/skipped slots: completed
UPDATE public.drug_administration_slots
SET dispense_status = 'completed'
WHERE status IN ('done', 'skipped');

-- Pending slots on prescriptions that were already dispensed:
-- inherit prescription state and batch
UPDATE public.drug_administration_slots s
SET dispense_status = p.status_code,
    dept_batch_id   = p.dept_batch_id
FROM public.drug_prescriptions p
WHERE p.id = s.prescription_id
  AND p.is_patient_own_drug = false
  AND s.status = 'pending'
  AND p.status_code IN ('in_progress', 'ready_for_execution');

-- ============================================================
-- 4. update_slot_status RPC — pharmacist per-slot actions
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_slot_status(
  p_slot_id     uuid,
  p_hospital_id uuid,
  p_new_status  text,
  p_changed_by  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot record;
BEGIN
  SELECT s.*, p.is_patient_own_drug
  INTO v_slot
  FROM public.drug_administration_slots s
  JOIN public.drug_prescriptions p ON p.id = s.prescription_id
  WHERE s.id = p_slot_id
    AND s.hospital_id = p_hospital_id
  FOR UPDATE OF s;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Slot not found: %', p_slot_id;
  END IF;

  IF v_slot.is_patient_own_drug THEN
    RAISE EXCEPTION 'Patient own drugs are not processed by pharmacy';
  END IF;

  -- Validate transitions
  IF p_new_status = 'in_progress'
     AND v_slot.dispense_status NOT IN ('preliminary', 'return') THEN
    RAISE EXCEPTION 'Cannot set in_progress from status: %', v_slot.dispense_status;
  END IF;

  IF p_new_status = 'cancelled'
     AND v_slot.dispense_status IN ('completed') THEN
    RAISE EXCEPTION 'Cannot cancel a completed slot';
  END IF;

  UPDATE public.drug_administration_slots
  SET dispense_status      = p_new_status,
      dispense_changed_at  = now(),
      dispense_changed_by  = p_changed_by
  WHERE id = p_slot_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'update_slot_status failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 5. dispense_slot RPC — nurse accepts one slot
--    Pharmacy stock deducted, dept batch created, slot ready
-- ============================================================

CREATE OR REPLACE FUNCTION public.dispense_slot(
  p_slot_id     uuid,
  p_hospital_id uuid,
  p_accepted_by uuid
)
RETURNS uuid  -- new dept batch id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot         record;
  v_prescription record;
  v_pharmacy_wh  uuid;
  v_dept_wh      uuid;
  v_batch        record;
  v_qty_units    numeric;
  v_new_batch_id uuid;
BEGIN
  SELECT * INTO v_slot
  FROM public.drug_administration_slots
  WHERE id = p_slot_id
    AND hospital_id = p_hospital_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Slot not found: %', p_slot_id;
  END IF;

  IF v_slot.dispense_status != 'in_progress' THEN
    RAISE EXCEPTION 'Slot is not in_progress. Current status: %',
      v_slot.dispense_status;
  END IF;

  IF v_slot.dept_batch_id IS NOT NULL THEN
    RAISE EXCEPTION 'Slot already dispensed';
  END IF;

  SELECT dp.*, df.min_write_off_qty
  INTO v_prescription
  FROM public.drug_prescriptions dp
  JOIN public.drug_formulary df ON df.id = dp.drug_formulary_id
  WHERE dp.id = v_slot.prescription_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prescription not found for slot %', p_slot_id;
  END IF;

  IF v_prescription.is_patient_own_drug THEN
    RAISE EXCEPTION 'Patient own drugs are not dispensed from pharmacy';
  END IF;

  v_qty_units := COALESCE(v_prescription.min_write_off_qty, 1);

  SELECT w.id INTO v_pharmacy_wh
  FROM public.warehouses w
  JOIN public.warehouse_types wt ON wt.id = w.warehouse_type_id
  WHERE w.hospital_id = p_hospital_id
    AND wt.code = 'central_pharmacy'
  LIMIT 1;

  IF v_pharmacy_wh IS NULL THEN
    RAISE EXCEPTION 'No pharmacy warehouse found for hospital %', p_hospital_id;
  END IF;

  SELECT w.id INTO v_dept_wh
  FROM public.hospitalizations h
  JOIN public.departments d ON d.id = h.department_id
  JOIN public.warehouses w ON w.department_id = d.id
  JOIN public.warehouse_types wt ON wt.id = w.warehouse_type_id
  WHERE h.id = v_slot.hospitalization_id
    AND w.hospital_id = p_hospital_id
    AND wt.code = 'department'
  LIMIT 1;

  IF v_dept_wh IS NULL THEN
    RAISE EXCEPTION 'No department warehouse found for hospitalization %',
      v_slot.hospitalization_id;
  END IF;

  -- FIFO batch from pharmacy
  SELECT * INTO v_batch
  FROM public.inventory_batches
  WHERE warehouse_id      = v_pharmacy_wh
    AND drug_formulary_id = v_prescription.drug_formulary_id
    AND hospital_id       = p_hospital_id
    AND COALESCE(quantity_units, 0) >= v_qty_units
  ORDER BY COALESCE(expiry_date, '9999-12-31') ASC, received_at ASC
  FOR UPDATE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient stock for drug % in pharmacy warehouse',
      v_prescription.drug_formulary_id;
  END IF;

  UPDATE public.inventory_batches
  SET quantity_units = quantity_units - v_qty_units
  WHERE id = v_batch.id;

  INSERT INTO public.inventory_transactions (
    hospital_id, warehouse_id, inventory_batch_id,
    drug_formulary_id, product_id,
    source_type, quantity_packages, quantity_units,
    reference_id, performed_by, performed_at
  ) VALUES (
    p_hospital_id, v_pharmacy_wh, v_batch.id,
    v_prescription.drug_formulary_id, NULL,
    'transfer_out', 0, -v_qty_units,
    p_slot_id, p_accepted_by, now()
  );

  INSERT INTO public.inventory_batches (
    hospital_id, warehouse_id, drug_formulary_id, product_id,
    supplier_id, series_number, expiry_date,
    quantity_packages, quantity_units,
    purchase_price, markup_percent,
    received_by, received_at
  ) VALUES (
    p_hospital_id, v_dept_wh, v_prescription.drug_formulary_id, NULL,
    v_batch.supplier_id, v_batch.series_number, v_batch.expiry_date,
    0, v_qty_units,
    v_batch.purchase_price, v_batch.markup_percent,
    p_accepted_by, now()
  )
  RETURNING id INTO v_new_batch_id;

  INSERT INTO public.inventory_transactions (
    hospital_id, warehouse_id, inventory_batch_id,
    drug_formulary_id, product_id,
    source_type, quantity_packages, quantity_units,
    reference_id, performed_by, performed_at
  ) VALUES (
    p_hospital_id, v_dept_wh, v_new_batch_id,
    v_prescription.drug_formulary_id, NULL,
    'transfer_in', 0, v_qty_units,
    p_slot_id, p_accepted_by, now()
  );

  UPDATE public.drug_administration_slots
  SET dept_batch_id       = v_new_batch_id,
      dispense_status     = 'ready_for_execution',
      dispense_changed_at = now(),
      dispense_changed_by = p_accepted_by
  WHERE id = p_slot_id;

  RETURN v_new_batch_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'dispense_slot failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 6. administer_drug: batch comes from the slot
-- ============================================================

CREATE OR REPLACE FUNCTION public.administer_drug(
  p_slot_id         uuid,
  p_hospital_id     uuid,
  p_administered_by uuid,
  p_dose_given      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot         record;
  v_prescription record;
  v_batch        record;
  v_qty_units    numeric;
  v_invoice_id   uuid;
  v_price        numeric;
BEGIN
  SELECT * INTO v_slot
  FROM public.drug_administration_slots
  WHERE id = p_slot_id
    AND hospital_id = p_hospital_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Administration slot not found: %', p_slot_id;
  END IF;

  IF v_slot.status != 'pending' THEN
    RAISE EXCEPTION 'Slot is not pending. Current status: %', v_slot.status;
  END IF;

  SELECT dp.*, df.min_write_off_qty, df.unit_id
  INTO v_prescription
  FROM public.drug_prescriptions dp
  LEFT JOIN public.drug_formulary df ON df.id = dp.drug_formulary_id
  WHERE dp.id = v_slot.prescription_id
    AND dp.hospital_id = p_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prescription not found for slot %', p_slot_id;
  END IF;

  -- Patient's own drug: no pharmacy/inventory involvement
  IF v_prescription.is_patient_own_drug THEN
    UPDATE public.drug_administration_slots
    SET status          = 'done',
        administered_at = now(),
        administered_by = p_administered_by,
        dose_given      = COALESCE(p_dose_given, dose_given),
        dispense_status = 'completed',
        dispense_changed_at = now(),
        dispense_changed_by = p_administered_by
    WHERE id = p_slot_id;
    RETURN;
  END IF;

  -- Regular drug: this slot must have been dispensed
  IF v_slot.dispense_status != 'ready_for_execution' THEN
    RAISE EXCEPTION 'Slot has not been dispensed yet. Status: %',
      v_slot.dispense_status;
  END IF;

  IF v_slot.dept_batch_id IS NULL THEN
    RAISE EXCEPTION 'Slot has no department batch';
  END IF;

  v_qty_units := COALESCE(v_prescription.min_write_off_qty, 1);

  SELECT * INTO v_batch
  FROM public.inventory_batches
  WHERE id = v_slot.dept_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Department batch not found: %', v_slot.dept_batch_id;
  END IF;

  IF COALESCE(v_batch.quantity_units, 0) < v_qty_units THEN
    RAISE EXCEPTION 'Insufficient stock in department warehouse for this drug';
  END IF;

  UPDATE public.drug_administration_slots
  SET status          = 'done',
      administered_at = now(),
      administered_by = p_administered_by,
      dose_given      = COALESCE(p_dose_given, dose_given),
      dispense_status = 'completed',
      dispense_changed_at = now(),
      dispense_changed_by = p_administered_by
  WHERE id = p_slot_id;

  UPDATE public.inventory_batches
  SET quantity_units = quantity_units - v_qty_units
  WHERE id = v_slot.dept_batch_id;

  INSERT INTO public.inventory_transactions (
    hospital_id, warehouse_id, inventory_batch_id,
    drug_formulary_id, product_id,
    source_type, quantity_packages, quantity_units,
    reference_id, performed_by, performed_at
  ) VALUES (
    p_hospital_id, v_batch.warehouse_id, v_slot.dept_batch_id,
    v_prescription.drug_formulary_id, NULL,
    'consumable', 0, -v_qty_units,
    p_slot_id, p_administered_by, now()
  );

  v_price := COALESCE(v_batch.selling_price, 0) * v_qty_units;

  IF v_price > 0 THEN
    SELECT id INTO v_invoice_id
    FROM public.invoices
    WHERE hospitalization_id = v_slot.hospitalization_id
      AND hospital_id = p_hospital_id
      AND status = 'active'
    LIMIT 1;

    IF v_invoice_id IS NOT NULL THEN
      INSERT INTO public.invoice_items (
        invoice_id, visit_service_id, amount
      ) VALUES (
        v_invoice_id, NULL, v_price
      );
    END IF;
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'administer_drug failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 7. order_prn_drug: simplified — creates one slot
--    Slot starts at preliminary; pharmacist drives lifecycle
-- ============================================================

CREATE OR REPLACE FUNCTION public.order_prn_drug(
  p_prescription_id uuid,
  p_hospital_id     uuid,
  p_scheduled_at    timestamptz,
  p_ordered_by      uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prescription record;
  v_slot_id      uuid;
BEGIN
  SELECT * INTO v_prescription
  FROM public.drug_prescriptions
  WHERE id = p_prescription_id
    AND hospital_id = p_hospital_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prescription not found: %', p_prescription_id;
  END IF;

  IF v_prescription.prescription_type != 'prn' THEN
    RAISE EXCEPTION 'Not a PRN prescription';
  END IF;

  IF v_prescription.status_code = 'cancelled' THEN
    RAISE EXCEPTION 'Prescription is cancelled';
  END IF;

  INSERT INTO public.drug_administration_slots (
    prescription_id, hospital_id,
    hospitalization_id, patient_id,
    scheduled_at, status, dispense_status
  ) VALUES (
    p_prescription_id, p_hospital_id,
    v_prescription.hospitalization_id,
    v_prescription.patient_id,
    p_scheduled_at, 'pending',
    CASE WHEN v_prescription.is_patient_own_drug
      THEN 'ready_for_execution' ELSE 'preliminary' END
  )
  RETURNING id INTO v_slot_id;

  RETURN v_slot_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'order_prn_drug failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 8. submit_prescriptions: own-drug slots ready immediately
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_prescriptions(
  p_hospitalization_id  uuid,
  p_hospital_id         uuid,
  p_staff_role_id       uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id     uuid;
  v_prescription  record;
  v_slot          jsonb;
  v_slot_time     text;
  v_slot_dose     text;
  v_slot_at       timestamp;
  v_day           integer;
  v_count         integer := 0;
  v_target_status text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  FOR v_prescription IN
    SELECT id, drug_formulary_id, is_patient_own_drug,
      schedule_times, duration_days,
      start_date, patient_id,
      hospitalization_id
    FROM public.drug_prescriptions
    WHERE hospitalization_id = p_hospitalization_id
      AND hospital_id = p_hospital_id
      AND is_drafted = true
  LOOP
    v_target_status := CASE
      WHEN v_prescription.is_patient_own_drug THEN 'ready_for_execution'
      ELSE 'preliminary'
    END;

    UPDATE public.drug_prescriptions
    SET
      is_drafted        = false,
      status_code       = v_target_status,
      status_changed_at = now(),
      status_changed_by = v_caller_id
    WHERE id = v_prescription.id;

    IF v_prescription.schedule_times IS NOT NULL
      AND jsonb_array_length(v_prescription.schedule_times) > 0
      AND v_prescription.duration_days IS NOT NULL
      AND v_prescription.duration_days > 0
    THEN
      FOR v_day IN 0..(v_prescription.duration_days - 1)
      LOOP
        FOR v_slot IN SELECT * FROM jsonb_array_elements(v_prescription.schedule_times)
        LOOP
          v_slot_time := v_slot->>'time';
          v_slot_dose := v_slot->>'dose';
          v_slot_at := (v_prescription.start_date + v_day) + v_slot_time::interval;

          INSERT INTO public.drug_administration_slots(
            prescription_id, hospital_id,
            hospitalization_id, patient_id,
            scheduled_at, status, override_dose,
            dispense_status)
          VALUES (
            v_prescription.id, p_hospital_id,
            p_hospitalization_id, v_prescription.patient_id,
            v_slot_at, 'pending', NULLIF(v_slot_dose, ''),
            CASE WHEN v_prescription.is_patient_own_drug
              THEN 'ready_for_execution' ELSE 'preliminary' END
          );
        END LOOP;
      END LOOP;
    END IF;

    IF v_prescription.drug_formulary_id IS NOT NULL THEN
      INSERT INTO public.physician_favorites
        (physician_id, drug_formulary_id, use_count, last_used_at)
      VALUES
        (v_caller_id, v_prescription.drug_formulary_id, 1, now())
      ON CONFLICT (physician_id, drug_formulary_id)
      DO UPDATE SET
        use_count    = physician_favorites.use_count + 1,
        last_used_at = now();
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('submitted_count', v_count, 'success', true);

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'submit_prescriptions failed: %', SQLERRM;
END;
$$;
