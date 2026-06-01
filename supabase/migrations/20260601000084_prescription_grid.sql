-- Migration 084: Prescription grid support
-- extend_prescription RPC: adds 1 day + generates slots
-- override_slot RPC: physician edits a specific slot's time/dose

-- ============================================================
-- 1. extend_prescription RPC
-- Adds 1 day to duration_days and generates
-- one more day of administration slots
-- ============================================================
CREATE OR REPLACE FUNCTION public.extend_prescription(
  p_prescription_id uuid
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
  v_new_day_start timestamptz;
  v_slot_time     text;
BEGIN
  v_caller_id   := auth.uid();
  v_hospital_id := public.get_my_hospital_id();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Get prescription
  SELECT * INTO v_prescription
  FROM public.drug_prescriptions
  WHERE id = p_prescription_id
    AND hospital_id = v_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prescription not found';
  END IF;

  IF v_prescription.status_code = 'cancelled' THEN
    RAISE EXCEPTION
      'Cannot extend a cancelled prescription';
  END IF;

  -- New day = prescribed_at + current duration
  v_new_day_start :=
    date_trunc('day', v_prescription.prescribed_at)
    + v_prescription.duration_days
      * interval '1 day';

  -- Extend duration by 1
  UPDATE public.drug_prescriptions
  SET duration_days = duration_days + 1
  WHERE id = p_prescription_id;

  -- Generate slots for the new day
  IF v_prescription.schedule_times IS NOT NULL
    AND array_length(
      v_prescription.schedule_times, 1) > 0
  THEN
    FOREACH v_slot_time IN ARRAY
      v_prescription.schedule_times
    LOOP
      INSERT INTO public.drug_administration_slots
        (prescription_id, hospital_id,
         hospitalization_id, patient_id,
         scheduled_at, status)
      VALUES (
        p_prescription_id,
        v_hospital_id,
        v_prescription.hospitalization_id,
        v_prescription.patient_id,
        v_new_day_start + v_slot_time::interval,
        'pending'
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success',       true,
    'new_day',       v_new_day_start,
    'duration_days', v_prescription.duration_days + 1
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION
      'extend_prescription failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 2. override_slot RPC
-- Physician changes a specific slot's scheduled
-- time and/or dose for that day only
-- ============================================================

-- Add override columns to drug_administration_slots
-- so we can track physician-modified slots separately
ALTER TABLE public.drug_administration_slots
  ADD COLUMN IF NOT EXISTS overridden_by uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS overridden_at
    timestamptz,
  ADD COLUMN IF NOT EXISTS original_scheduled_at
    timestamptz,
  ADD COLUMN IF NOT EXISTS override_dose text;

CREATE OR REPLACE FUNCTION public.override_slot(
  p_slot_id        uuid,
  p_scheduled_at   timestamptz DEFAULT NULL,
  p_dose           text        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   uuid;
  v_hospital_id uuid;
  v_slot        record;
  v_caller_roles text[];
BEGIN
  v_caller_id   := auth.uid();
  v_hospital_id := public.get_my_hospital_id();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Only physicians can override slots
  SELECT array_agg(r.code)
  INTO v_caller_roles
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = v_caller_id;

  IF NOT ('physician' = ANY(v_caller_roles)) THEN
    RAISE EXCEPTION
      'Only physicians can override slots';
  END IF;

  -- Get slot
  SELECT * INTO v_slot
  FROM public.drug_administration_slots
  WHERE id = p_slot_id
    AND hospital_id = v_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Slot not found';
  END IF;

  IF v_slot.status = 'done' THEN
    RAISE EXCEPTION
      'Cannot override an already administered slot';
  END IF;

  UPDATE public.drug_administration_slots
  SET
    -- Preserve original if first override
    original_scheduled_at = CASE
      WHEN original_scheduled_at IS NULL
        THEN scheduled_at
      ELSE original_scheduled_at
    END,
    scheduled_at = COALESCE(
      p_scheduled_at, scheduled_at),
    override_dose = COALESCE(
      p_dose, override_dose),
    overridden_by = v_caller_id,
    overridden_at = now()
  WHERE id = p_slot_id;

  RETURN jsonb_build_object(
    'success',       true,
    'slot_id',       p_slot_id,
    'scheduled_at',  COALESCE(
      p_scheduled_at, v_slot.scheduled_at),
    'dose',          COALESCE(
      p_dose, v_slot.override_dose)
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION
      'override_slot failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 3. cancel_day_slots RPC
-- Physician cancels all slots for a prescription
-- on a specific date
-- ============================================================
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
  v_caller_id   uuid;
  v_hospital_id uuid;
  v_caller_roles text[];
  v_count       integer;
BEGIN
  v_caller_id   := auth.uid();
  v_hospital_id := public.get_my_hospital_id();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Only physicians can cancel day slots
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
    AND hospital_id = v_hospital_id
    AND status = 'pending'
    AND scheduled_at::date = p_date
  RETURNING id INTO v_count;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success',          true,
    'slots_cancelled',  v_count
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION
      'cancel_day_slots failed: %', SQLERRM;
END;
$$;
