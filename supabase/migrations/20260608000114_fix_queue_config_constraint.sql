-- Migration 114: Fix queue_configs unique constraint for assign_queue_number RPC
-- ON CONFLICT requires a real unique constraint, not a partial index.
-- Add proper unique constraints for both staff_role and room based configs.

-- Drop old partial indexes
DROP INDEX IF EXISTS queue_config_staff_role_date_unique;
DROP INDEX IF EXISTS queue_config_physician_date_unique;

-- Add proper unique constraints
-- For staff_role based queue (one per staff_role per day)
ALTER TABLE public.queue_configs
  DROP CONSTRAINT IF EXISTS queue_configs_staff_role_date_unique;

ALTER TABLE public.queue_configs
  ADD CONSTRAINT queue_configs_staff_role_date_unique
    UNIQUE (hospital_id, staff_role_id, queue_date);

-- For room based queue (one per room per day)
ALTER TABLE public.queue_configs
  DROP CONSTRAINT IF EXISTS queue_configs_room_date_unique;

ALTER TABLE public.queue_configs
  ADD CONSTRAINT queue_configs_room_date_unique
    UNIQUE (hospital_id, room_id, queue_date);
