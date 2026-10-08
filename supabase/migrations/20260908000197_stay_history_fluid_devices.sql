-- Migration 197: fluid balance and devices in the hospitalization history.
--
-- 1. get_stay_data_counts (migration 196) now also reports 'fluid' and
--    'devices', so a past stay only shows those blocks when it has records:
--
--      {"scales": 3, "pain": 2, "glucose": 3, "fluid": 5, "notes": 0, "devices": 1}
--
-- 2. get_fluid_balance_by_day: one row per calendar day with the total intake
--    and output of a hospitalization, newest day first. Days are the HOSPITAL's
--    local calendar days (p_timezone), not UTC days: an entry at 22:30 UTC is
--    already the next day in Tashkent. Summing in the database also means a
--    long stay is never cut short by PostgREST's 1000-row response cap.
--
--      day         intake_ml  output_ml
--      2026-06-11       1200        900
--      2026-06-10        800        650
--
-- Both are SECURITY INVOKER (default): the caller's RLS applies. Every table
-- read here has a plain hospital-scoped SELECT policy with no role gating
-- (verified), so a nurse and a physician get identical results.

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
    'fluid',   (SELECT count(*) FROM public.fluid_balance_entries
                WHERE hospitalization_id = p_hospitalization_id),
    'notes',   (SELECT count(*) FROM public.nursing_daily_notes
                WHERE hospitalization_id = p_hospitalization_id),
    'devices', (SELECT count(*) FROM public.nurse_device_monitoring_records
                WHERE hospitalization_id = p_hospitalization_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.get_fluid_balance_by_day(
  p_hospitalization_id uuid,
  p_timezone text
)
RETURNS TABLE (day date, intake_ml bigint, output_ml bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    (recorded_at AT TIME ZONE p_timezone)::date AS day,
    COALESCE(SUM(volume_ml) FILTER (WHERE entry_type = 'intake'), 0)::bigint AS intake_ml,
    COALESCE(SUM(volume_ml) FILTER (WHERE entry_type = 'output'), 0)::bigint AS output_ml
  FROM public.fluid_balance_entries
  WHERE hospitalization_id = p_hospitalization_id
  GROUP BY 1
  ORDER BY 1 DESC
$$;
