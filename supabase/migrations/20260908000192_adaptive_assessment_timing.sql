-- Migration 192: per doctor's confirmed instructions.
--
-- Braden/Morse/Humpty Dumpty: new baseline is 24h for everyone,
-- tightening as risk increases (24h -> 12h -> 6h), replacing the
-- previous scheme where only the worst tier got 24h and safer
-- tiers were checked less often (up to 7 days). risk_level
-- categorization itself is unchanged -- only v_next_at timing.
--
-- GCS and CPOT explicitly confirmed untouched -- acute-monitoring
-- scales, kept exactly as they were.
--
-- Pain Scale (NRS/FACES, pain_scale_readings) explicitly confirmed
-- NOT folded into the new adaptive system -- keeps its own flat 12h
-- baseline, plus three new medication-triggered rules: if score > 5
-- AND pain medication was just given, reassess in 45/30/15 min for
-- oral/IM/IV respectively. pain_scale_readings had no concept of
-- "medication was given" at all before this -- adding a route field
-- the nurse selects at the moment of recording (not cross-
-- referencing the separate drug-administration system, which would
-- have no reliable way to know which of a patient's many
-- administered drugs was actually for this specific pain episode).

-- ============================================================
-- 1. New reassessment timing for Braden/Morse/Humpty Dumpty
-- ============================================================

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
    -- New: 24h baseline, tightening as risk increases
    v_next_at :=
      CASE
        WHEN v_total_score >= 51 THEN
          now() + interval '6 hours'
        WHEN v_total_score >= 25 THEN
          now() + interval '12 hours'
        ELSE now() + interval '24 hours'
      END;

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
-- 2. Pain scale: medication-route field + scheduling
-- ============================================================

ALTER TABLE public.pain_scale_readings
  ADD COLUMN medication_route text CHECK (medication_route IN ('oral', 'im', 'iv')),
  ADD COLUMN next_assessment_at timestamptz;

CREATE OR REPLACE FUNCTION public.compute_pain_next_assessment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.score > 5 AND NEW.medication_route IS NOT NULL THEN
    NEW.next_assessment_at :=
      CASE NEW.medication_route
        WHEN 'oral' THEN now() + interval '45 minutes'
        WHEN 'im'   THEN now() + interval '30 minutes'
        WHEN 'iv'   THEN now() + interval '15 minutes'
      END;
  ELSE
    NEW.next_assessment_at := now() + interval '12 hours';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pain_scale_readings_next_assessment
  BEFORE INSERT ON public.pain_scale_readings
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_pain_next_assessment();
