-- Migration 181: fix submit_prescriptions -- its ON CONFLICT target
-- (physician_id, drug_formulary_id) doesn't match any unique
-- constraint/index because physician_favorites only has a PARTIAL
-- unique index for the drug side (physician_favorites_drug_uidx,
-- WHERE drug_formulary_id IS NOT NULL), from when the table was made
-- polymorphic (drugs + services). Postgres's ON CONFLICT inference
-- requires the WHERE clause to match the partial index exactly --
-- adding it here is the only change needed.

CREATE OR REPLACE FUNCTION public.submit_prescriptions(p_hospitalization_id uuid, p_hospital_id uuid, p_staff_role_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id     uuid;
  v_prescription  record;
  v_slot          jsonb;
  v_slot_time     text;
  v_slot_dose     text;
  v_slot_at       timestamp;
  v_day           integer;
  v_count         integer := 0;
  v_target_status text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  FOR v_prescription IN
    SELECT id, drug_formulary_id, is_patient_own_drug,
      schedule_times, duration_days,
      start_date, patient_id,
      hospitalization_id
    FROM public.drug_prescriptions
    WHERE hospitalization_id = p_hospitalization_id
      AND hospital_id = p_hospital_id
      AND is_drafted = true
  LOOP
    v_target_status := CASE
      WHEN v_prescription.is_patient_own_drug THEN 'ready_for_execution'
      ELSE 'preliminary'
    END;

    UPDATE public.drug_prescriptions
    SET
      is_drafted        = false,
      status_code       = v_target_status,
      status_changed_at = now(),
      status_changed_by = v_caller_id
    WHERE id = v_prescription.id;

    IF v_prescription.schedule_times IS NOT NULL
      AND jsonb_array_length(v_prescription.schedule_times) > 0
      AND v_prescription.duration_days IS NOT NULL
      AND v_prescription.duration_days > 0
    THEN
      FOR v_day IN 0..(v_prescription.duration_days - 1)
      LOOP
        FOR v_slot IN SELECT * FROM jsonb_array_elements(v_prescription.schedule_times)
        LOOP
          v_slot_time := v_slot->>'time';
          v_slot_dose := v_slot->>'dose';
          v_slot_at := (v_prescription.start_date + v_day) + v_slot_time::interval;

          INSERT INTO public.drug_administration_slots(
            prescription_id, hospital_id,
            hospitalization_id, patient_id,
            scheduled_at, status, override_dose,
            dispense_status)
          VALUES (
            v_prescription.id, p_hospital_id,
            p_hospitalization_id, v_prescription.patient_id,
            v_slot_at, 'pending', NULLIF(v_slot_dose, ''),
            CASE WHEN v_prescription.is_patient_own_drug
              THEN 'ready_for_execution' ELSE 'preliminary' END
          );
        END LOOP;
      END LOOP;
    END IF;

    IF v_prescription.drug_formulary_id IS NOT NULL THEN
      INSERT INTO public.physician_favorites
        (physician_id, drug_formulary_id, use_count, last_used_at)
      VALUES
        (v_caller_id, v_prescription.drug_formulary_id, 1, now())
      ON CONFLICT (physician_id, drug_formulary_id) WHERE (drug_formulary_id IS NOT NULL)
      DO UPDATE SET
        use_count    = physician_favorites.use_count + 1,
        last_used_at = now();
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('submitted_count', v_count, 'success', true);

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'submit_prescriptions failed: %', SQLERRM;
END;
$function$;
