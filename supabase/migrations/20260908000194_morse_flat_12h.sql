-- Migration 194: Morse fall-risk reassessment is a flat 12 hours for
-- every score (doctor-confirmed), replacing the 24h/12h/6h adaptive
-- schedule from migration 192. risk_level categorization is unchanged.
--
-- Deliberately NOT changed: Humpty Dumpty (pediatric fall risk, stays
-- 24h low / 12h high), Braden, GCS, CPOT. Only the Morse v_next_at.
--
-- Existing Morse assessments keep the next_assessment_at they were
-- stored with; the 12h rule applies from the next submission on.
--
-- Also backfills pain_scale_readings.next_assessment_at. Readings
-- recorded before migration 192's trigger existed have NULL there, so
-- they could never be shown as due or overdue. The trigger's rule for
-- "no medication recorded" is recorded_at + 12h, which is exactly the
-- right value for those legacy rows (they predate the medication
-- concept entirely).

CREATE OR REPLACE FUNCTION public.submit_assessment(p_hospitalization_id uuid, p_hospital_id uuid, p_patient_id uuid, p_scale_id uuid, p_responses jsonb, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id       uuid;
  v_assessment_id   uuid;
  v_total_score     integer := 0;
  v_risk_level      text;
  v_scale           record;
  v_next_at         timestamptz;
  v_resp            jsonb;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_scale
  FROM public.assessment_scales
  WHERE id = p_scale_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scale not found: %',
      p_scale_id;
  END IF;

  FOR v_resp IN
    SELECT * FROM jsonb_array_elements(p_responses)
  LOOP
    v_total_score := v_total_score +
      (v_resp->>'score')::integer;
  END LOOP;

  IF v_scale.code = 'braden' THEN
    v_risk_level :=
      CASE
        WHEN v_total_score <= 9  THEN 'very_high'
        WHEN v_total_score <= 12 THEN 'high'
        WHEN v_total_score <= 14 THEN 'moderate'
        WHEN v_total_score <= 18 THEN 'mild'
        ELSE 'none'
      END;
    -- New: 24h baseline, tightening as risk increases
    v_next_at :=
      CASE
        WHEN v_total_score <= 12 THEN
          now() + interval '6 hours'
        WHEN v_total_score <= 14 THEN
          now() + interval '12 hours'
        ELSE now() + interval '24 hours'
      END;

  ELSIF v_scale.code = 'morse' THEN
    v_risk_level :=
      CASE
        WHEN v_total_score >= 51 THEN 'high'
        WHEN v_total_score >= 25 THEN 'low'
        ELSE 'none'
      END;
    -- Flat 12h for every Morse score (doctor-confirmed). Replaces the
    -- 24h/12h/6h adaptive schedule from migration 192.
    v_next_at := now() + interval '12 hours';

  ELSIF v_scale.code = 'humpty_dumpty' THEN
    v_risk_level :=
      CASE
        WHEN v_total_score >= 12 THEN 'high'
        ELSE 'low'
      END;
    -- New: 24h baseline, tightening as risk increases
    -- (only 2 tiers exist for this scale, so no 6h step)
    v_next_at :=
      CASE
        WHEN v_total_score >= 12 THEN
          now() + interval '12 hours'
        ELSE now() + interval '24 hours'
      END;

  ELSIF v_scale.code = 'gcs' THEN
    -- Unchanged -- acute neuro monitoring, confirmed not part of
    -- this change.
    v_risk_level :=
      CASE
        WHEN v_total_score <= 8  THEN 'severe'
        WHEN v_total_score <= 12 THEN 'moderate'
        ELSE 'mild'
      END;
    v_next_at :=
      CASE
        WHEN v_total_score <= 8  THEN
          now() + interval '30 minutes'
        WHEN v_total_score <= 12 THEN
          now() + interval '1 hour'
        ELSE now() + interval '4 hours'
      END;

  ELSIF v_scale.code = 'cpot' THEN
    -- Unchanged -- acute pain-in-sedation monitoring, confirmed not
    -- part of this change.
    v_risk_level :=
      CASE
        WHEN v_total_score >= 6 THEN 'severe'
        WHEN v_total_score >= 2 THEN 'moderate'
        ELSE 'none'
      END;
    v_next_at :=
      CASE
        WHEN v_total_score >= 6 THEN
          now() + interval '2 hours'
        WHEN v_total_score >= 2 THEN
          now() + interval '4 hours'
        ELSE now() + interval '12 hours'
      END;

  ELSE
    v_risk_level := 'unknown';
    v_next_at := now() + interval '24 hours';
  END IF;

  INSERT INTO public.patient_assessments (
    hospital_id, hospitalization_id, patient_id,
    scale_id, total_score, risk_level,
    assessed_by, next_assessment_at, notes
  ) VALUES (
    p_hospital_id, p_hospitalization_id,
    p_patient_id, p_scale_id, v_total_score,
    v_risk_level, v_caller_id, v_next_at, p_notes
  )
  RETURNING id INTO v_assessment_id;

  FOR v_resp IN
    SELECT * FROM jsonb_array_elements(p_responses)
  LOOP
    INSERT INTO public.patient_assessment_responses
      (assessment_id, item_id, option_id, score)
    VALUES (
      v_assessment_id,
      (v_resp->>'item_id')::uuid,
      (v_resp->>'option_id')::uuid,
      (v_resp->>'score')::integer
    );
  END LOOP;

  RETURN jsonb_build_object(
    'assessment_id', v_assessment_id,
    'total_score',   v_total_score,
    'risk_level',    v_risk_level,
    'next_at',       v_next_at
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION
      'submit_assessment failed: %', SQLERRM;
END;
$function$;

-- ============================================================
-- Backfill legacy pain readings (NULL next_assessment_at)
-- ============================================================

UPDATE public.pain_scale_readings
SET next_assessment_at = recorded_at + interval '12 hours'
WHERE next_assessment_at IS NULL;
