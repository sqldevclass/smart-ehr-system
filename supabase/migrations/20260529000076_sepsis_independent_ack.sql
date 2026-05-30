-- Migration 076: Independent acknowledgment for clinical alerts
-- Nurse and physician acknowledge independently
-- is_active = false only when both have acknowledged

ALTER TABLE public.clinical_alerts
  -- Nurse acknowledgment
  ADD COLUMN IF NOT EXISTS nurse_acknowledged_at
    timestamptz,
  ADD COLUMN IF NOT EXISTS nurse_acknowledged_by
    uuid REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  -- Physician acknowledgment
  ADD COLUMN IF NOT EXISTS physician_acknowledged_at
    timestamptz,
  ADD COLUMN IF NOT EXISTS physician_acknowledged_by
    uuid REFERENCES public.profiles(id)
    ON DELETE SET NULL;

-- Migrate existing acknowledgments to physician column
-- (previous design treated all as single ack)
UPDATE public.clinical_alerts
SET
  physician_acknowledged_at = acknowledged_at,
  physician_acknowledged_by = acknowledged_by
WHERE acknowledged_at IS NOT NULL;

-- Drop old single acknowledgment columns
ALTER TABLE public.clinical_alerts
  DROP COLUMN IF EXISTS acknowledged_at,
  DROP COLUMN IF EXISTS acknowledged_by;

-- Update acknowledge RPC
-- Now takes role parameter to determine which
-- column to update
-- is_active set to false only when BOTH
-- nurse and physician have acknowledged
CREATE OR REPLACE FUNCTION public.acknowledge_clinical_alert(
  p_alert_id  uuid,
  p_role      text  -- 'nurse' or 'physician'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   uuid;
  v_hospital_id uuid;
  v_alert       record;
  v_now         timestamptz := now();
BEGIN
  v_caller_id   := auth.uid();
  v_hospital_id := public.get_my_hospital_id();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_role NOT IN ('nurse', 'physician') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  SELECT * INTO v_alert
  FROM public.clinical_alerts
  WHERE id = p_alert_id
    AND hospital_id = v_hospital_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Alert not found or already fully acknowledged';
  END IF;

  IF p_role = 'nurse' THEN
    UPDATE public.clinical_alerts
    SET
      nurse_acknowledged_at = v_now,
      nurse_acknowledged_by = v_caller_id,
      -- Deactivate only if physician also acknowledged
      is_active = CASE
        WHEN physician_acknowledged_at IS NOT NULL
          THEN false
        ELSE true
      END
    WHERE id = p_alert_id;
  ELSE
    UPDATE public.clinical_alerts
    SET
      physician_acknowledged_at = v_now,
      physician_acknowledged_by = v_caller_id,
      -- Deactivate only if nurse also acknowledged
      is_active = CASE
        WHEN nurse_acknowledged_at IS NOT NULL
          THEN false
        ELSE true
      END
    WHERE id = p_alert_id;
  END IF;

  RETURN jsonb_build_object(
    'success',        true,
    'role',           p_role,
    'acknowledged_at', v_now
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION
      'acknowledge_clinical_alert failed: %',
      SQLERRM;
END;
$$;
