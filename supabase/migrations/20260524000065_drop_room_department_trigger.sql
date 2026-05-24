-- Migration 065: Drop rooms_validate_department trigger
-- Rule 1 (non-office rooms need department) is already
-- enforced by department_id NOT NULL constraint on rooms table.
-- Rule 2 (office rooms cannot have department) is removed
-- as all rooms should have departments.

DROP TRIGGER IF EXISTS rooms_validate_department
  ON public.rooms;

DROP FUNCTION IF EXISTS public.validate_room_department();
