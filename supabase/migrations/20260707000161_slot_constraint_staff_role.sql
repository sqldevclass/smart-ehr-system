-- Migration 161: slot_has_physician_or_room predates the
-- physicians-to-staff_roles migration and only checks
-- physician_id/room_id. Update it to also accept staff_role_id,
-- the column schedule_slots actually uses today.
--
-- Using "at least one" rather than "exactly one" — migration 104's
-- backfill set staff_role_id alongside the existing physician_id
-- without clearing it, so historical rows commonly have BOTH set.
-- A stricter exactly-one rule fails against that existing data.

ALTER TABLE public.schedule_slots
  DROP CONSTRAINT IF EXISTS slot_has_physician_or_room;

ALTER TABLE public.schedule_slots
  ADD CONSTRAINT slot_has_physician_or_room CHECK (
    physician_id IS NOT NULL
    OR staff_role_id IS NOT NULL
    OR room_id IS NOT NULL
  );
