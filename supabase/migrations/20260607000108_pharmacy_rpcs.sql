-- Migration 108: Pharmacy inventory RPCs
-- dispense_prescription: nurse accepts in_progress prescription
--   FIFO batch from pharmacy warehouse → dept warehouse
-- administer_drug: nurse clicks Выполнить
--   deduct from dept warehouse, log consumable, add to invoice
-- writeoff_to_patient: nurse writes off dept stock to patient
--   deduct from dept warehouse unlinked stock, add to invoice

-- ============================================================
-- 1. dispense_prescription
-- Called when nurse accepts a prescription from Tab 1
-- FIFO selects batch from pharmacy warehouse by drug_formulary_id
-- Deducts from pharmacy, creates dept batch, updates prescription
-- ============================================================

CREATE OR REPLACE FUNCTION public.dispense_prescription(
  p_prescription_id uuid,
  p_hospital_id     uuid,
  p_accepted_by     uuid
)
RETURNS uuid  -- returns new dept_batch_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prescription    record;
  v_pharmacy_wh     uuid;
  v_dept_wh         uuid;
  v_batch           record;
  v_qty_units       numeric;
  v_new_batch_id    uuid;
BEGIN
  -- Lock and validate prescription
  SELECT dp.*, df.unit_id, df.min_write_off_qty
  INTO v_prescription
  FROM public.drug_prescriptions dp
  JOIN public.drug_formulary df ON df.id = dp.drug_formulary_id
  WHERE dp.id = p_prescription_id
    AND dp.hospital_id = p_hospital_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prescription not found: %', p_prescription_id;
  END IF;

  IF v_prescription.status_code != 'in_progress' THEN
    RAISE EXCEPTION 'Prescription is not in_progress. Current status: %',
      v_prescription.status_code;
  END IF;

  IF v_prescription.dept_batch_id IS NOT NULL THEN
    RAISE EXCEPTION 'Prescription already dispensed';
  END IF;

  -- Determine quantity to dispense
  -- Use min_write_off_qty as the dispensing unit quantity
  -- Default to 1 if not set
  v_qty_units := COALESCE(v_prescription.min_write_off_qty, 1);

  -- Find pharmacy warehouse for this hospital
  SELECT w.id INTO v_pharmacy_wh
  FROM public.warehouses w
  JOIN public.warehouse_types wt ON wt.id = w.warehouse_type_id
  WHERE w.hospital_id = p_hospital_id
    AND wt.code = 'central_pharmacy'
  LIMIT 1;

  IF v_pharmacy_wh IS NULL THEN
    RAISE EXCEPTION 'No pharmacy warehouse found for hospital %', p_hospital_id;
  END IF;

  -- Find department warehouse for this patient's hospitalization
  SELECT w.id INTO v_dept_wh
  FROM public.hospitalizations h
  JOIN public.departments d ON d.id = h.department_id
  JOIN public.warehouses w ON w.department_id = d.id
  JOIN public.warehouse_types wt ON wt.id = w.warehouse_type_id
  WHERE h.id = v_prescription.hospitalization_id
    AND w.hospital_id = p_hospital_id
    AND wt.code = 'department'
  LIMIT 1;

  IF v_dept_wh IS NULL THEN
    RAISE EXCEPTION 'No department warehouse found for hospitalization %',
      v_prescription.hospitalization_id;
  END IF;

  -- FIFO: select earliest expiry batch from pharmacy warehouse
  SELECT * INTO v_batch
  FROM public.inventory_batches
  WHERE warehouse_id     = v_pharmacy_wh
    AND drug_formulary_id = v_prescription.drug_formulary_id
    AND hospital_id      = p_hospital_id
    AND COALESCE(quantity_units, 0) >= v_qty_units
  ORDER BY COALESCE(expiry_date, '9999-12-31') ASC, received_at ASC
  FOR UPDATE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient stock for drug % in pharmacy warehouse',
      v_prescription.drug_formulary_id;
  END IF;

  -- Deduct from pharmacy batch
  UPDATE public.inventory_batches
  SET quantity_units = quantity_units - v_qty_units
  WHERE id = v_batch.id;

  -- Verify no negative stock
  IF (SELECT quantity_units FROM public.inventory_batches WHERE id = v_batch.id) < 0 THEN
    RAISE EXCEPTION 'Insufficient stock in batch %', v_batch.id;
  END IF;

  -- Record outgoing transaction at pharmacy
  INSERT INTO public.inventory_transactions (
    hospital_id, warehouse_id, inventory_batch_id,
    drug_formulary_id, product_id,
    source_type, quantity_packages, quantity_units,
    reference_id, performed_by, performed_at
  ) VALUES (
    p_hospital_id, v_pharmacy_wh, v_batch.id,
    v_prescription.drug_formulary_id, NULL,
    'transfer_out', 0, -v_qty_units,
    p_prescription_id, p_accepted_by, now()
  );

  -- Create new batch at dept warehouse
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

  -- Record incoming transaction at dept warehouse
  INSERT INTO public.inventory_transactions (
    hospital_id, warehouse_id, inventory_batch_id,
    drug_formulary_id, product_id,
    source_type, quantity_packages, quantity_units,
    reference_id, performed_by, performed_at
  ) VALUES (
    p_hospital_id, v_dept_wh, v_new_batch_id,
    v_prescription.drug_formulary_id, NULL,
    'transfer_in', 0, v_qty_units,
    p_prescription_id, p_accepted_by, now()
  );

  -- Link dept batch to prescription and update status
  UPDATE public.drug_prescriptions
  SET dept_batch_id = v_new_batch_id,
      status_code   = 'ready_for_execution',
      status_changed_at = now(),
      status_changed_by = p_accepted_by
  WHERE id = p_prescription_id;

  RETURN v_new_batch_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'dispense_prescription failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 2. administer_drug
