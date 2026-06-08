-- Migration 113: Fix architectural gaps
-- 1. invoice_items.visit_service_id: make nullable for drug billing
-- 2. hospitalizations: add primary_staff_role_id, backfill
-- 3. perform_writeoff: update to support drug_formulary_id batches

-- ============================================================
-- 1. Make invoice_items.visit_service_id nullable
--    Drug administration and write-offs have no visit_service
-- ============================================================

ALTER TABLE public.invoice_items
  ALTER COLUMN visit_service_id DROP NOT NULL;


-- ============================================================
-- 1b. Fix write_off_record_items constraints
--     product_id was NOT NULL but drugs use drug_formulary_id
-- ============================================================

ALTER TABLE public.write_off_record_items
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.write_off_record_items
  ADD COLUMN IF NOT EXISTS drug_formulary_id uuid
    REFERENCES public.drug_formulary(id) ON DELETE RESTRICT;

-- Fix quantity constraints to allow 0 packages
ALTER TABLE public.write_off_record_items
  DROP CONSTRAINT IF EXISTS write_off_record_items_quantity_packages_check;

ALTER TABLE public.write_off_record_items
  ADD CONSTRAINT write_off_record_items_quantity_packages_check
    CHECK (quantity_packages >= 0);

-- ============================================================
-- 2. Add primary_staff_role_id to hospitalizations
--    Backfill from primary_physician_id via physicians.staff_role_id
-- ============================================================

ALTER TABLE public.hospitalizations
  ADD COLUMN IF NOT EXISTS primary_staff_role_id uuid
    REFERENCES public.staff_roles(id) ON DELETE SET NULL;

UPDATE public.hospitalizations h
SET primary_staff_role_id = ph.staff_role_id
FROM public.physicians ph
WHERE ph.id = h.primary_physician_id
  AND ph.staff_role_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS hospitalizations_staff_role_idx
  ON public.hospitalizations(primary_staff_role_id);

-- ============================================================
-- 3. Update perform_writeoff RPC to support drug_formulary_id
--    Items JSON now accepts: batch_id, product_id (nullable),
--    drug_formulary_id (nullable), quantity_packages, quantity_units
-- ============================================================

