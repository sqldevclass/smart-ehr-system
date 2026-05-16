-- Migration 034: delete_physician_order RPC
-- Permanently deletes a physician order that has not been invoiced
-- Only works if no invoice_item exists for this service

CREATE OR REPLACE FUNCTION public.delete_physician_order(
  p_visit_service_id uuid,
  p_hospital_id      uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vs record;
BEGIN
  SELECT id, visit_id, cost_at_time, source
  INTO v_vs
  FROM public.visit_services
  WHERE id = p_visit_service_id
    AND hospital_id = p_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit service not found: %', p_visit_service_id;
  END IF;

  IF v_vs.source != 'physician' THEN
    RAISE EXCEPTION 'Only physician orders can be deleted this way';
  END IF;

  -- Ensure not invoiced
  IF EXISTS (
    SELECT 1 FROM public.invoice_items
    WHERE visit_service_id = p_visit_service_id
  ) THEN
    RAISE EXCEPTION 'Cannot delete an invoiced service';
  END IF;

  -- If attached to a visit, update visit total and clean up
  IF v_vs.visit_id IS NOT NULL THEN
    UPDATE public.visits
    SET total_amount = GREATEST(0, total_amount - v_vs.cost_at_time)
    WHERE id = v_vs.visit_id;

    -- Cancel visit if no services remain
    IF NOT EXISTS (
      SELECT 1 FROM public.visit_services
      WHERE visit_id = v_vs.visit_id
        AND id != p_visit_service_id
    ) THEN
      UPDATE public.visits SET status = 'cancelled'
      WHERE id = v_vs.visit_id;
    END IF;
  END IF;

  -- Also free the slot if booked
  IF EXISTS (
    SELECT 1 FROM public.visit_services
    WHERE id = p_visit_service_id AND slot_id IS NOT NULL
  ) THEN
    UPDATE public.schedule_slots
    SET booking_count = GREATEST(0, booking_count - 1)
    WHERE id = (
      SELECT slot_id FROM public.visit_services
      WHERE id = p_visit_service_id
    );
  END IF;

  -- Delete the visit_service
  DELETE FROM public.visit_services WHERE id = p_visit_service_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'delete_physician_order failed: %', SQLERRM;
END;
$$;