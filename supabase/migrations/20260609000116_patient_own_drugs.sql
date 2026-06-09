-- Migration 116: Support patient's own drugs in prescriptions
-- Adds custom drug fields to drug_prescriptions
-- Makes drug_formulary_id nullable
-- Updates administer_drug RPC to skip inventory for own drugs
-- Updates submit_prescriptions to support own drugs

-- ============================================================
-- 1. Add custom drug fields to drug_prescriptions
-- ============================================================

-- Make drug_formulary_id nullable
ALTER TABLE public.drug_prescriptions
  ALTER COLUMN drug_formulary_id DROP NOT NULL;

-- Add custom drug fields (used when drug_formulary_id IS NULL)
ALTER TABLE public.drug_prescriptions
  ADD COLUMN IF NOT EXISTS is_patient_own_drug boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_drug_name    text,
  ADD COLUMN IF NOT EXISTS custom_inn          text,
  ADD COLUMN IF NOT EXISTS custom_dose_unit_id uuid
    REFERENCES public.units_of_measurement(id) ON DELETE SET NULL;

-- Enforce: either drug_formulary_id or custom_drug_name must be set
ALTER TABLE public.drug_prescriptions
  ADD CONSTRAINT drug_prescriptions_drug_source_check CHECK (
    (drug_formulary_id IS NOT NULL AND is_patient_own_drug = false)
    OR
    (drug_formulary_id IS NULL AND is_patient_own_drug = true AND custom_drug_name IS NOT NULL)
  );

CREATE INDEX drug_prescriptions_own_drug_idx
  ON public.drug_prescriptions(hospitalization_id)
  WHERE is_patient_own_drug = true;

-- ============================================================
-- 2. Update administer_drug RPC to skip inventory for own drugs
-- ============================================================

DROP FUNCTION IF EXISTS public.administer_drug(uuid, uuid, uuid, text);

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

  -- Get prescription
  SELECT dp.*, df.min_write_off_qty, df.unit_id
  INTO v_prescription
  FROM public.drug_prescriptions dp
  LEFT JOIN public.drug_formulary df ON df.id = dp.drug_formulary_id
  WHERE dp.id = v_slot.prescription_id
    AND dp.hospital_id = p_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prescription not found for slot %', p_slot_id;
  END IF;

  -- Mark slot as done
  UPDATE public.drug_administration_slots
  SET status          = 'done',
      administered_at = now(),
      administered_by = p_administered_by,
      dose_given      = COALESCE(p_dose_given, dose_given)
  WHERE id = p_slot_id;

  -- Patient's own drug: skip inventory deduction entirely
  IF v_prescription.is_patient_own_drug THEN
    RETURN;
  END IF;

  -- Regular drug: require dept batch
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

  -- Add to hospitalization invoice
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
-- 3. Update submit_prescriptions to support own drugs
--    Own drugs go directly to ready_for_execution
--    (skip preliminary → in_progress → dispense chain)
-- ============================================================

DROP FUNCTION IF EXISTS public.submit_prescriptions(uuid, uuid, uuid);

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
    -- Own drugs go directly to ready_for_execution
    -- Regular drugs go to preliminary (await pharmacist)
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

    -- Generate administration slots
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
            scheduled_at, status, override_dose)
          VALUES (
            v_prescription.id, p_hospital_id,
            p_hospitalization_id, v_prescription.patient_id,
            v_slot_at, 'pending', NULLIF(v_slot_dose, '')
          );
        END LOOP;
      END LOOP;
    END IF;

    -- Track favorites for formulary drugs only
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

