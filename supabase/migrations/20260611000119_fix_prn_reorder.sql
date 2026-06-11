-- Migration 119: Fix PRN re-order flow
-- 1. order_prn_drug: clear dept_batch_id so next cycle works
-- 2. dispense_prescription: revert to only accept in_progress
--    (pharmacist sets in_progress, nurse accepts via NurseInventoryModal)

-- Fix order_prn_drug to clear dept_batch_id on re-order
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

  -- Allow ordering when preliminary or ready_for_execution (re-order after administration)
  IF v_prescription.status_code NOT IN ('preliminary', 'ready_for_execution') THEN
    RAISE EXCEPTION 'PRN prescription cannot be ordered in status: %',
      v_prescription.status_code;
  END IF;

  -- Create one administration slot
  INSERT INTO public.drug_administration_slots (
    prescription_id, hospital_id,
    hospitalization_id, patient_id,
    scheduled_at, status
  ) VALUES (
    p_prescription_id, p_hospital_id,
    v_prescription.hospitalization_id,
    v_prescription.patient_id,
    p_scheduled_at, 'pending'
  )
  RETURNING id INTO v_slot_id;

  -- Reset prescription for new cycle:
  -- Clear dept_batch_id so dispense_prescription accepts it again
  -- Set preliminary so pharmacist sees it
  UPDATE public.drug_prescriptions
  SET
    status_code       = 'preliminary',
    status_changed_at = now(),
    status_changed_by = p_ordered_by,
    dept_batch_id     = NULL
  WHERE id = p_prescription_id;

  RETURN v_slot_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'order_prn_drug failed: %', SQLERRM;
END;
$$;

-- Revert dispense_prescription to only accept in_progress
-- Pharmacist sets in_progress via update_prescription_status
-- Nurse then accepts via NurseInventoryModal which calls dispense_prescription
CREATE OR REPLACE FUNCTION public.dispense_prescription(
  p_prescription_id uuid,
  p_hospital_id     uuid,
  p_accepted_by     uuid
)
RETURNS uuid
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
  WHERE h.id = v_prescription.hospitalization_id
    AND w.hospital_id = p_hospital_id
    AND wt.code = 'department'
  LIMIT 1;

  IF v_dept_wh IS NULL THEN
    RAISE EXCEPTION 'No department warehouse found for hospitalization %',
      v_prescription.hospitalization_id;
  END IF;

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

  IF (SELECT quantity_units FROM public.inventory_batches WHERE id = v_batch.id) < 0 THEN
    RAISE EXCEPTION 'Insufficient stock in batch %', v_batch.id;
  END IF;

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
    p_prescription_id, p_accepted_by, now()
  );

  UPDATE public.drug_prescriptions
  SET dept_batch_id     = v_new_batch_id,
      status_code       = 'ready_for_execution',
      status_changed_at = now(),
      status_changed_by = p_accepted_by
  WHERE id = p_prescription_id;

  RETURN v_new_batch_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'dispense_prescription failed: %', SQLERRM;
END;
$$;