-- Called when nurse clicks Выполнить in Лист назначения
-- Deducts from dept warehouse batch (from prescription.dept_batch_id)
-- Logs consumable transaction
-- Adds to patient invoice
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
  -- Lock and validate slot
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

  -- Get prescription and dept batch
  SELECT dp.*, df.min_write_off_qty, df.unit_id
  INTO v_prescription
  FROM public.drug_prescriptions dp
  JOIN public.drug_formulary df ON df.id = dp.drug_formulary_id
  WHERE dp.id = v_slot.prescription_id
    AND dp.hospital_id = p_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prescription not found for slot %', p_slot_id;
  END IF;

  IF v_prescription.dept_batch_id IS NULL THEN
    RAISE EXCEPTION 'Prescription has not been dispensed to department yet';
  END IF;

  v_qty_units := COALESCE(v_prescription.min_write_off_qty, 1);

  -- Lock dept batch
  SELECT * INTO v_batch
  FROM public.inventory_batches
  WHERE id = v_prescription.dept_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Department batch not found: %', v_prescription.dept_batch_id;
  END IF;

  IF COALESCE(v_batch.quantity_units, 0) < v_qty_units THEN
    RAISE EXCEPTION 'Insufficient stock in department warehouse for this drug';
  END IF;

  -- Deduct from dept batch
  UPDATE public.inventory_batches
  SET quantity_units = quantity_units - v_qty_units
  WHERE id = v_prescription.dept_batch_id;

  -- Log consumable transaction
  INSERT INTO public.inventory_transactions (
    hospital_id, warehouse_id, inventory_batch_id,
    drug_formulary_id, product_id,
    source_type, quantity_packages, quantity_units,
    reference_id, performed_by, performed_at
  ) VALUES (
    p_hospital_id, v_batch.warehouse_id, v_prescription.dept_batch_id,
    v_prescription.drug_formulary_id, NULL,
    'consumable', 0, -v_qty_units,
    p_slot_id, p_administered_by, now()
  );

  -- Mark slot as done
  UPDATE public.drug_administration_slots
  SET status         = 'done',
      administered_at = now(),
      administered_by = p_administered_by,
      dose_given      = COALESCE(p_dose_given, dose_given)
  WHERE id = p_slot_id;

  -- Add to hospitalization invoice
  -- Price = batch selling_price * qty_units
  v_price := COALESCE(v_batch.selling_price, 0) * v_qty_units;

  IF v_price > 0 THEN
    SELECT id INTO v_invoice_id
    FROM public.invoices
    WHERE hospitalization_id = v_slot.hospitalization_id
      AND hospital_id = p_hospital_id
      AND status = 'active'
    LIMIT 1;

    IF v_invoice_id IS NOT NULL THEN
      -- Add invoice item for this administration
      INSERT INTO public.invoice_items (
        invoice_id, visit_service_id, amount
      ) VALUES (
        v_invoice_id, NULL, v_price
      );

      -- Update invoice total
      UPDATE public.visits
      SET total_amount = total_amount + v_price
      WHERE id = (
        SELECT visit_id FROM public.invoices WHERE id = v_invoice_id
      );
    END IF;
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'administer_drug failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 3. writeoff_to_patient
-- Called from patient detail Списание button
-- Nurse picks from unlinked dept warehouse stock
-- Deducts from dept warehouse, links to patient invoice
-- ============================================================

CREATE OR REPLACE FUNCTION public.writeoff_to_patient(
  p_batch_id            uuid,
  p_quantity_units      numeric,
  p_hospitalization_id  uuid,
  p_hospital_id         uuid,
  p_written_off_by      uuid,
  p_notes               text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch      record;
  v_invoice_id uuid;
  v_price      numeric;
BEGIN
  -- Lock and validate batch
  SELECT * INTO v_batch
  FROM public.inventory_batches
  WHERE id = p_batch_id
    AND hospital_id = p_hospital_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found: %', p_batch_id;
  END IF;

  IF COALESCE(v_batch.quantity_units, 0) < p_quantity_units THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %',
      v_batch.quantity_units, p_quantity_units;
  END IF;

  -- Deduct from dept batch
  UPDATE public.inventory_batches
  SET quantity_units = quantity_units - p_quantity_units
  WHERE id = p_batch_id;

  -- Log consumable transaction
  INSERT INTO public.inventory_transactions (
    hospital_id, warehouse_id, inventory_batch_id,
    drug_formulary_id, product_id,
    source_type, quantity_packages, quantity_units,
    reference_id, performed_by, performed_at
  ) VALUES (
    p_hospital_id, v_batch.warehouse_id, p_batch_id,
    v_batch.drug_formulary_id, v_batch.product_id,
    'consumable', 0, -p_quantity_units,
    p_hospitalization_id, p_written_off_by, now()
  );

  -- Add to hospitalization invoice
  v_price := COALESCE(v_batch.selling_price, 0) * p_quantity_units;

  IF v_price > 0 THEN
    SELECT id INTO v_invoice_id
    FROM public.invoices
    WHERE hospitalization_id = p_hospitalization_id
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
    RAISE EXCEPTION 'writeoff_to_patient failed: %', SQLERRM;
END;
$$;

