-- Migration 111: Fix transfer_record_items quantity constraints
-- quantity_packages check requires > 0 but we now default to 0 for drug transfers
-- quantity_units check requires > 0 which is correct

ALTER TABLE public.transfer_record_items
  DROP CONSTRAINT IF EXISTS transfer_record_items_quantity_packages_check;

ALTER TABLE public.transfer_record_items
  ADD CONSTRAINT transfer_record_items_quantity_packages_check
    CHECK (quantity_packages >= 0);

-- Also ensure quantity_units check allows the values we insert
ALTER TABLE public.transfer_record_items
  DROP CONSTRAINT IF EXISTS transfer_record_items_quantity_units_check;

ALTER TABLE public.transfer_record_items
  ADD CONSTRAINT transfer_record_items_quantity_units_check
    CHECK (quantity_units > 0);
