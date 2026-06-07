-- Migration 112: Fix accept_transfer RPC to handle drug_formulary_id
-- The original RPC was written before drug_formulary_id was added to
-- inventory_batches. It now needs to copy drug_formulary_id from the
-- source batch and pass it to inventory_transactions as well.

CREATE OR REPLACE FUNCTION public.accept_transfer(
  p_transfer_record_id uuid,
  p_hospital_id        uuid,
  p_accepted_by        uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer  record;
  v_item      record;
  v_src_batch record;
  v_new_batch uuid;
BEGIN
  -- Lock and validate transfer record
  SELECT * INTO v_transfer
  FROM public.transfer_records
  WHERE id = p_transfer_record_id
    AND hospital_id = p_hospital_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer record not found: %', p_transfer_record_id;
  END IF;

  IF v_transfer.status != 'pending_acceptance' THEN
    RAISE EXCEPTION 'Transfer is not pending acceptance. Current status: %',
      v_transfer.status;
  END IF;

  -- Process each line item
  FOR v_item IN
    SELECT * FROM public.transfer_record_items
    WHERE transfer_record_id = p_transfer_record_id
  LOOP
    -- Get source batch details (includes drug_formulary_id)
    SELECT * INTO v_src_batch
    FROM public.inventory_batches
    WHERE id = v_item.inventory_batch_id
    FOR UPDATE;

    -- Deduct from source batch
    UPDATE public.inventory_batches
    SET
      quantity_packages = quantity_packages - v_item.quantity_packages,
      quantity_units    = quantity_units    - v_item.quantity_units
    WHERE id = v_item.inventory_batch_id;

    -- Verify no negative stock
    IF (SELECT quantity_units FROM public.inventory_batches
        WHERE id = v_item.inventory_batch_id) < 0 THEN
      RAISE EXCEPTION 'Insufficient stock in batch % for product/drug %',
        v_item.inventory_batch_id,
        COALESCE(v_item.product_id::text, v_item.drug_formulary_id::text);
    END IF;

    -- Record outgoing transaction
    INSERT INTO public.inventory_transactions (
      hospital_id, warehouse_id, inventory_batch_id,
      product_id, drug_formulary_id,
      source_type, quantity_packages, quantity_units,
      reference_id, performed_by, performed_at
    ) VALUES (
      p_hospital_id,
      v_transfer.from_warehouse_id,
      v_item.inventory_batch_id,
      v_src_batch.product_id,
      v_src_batch.drug_formulary_id,
      'transfer_out',
      -v_item.quantity_packages,
      -v_item.quantity_units,
      p_transfer_record_id,
      p_accepted_by,
      now()
    );

    -- Create new batch at destination warehouse
    -- Copy drug_formulary_id OR product_id from source batch
    INSERT INTO public.inventory_batches (
      hospital_id, warehouse_id,
      product_id, drug_formulary_id,
      supplier_id, series_number, expiry_date,
      quantity_packages, quantity_units,
      purchase_price, markup_percent,
      received_by, received_at
    ) VALUES (
      p_hospital_id,
      v_transfer.to_warehouse_id,
      v_src_batch.product_id,
      v_src_batch.drug_formulary_id,
      v_src_batch.supplier_id,
      v_src_batch.series_number,
      v_src_batch.expiry_date,
      v_item.quantity_packages,
      v_item.quantity_units,
      v_src_batch.purchase_price,
      v_src_batch.markup_percent,
      p_accepted_by,
      now()
    )
    RETURNING id INTO v_new_batch;

    -- Record incoming transaction at destination
    INSERT INTO public.inventory_transactions (
      hospital_id, warehouse_id, inventory_batch_id,
      product_id, drug_formulary_id,
      source_type, quantity_packages, quantity_units,
      reference_id, performed_by, performed_at
    ) VALUES (
      p_hospital_id,
      v_transfer.to_warehouse_id,
      v_new_batch,
      v_src_batch.product_id,
      v_src_batch.drug_formulary_id,
      'transfer_in',
      v_item.quantity_packages,
      v_item.quantity_units,
      p_transfer_record_id,
      p_accepted_by,
      now()
    );
  END LOOP;

  -- Mark transfer as accepted
  UPDATE public.transfer_records
  SET
    status      = 'accepted',
    accepted_by = p_accepted_by,
    accepted_at = now()
  WHERE id = p_transfer_record_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'accept_transfer failed: %', SQLERRM;
END;
$$;
