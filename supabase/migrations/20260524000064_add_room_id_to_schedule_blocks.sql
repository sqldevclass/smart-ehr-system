-- Migration 064: Add room_id to physician_schedule_blocks
-- Allows blocking time for office rooms as well as physicians
-- Mirrors the pattern used in physician_schedules and schedule_slots

ALTER TABLE public.physician_schedule_blocks
  ALTER COLUMN physician_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS room_id uuid
    REFERENCES public.rooms(id) ON DELETE CASCADE;

ALTER TABLE public.physician_schedule_blocks
  ADD CONSTRAINT block_has_physician_or_room CHECK (
    (physician_id IS NOT NULL AND room_id IS NULL)
    OR (physician_id IS NULL AND room_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS schedule_blocks_room_idx
  ON public.physician_schedule_blocks(room_id);