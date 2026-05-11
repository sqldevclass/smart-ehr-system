-- Migration 029: Office rooms do not require a department
-- department_id is now nullable on rooms
-- Regular rooms still require department (enforced at application level)
-- Office rooms (room_types.is_office_room = true) have no department

ALTER TABLE public.rooms
  ALTER COLUMN department_id DROP NOT NULL;