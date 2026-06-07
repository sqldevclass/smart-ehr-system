-- Migration 110: Make product_id nullable on transfer_record_items
-- Required for pharmacy drug transfers that use drug_formulary_id

ALTER TABLE public.transfer_record_items
  ALTER COLUMN product_id DROP NOT NULL;
