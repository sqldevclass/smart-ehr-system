-- Migration 196: get_stay_data_counts -- how many records one hospitalization
-- has in each part of the nursing monitoring history.
--
-- The "История госпитализаций" section on the nurse patient page lists a past
-- stay's data as blocks (scales, pain, glucose, daily notes). This returns the
-- record count per block in ONE round trip so the page can:
--   * show only the blocks that actually have records,
--   * say "Нет записей" when a stay has none,
--   * say "Показаны последние N из M" when a block is truncated, instead of
--     silently cutting the list off.
--
--   {"scales": 3, "pain": 4, "glucose": 0, "notes": 6}
--
-- Counts follow exactly what the live cards show: voided assessments are not
-- counted; the pain, glucose and note tables have no void flag.
--
-- SECURITY INVOKER (default): the caller's RLS applies. All four tables have a
-- plain hospital-scoped SELECT policy with no role gating (verified), so a
-- nurse and a physician get identical counts.

CREATE OR REPLACE FUNCTION public.get_stay_data_counts(p_hospitalization_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'scales',  (SELECT count(*) FROM public.patient_assessments
                WHERE hospitalization_id = p_hospitalization_id AND NOT is_voided),
    'pain',    (SELECT count(*) FROM public.pain_scale_readings
                WHERE hospitalization_id = p_hospitalization_id),
    'glucose', (SELECT count(*) FROM public.blood_glucose_readings
                WHERE hospitalization_id = p_hospitalization_id),
    'notes',   (SELECT count(*) FROM public.nursing_daily_notes
                WHERE hospitalization_id = p_hospitalization_id)
  )
$$;
