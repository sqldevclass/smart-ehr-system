-- Migration 086: Fix cancel_day_slots RPC
-- Root cause: RETURNING id INTO v_count fails
-- when UPDATE affects multiple rows.
-- Fix: remove RETURNING, use GET DIAGNOSTICS only.

CREATE OR REPLACE FUNCTION public.cancel_day_slots(
  p_prescription_id uuid,
  p_date            date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    uuid;
  v_hospital_id  uuid;
  v_caller_roles text[];
  v_count        integer;
BEGIN
  v_caller_id   := auth.uid();
  v_hospital_id := public.get_my_hospital_id();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT array_agg(r.code)
  INTO v_caller_roles
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_caller_id;

  IF NOT ('physician' = ANY(v_caller_roles)) THEN
    RAISE EXCEPTION
      'Only physicians can cancel day slots';
  END IF;

  UPDATE public.drug_administration_slots
  SET status = 'skipped'
  WHERE prescription_id = p_prescription_id
    AND hospital_id     = v_hospital_id
    AND status          = 'pending'
    AND scheduled_at::date = p_date;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success',         true,
    'slots_cancelled', v_count
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION
      'cancel_day_slots failed: %', SQLERRM;
END;
$$;
