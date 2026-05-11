-- Trigger to enforce department required for non-office rooms
CREATE OR REPLACE FUNCTION public.validate_room_department()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_office_room boolean;
BEGIN
  -- Get is_office_room flag for this room's type
  SELECT is_office_room INTO v_is_office_room
  FROM public.room_types
  WHERE id = NEW.room_type_id;

  -- Non-office rooms must have a department
  IF NOT COALESCE(v_is_office_room, false) AND NEW.department_id IS NULL THEN
    RAISE EXCEPTION 'Department is required for non-office rooms';
  END IF;

  -- Office rooms must NOT have a department
  IF COALESCE(v_is_office_room, false) AND NEW.department_id IS NOT NULL THEN
    RAISE EXCEPTION 'Office rooms cannot be assigned to a department';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER rooms_validate_department
  BEFORE INSERT OR UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.validate_room_department();