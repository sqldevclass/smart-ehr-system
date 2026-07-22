-- Migration 159: queue_config_has_target never got updated when
-- migration 104 moved queue_configs from physician_id to
-- staff_role_id. It still only checks the two old columns, so
-- assign_queue_number's staff_role_id-based inserts (the normal
-- path since June) get rejected even though a valid target was
-- provided.

ALTER TABLE public.queue_configs
  DROP CONSTRAINT IF EXISTS queue_config_has_target;

ALTER TABLE public.queue_configs
  ADD CONSTRAINT queue_config_has_target
  CHECK (
    physician_id IS NOT NULL
    OR room_id IS NOT NULL
    OR staff_role_id IS NOT NULL
  );
