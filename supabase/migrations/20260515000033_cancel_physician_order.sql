-- Migration 033: cancel_physician_order RPC
-- Cancels a physician-ordered service and resets it back to unassigned state
-- so registrar can reassign it

CREATE OR REPLACE FUNCTION public.cancel_physician_order(
  p_visit_service_id uuid,
  p_hospital_id      uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vs           record;
  v_cancelled    uuid;
BEGIN
  SELECT id INTO v_cancelled
  FROM public.service_statuses
  WHERE code = 'cancelled';

  SELECT id, visit_id, cost_at_time, source, status_id
  INTO v_vs
  FROM public.visit_services
  WHERE id = p_visit_service_id
    AND hospital_id = p_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visit service not found: %', p_visit_service_id;
  END IF;

  -- Only physician-sourced preliminary services can be cancelled this way
  IF v_vs.source != 'physician' THEN
    RAISE EXCEPTION 'Only physician orders can be cancelled this way';
  END IF;

  -- Remove invoice_item if exists
  DELETE FROM public.invoice_items
  WHERE visit_service_id = p_visit_service_id;

  -- Update visit total if service was in a visit
  IF v_vs.visit_id IS NOT NULL THEN
    UPDATE public.visits
    SET total_amount = GREATEST(0, total_amount - v_vs.cost_at_time)
    WHERE id = v_vs.visit_id;

    -- Cancel visit if no services remain
    IF NOT EXISTS (
      SELECT 1 FROM public.visit_services
      WHERE visit_id = v_vs.visit_id
        AND id != p_visit_service_id
        AND status_id != v_cancelled
    ) THEN
      UPDATE public.visits
      SET status = 'cancelled'
      WHERE id = v_vs.visit_id;
    END IF;
  END IF;

  -- Reset visit_service back to unassigned state
  UPDATE public.visit_services
  SET visit_id              = NULL,
      assigned_physician_id = NULL,
      slot_id               = NULL,
      scheduled_at          = NULL,
      queue_number          = NULL,
      is_waitlist           = false
  WHERE id = p_visit_service_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'cancel_physician_order failed: %', SQLERRM;
END;
$$;