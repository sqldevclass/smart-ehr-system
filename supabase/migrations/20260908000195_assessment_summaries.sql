-- Migration 195: get_assessment_summaries -- one shared data source for the
-- "Оценки" cell on both the nurse and the physician inpatient lists.
--
-- For each requested hospitalization it returns a single jsonb summary:
--   scales       latest NON-VOIDED assessment per scale (braden, morse,
--                humpty_dumpty, gcs, cpot) with score / risk / due time
--   pain         latest pain_scale_readings row (score + due time), or null
--   daily_notes  null unless the "daily_notes" form is active for the
--                hospitalization; otherwise activated_at + last_note_at
--   allergies    the patient's patient_allergies rows
--
-- Why a function instead of more client-side queries:
--   * The old nurse-list code downloaded EVERY non-voided assessment in the
--     whole hospital on each refresh with no limit. PostgREST caps responses
--     at 1000 rows, so past that point "latest per patient" would silently
--     go wrong. This returns exactly one small row per hospitalization.
--   * Nurse and physician lists must show the exact same cell. One function
--     plus one shared frontend module means one set of rules.
--
-- Deliberately returns RAW facts (scores, timestamps), not "pending" flags:
-- due/overdue is evaluated in the browser against a ticking clock so the
-- blinking indicator flips on its own without a refetch, and the daily-note
-- 08:00/20:00 slot rule needs the hospital timezone (tested date-fns-tz
-- helper in the frontend) rather than a second copy of that logic in SQL.
--
-- SECURITY INVOKER (default): the caller's RLS applies. All six tables read
-- here use plain hospital-scoped SELECT policies with no role gating
-- (verified), so a nurse and a physician get identical results.

CREATE OR REPLACE FUNCTION public.get_assessment_summaries(p_hospitalization_ids uuid[])
RETURNS TABLE (hospitalization_id uuid, summary jsonb)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    h.id,
    jsonb_build_object(
      'scales', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'code', s.code,
                 'total_score', pa.total_score,
                 'risk_level', pa.risk_level,
                 'assessed_at', pa.assessed_at,
                 'next_assessment_at', pa.next_assessment_at))
        FROM (
          SELECT DISTINCT ON (pa2.scale_id)
                 pa2.scale_id, pa2.total_score, pa2.risk_level,
                 pa2.assessed_at, pa2.next_assessment_at
          FROM public.patient_assessments pa2
          WHERE pa2.hospitalization_id = h.id
            AND pa2.is_voided = false
          ORDER BY pa2.scale_id, pa2.assessed_at DESC
        ) pa
        JOIN public.assessment_scales s ON s.id = pa.scale_id
      ), '[]'::jsonb),
      'pain', (
        SELECT jsonb_build_object(
                 'score', pr.score,
                 'recorded_at', pr.recorded_at,
                 'next_assessment_at', pr.next_assessment_at)
        FROM public.pain_scale_readings pr
        WHERE pr.hospitalization_id = h.id
        ORDER BY pr.recorded_at DESC
        LIMIT 1
      ),
      'daily_notes', (
        SELECT jsonb_build_object(
                 'activated_at', f.activated_at,
                 'last_note_at', (
                   SELECT max(n.recorded_at)
                   FROM public.nursing_daily_notes n
                   WHERE n.hospitalization_id = h.id))
        FROM public.hospitalization_active_forms f
        WHERE f.hospitalization_id = h.id
          AND f.scale_code = 'daily_notes'
        LIMIT 1
      ),
      'allergies', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'description', a.description,
                 'allergy_type', a.allergy_type,
                 'severity', a.severity)
               ORDER BY a.recorded_at DESC)
        FROM public.patient_allergies a
        WHERE a.patient_id = h.patient_id
          AND a.hospital_id = h.hospital_id
      ), '[]'::jsonb)
    )
  FROM public.hospitalizations h
  WHERE h.id = ANY(p_hospitalization_ids)
$$;
