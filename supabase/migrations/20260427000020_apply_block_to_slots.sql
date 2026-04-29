-- Migration 020: apply_block_to_existing_slots function
-- Called after creating a schedule block to remove already-generated slots
-- that fall within the block period

CREATE OR REPLACE FUNCTION public.apply_block_to_existing_slots(
  p_physician_id uuid,
  p_hospital_id  uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted1 int;
  v_deleted2 int;
BEGIN
  -- Delete unbooked slots within one-time blocks
  DELETE FROM public.schedule_slots ss
  WHERE ss.physician_id  = p_physician_id
    AND ss.hospital_id   = p_hospital_id
    AND ss.booking_count = 0
    AND EXISTS (
      SELECT 1 FROM public.physician_schedule_blocks b
      WHERE b.physician_id = p_physician_id
        AND b.is_recurring = false
        AND b.blocked_from <= ss.slot_datetime
        AND b.blocked_to   >  ss.slot_datetime
    );

  GET DIAGNOSTICS v_deleted1 = ROW_COUNT;

  -- Delete unbooked slots within recurring blocks
  DELETE FROM public.schedule_slots ss
  WHERE ss.physician_id  = p_physician_id
    AND ss.hospital_id   = p_hospital_id
    AND ss.booking_count = 0
    AND EXISTS (
      SELECT 1 FROM public.physician_schedule_blocks b
      WHERE b.physician_id    = p_physician_id
        AND b.is_recurring    = true
        AND EXTRACT(DOW FROM ss.slot_datetime)::int = ANY(b.recur_days)
        AND b.recur_time_from <= ss.slot_datetime::time
        AND b.recur_time_to   >  ss.slot_datetime::time
        AND (b.blocked_from IS NULL OR b.blocked_from::date <= ss.slot_datetime::date)
        AND (b.blocked_to   IS NULL OR b.blocked_to::date   >= ss.slot_datetime::date)
    );

  GET DIAGNOSTICS v_deleted2 = ROW_COUNT;

  RETURN v_deleted1 + v_deleted2;
END;
$$;