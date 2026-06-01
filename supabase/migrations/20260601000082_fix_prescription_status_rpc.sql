-- Migration 082: Fix update_prescription_status RPC
-- profile_roles → user_roles, profile_id → user_id

CREATE OR REPLACE FUNCTION
  public.update_prescription_status(
  p_prescription_id uuid,
  p_new_status      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id     uuid;
  v_hospital_id   uuid;
  v_prescription  record;
  v_caller_roles  text[];
BEGIN
  v_caller_id   := auth.uid();
  v_hospital_id := public.get_my_hospital_id();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Get caller roles using correct table
  SELECT array_agg(r.code)
  INTO v_caller_roles
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_caller_id;

  -- Get prescription
  SELECT * INTO v_prescription
  FROM public.drug_prescriptions
  WHERE id = p_prescription_id
    AND hospital_id = v_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prescription not found';
  END IF;

  -- Role-based transition validation
  IF p_new_status = 'cancelled' THEN
    IF NOT ('physician' = ANY(v_caller_roles))
    THEN
      RAISE EXCEPTION
        'Only physicians can cancel';
    END IF;

  ELSIF p_new_status = 'in_progress' THEN
    IF NOT ('pharmacist' = ANY(v_caller_roles))
    THEN
      RAISE EXCEPTION
        'Only pharmacists can set in_progress';
    END IF;
    IF v_prescription.status_code !=
        'preliminary' THEN
      RAISE EXCEPTION
        'Must be preliminary first';
    END IF;

  ELSIF p_new_status = 'returned_accepted' THEN
    IF NOT ('pharmacist' = ANY(v_caller_roles))
    THEN
      RAISE EXCEPTION
        'Only pharmacists can accept returns';
    END IF;
    IF v_prescription.status_code != 'return'
    THEN
      RAISE EXCEPTION
        'Must be in return status first';
    END IF;

  ELSIF p_new_status = 'ready_for_execution'
  THEN
    IF NOT (
      'inpatient_nurse' = ANY(v_caller_roles)
      OR 'head_nurse' = ANY(v_caller_roles)
    ) THEN
      RAISE EXCEPTION
        'Only nurses can set ready_for_execution';
    END IF;
    IF v_prescription.status_code !=
        'in_progress' THEN
      RAISE EXCEPTION
        'Must be in_progress first';
    END IF;

  ELSIF p_new_status = 'completed' THEN
    IF NOT (
      'inpatient_nurse' = ANY(v_caller_roles)
      OR 'head_nurse' = ANY(v_caller_roles)
    ) THEN
      RAISE EXCEPTION
        'Only nurses can complete';
    END IF;
    IF v_prescription.status_code !=
        'ready_for_execution' THEN
      RAISE EXCEPTION
        'Must be ready_for_execution first';
    END IF;

  ELSIF p_new_status = 'return' THEN
    IF NOT (
      'inpatient_nurse' = ANY(v_caller_roles)
      OR 'head_nurse' = ANY(v_caller_roles)
    ) THEN
      RAISE EXCEPTION
        'Only nurses can initiate returns';
    END IF;
    IF v_prescription.status_code !=
        'ready_for_execution' THEN
      RAISE EXCEPTION
        'Must be ready_for_execution first';
    END IF;

  ELSE
    RAISE EXCEPTION
      'Invalid status: %', p_new_status;
  END IF;

  -- Apply status change
  UPDATE public.drug_prescriptions
  SET
    status_code       = p_new_status,
    status_changed_at = now(),
    status_changed_by = v_caller_id,
    cancelled_at = CASE
      WHEN p_new_status = 'cancelled'
        THEN now()
      ELSE cancelled_at
    END,
    cancelled_by = CASE
      WHEN p_new_status = 'cancelled'
        THEN v_caller_id
      ELSE cancelled_by
    END
  WHERE id = p_prescription_id;

  RETURN jsonb_build_object(
    'success',    true,
    'new_status', p_new_status,
    'changed_at', now()
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION
      'update_prescription_status failed: %',
      SQLERRM;
END;
$$;