CREATE OR REPLACE FUNCTION public.perform_writeoff(
  p_hospital_id       uuid,
  p_warehouse_id      uuid,
  p_write_off_type_id uuid,
  p_employee_id       uuid,
  p_supplier_id       uuid,
  p_notes             text,
  p_written_off_by    uuid,
  p_items             jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record_id    uuid;
  v_item         jsonb;
  v_batch        record;
  v_qty_pkg      numeric;
  v_qty_units    numeric;
  v_remaining_p  numeric;
  v_remaining_u  numeric;
  v_fifo_batch   record;
BEGIN
  -- Create write-off record
  INSERT INTO public.write_off_records (
    hospital_id, warehouse_id, write_off_type_id,
    employee_id, supplier_id, notes, written_off_by
  ) VALUES (
    p_hospital_id, p_warehouse_id, p_write_off_type_id,
    p_employee_id, p_supplier_id, p_notes, p_written_off_by
  )
  RETURNING id INTO v_record_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty_pkg   := COALESCE((v_item->>'quantity_packages')::numeric, 0);
    v_qty_units := COALESCE((v_item->>'quantity_units')::numeric, 0);

    -- If batch_id provided, use that batch directly
    IF (v_item->>'batch_id') IS NOT NULL THEN
      SELECT * INTO v_batch
      FROM public.inventory_batches
      WHERE id = (v_item->>'batch_id')::uuid
        AND warehouse_id = p_warehouse_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch not found: %', v_item->>'batch_id';
      END IF;

      UPDATE public.inventory_batches
      SET quantity_packages = quantity_packages - v_qty_pkg,
          quantity_units    = quantity_units    - v_qty_units
      WHERE id = v_batch.id;

      IF (SELECT COALESCE(quantity_units, 0) FROM public.inventory_batches WHERE id = v_batch.id) < 0 THEN
        RAISE EXCEPTION 'Insufficient stock in batch %', v_batch.id;
      END IF;

      INSERT INTO public.write_off_record_items (
        write_off_record_id, hospital_id, inventory_batch_id,
        product_id, drug_formulary_id,
        quantity_packages, quantity_units
      ) VALUES (
        v_record_id, p_hospital_id, v_batch.id,
        v_batch.product_id, v_batch.drug_formulary_id,
        v_qty_pkg, v_qty_units
      );

      INSERT INTO public.inventory_transactions (
        hospital_id, warehouse_id, inventory_batch_id,
        product_id, drug_formulary_id,
        source_type, quantity_packages, quantity_units,
        reference_id, performed_by, performed_at
      ) VALUES (
        p_hospital_id, p_warehouse_id, v_batch.id,
        v_batch.product_id, v_batch.drug_formulary_id,
        'writeoff', -v_qty_pkg, -v_qty_units,
        v_record_id, p_written_off_by, now()
      );

    -- Otherwise FIFO by product_id or drug_formulary_id
    ELSE
      v_remaining_p := v_qty_pkg;
      v_remaining_u := v_qty_units;

      FOR v_fifo_batch IN
        SELECT * FROM public.inventory_batches
        WHERE warehouse_id = p_warehouse_id
          AND hospital_id  = p_hospital_id
          AND (
            ((v_item->>'product_id') IS NOT NULL AND product_id = (v_item->>'product_id')::uuid)
            OR
            ((v_item->>'drug_formulary_id') IS NOT NULL AND drug_formulary_id = (v_item->>'drug_formulary_id')::uuid)
          )
          AND COALESCE(quantity_units, 0) > 0
        ORDER BY COALESCE(expiry_date, '9999-12-31') ASC, received_at ASC
        FOR UPDATE
      LOOP
        EXIT WHEN v_remaining_u <= 0 AND v_remaining_p <= 0;

        DECLARE
          v_use_u numeric := LEAST(v_remaining_u, COALESCE(v_fifo_batch.quantity_units, 0));
          v_use_p numeric := LEAST(v_remaining_p, COALESCE(v_fifo_batch.quantity_packages, 0));
        BEGIN
          UPDATE public.inventory_batches
          SET quantity_packages = quantity_packages - v_use_p,
              quantity_units    = quantity_units    - v_use_u
          WHERE id = v_fifo_batch.id;

          INSERT INTO public.write_off_record_items (
            write_off_record_id, hospital_id, inventory_batch_id,
            product_id, drug_formulary_id,
            quantity_packages, quantity_units
          ) VALUES (
            v_record_id, p_hospital_id, v_fifo_batch.id,
            v_fifo_batch.product_id, v_fifo_batch.drug_formulary_id,
            v_use_p, v_use_u
          );

          INSERT INTO public.inventory_transactions (
            hospital_id, warehouse_id, inventory_batch_id,
            product_id, drug_formulary_id,
            source_type, quantity_packages, quantity_units,
            reference_id, performed_by, performed_at
          ) VALUES (
            p_hospital_id, p_warehouse_id, v_fifo_batch.id,
            v_fifo_batch.product_id, v_fifo_batch.drug_formulary_id,
            'writeoff', -v_use_p, -v_use_u,
            v_record_id, p_written_off_by, now()
          );

          v_remaining_p := v_remaining_p - v_use_p;
          v_remaining_u := v_remaining_u - v_use_u;
        END;
      END LOOP;

      IF v_remaining_u > 0 THEN
        RAISE EXCEPTION 'Insufficient stock for writeoff';
      END IF;
    END IF;
  END LOOP;

  RETURN v_record_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'perform_writeoff failed: %', SQLERRM;
END;
$$;

