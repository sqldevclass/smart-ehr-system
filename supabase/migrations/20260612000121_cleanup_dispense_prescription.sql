-- Migration 121: Cleanup — drop dead dispense_prescription RPC
-- Superseded by dispense_slot (slot-level dispensing, migration 120).
-- Its only remaining caller (NurseDrugAcceptModal) has been removed.
-- No other RPC, trigger, or UI references it.

DROP FUNCTION IF EXISTS public.dispense_prescription(uuid, uuid, uuid);
