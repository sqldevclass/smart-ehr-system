-- Migration 109: Make product_id nullable on inventory_batches
-- Required for pharmacy batches that use drug_formulary_id instead

ALTER TABLE public.inventory_batches
  ALTER COLUMN product_id DROP NOT NULL;

-- Same for inventory_transactions
ALTER TABLE public.inventory_transactions
  ALTER COLUMN product_id DROP NOT NULL;
