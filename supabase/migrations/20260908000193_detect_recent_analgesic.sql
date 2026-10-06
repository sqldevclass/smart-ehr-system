-- Migration 193: auto-detect "pain medication was just given" for the
-- pain scale, instead of relying on the nurse to remember to mark it.
--
-- Doctor-confirmed rules:
--   * pain medication = drug subgroup "Анальгетики (болеутоляющие)"
--     or "НПВП" (these two subgroup ids are the seeded global rows in
--     drug_subgroups)
--   * "recently administered" = a drug_administration_slots row with
--     status = 'done' and administered_at within the last 30 minutes
--   * route mapping into pain_scale_readings.medication_route:
--       per_os               -> 'oral' (reassess in 45 min)
--       iv_bolus / iv_drip   -> 'iv'   (reassess in 15 min)
--       im                   -> 'im'   (reassess in 30 min)
--       EVERY OTHER route (sc, nasal, rectal, sublingual, ...) follows
--       the IM rule -> 'im' (30 min)
--
-- If several qualifying administrations fall inside the window, the
-- shortest reassessment interval wins (iv < im < oral) -- the safer
-- cadence when e.g. an oral and an IV analgesic were both given.
--
-- TIMEZONE: administered_at is `timestamp without time zone`, and the
-- frontend writes it as new Date().toISOString() (a UTC string).
-- Postgres silently discards the "Z" for such columns (verified), so
-- the stored value is UTC wall-clock time -- and the database runs in
-- UTC. The window is therefore compared against
-- (now() AT TIME ZONE 'UTC'), NOT a bare now().
--
-- SECURITY INVOKER (the default): the caller's RLS applies, so a user
-- who can't read these tables simply gets NULL (no detection) and the
-- nurse selects manually -- fails safe.
--
-- Known limits (by design, nurse can always override manually):
--   * patient's-own-drug prescriptions have no drug_formulary row, so
--     they can't be classified and are not detected.
--   * drugs with no subgroup (10 of 18 at the time of writing, incl.
--     Tylenol, Infulgan, Tromboas) are not detected until categorized.

CREATE OR REPLACE FUNCTION public.get_recent_analgesic_route(
  p_patient_id  uuid,
  p_hospital_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT t.pain_route
  FROM (
    SELECT
      CASE
        WHEN dp.route = 'per_os'                   THEN 'oral'
        WHEN dp.route IN ('iv_bolus', 'iv_drip')   THEN 'iv'
        ELSE 'im'
      END AS pain_route,
      CASE
        WHEN dp.route IN ('iv_bolus', 'iv_drip')   THEN 15
        WHEN dp.route = 'per_os'                   THEN 45
        ELSE 30
      END AS interval_min
    FROM public.drug_administration_slots das
    JOIN public.drug_prescriptions dp ON dp.id = das.prescription_id
    JOIN public.drug_formulary df     ON df.id = dp.drug_formulary_id
    WHERE das.patient_id  = p_patient_id
      AND das.hospital_id = p_hospital_id
      AND das.status = 'done'
      AND das.administered_at >= (now() AT TIME ZONE 'UTC') - interval '30 minutes'
      AND df.subgroup_id IN (
        'ff42d688-83aa-44fc-8509-8ccc1ff7ee8d', -- Анальгетики (болеутоляющие)
        'f128121d-1d4a-471b-8684-35ca1c34b3eb'  -- НПВП
      )
  ) t
  ORDER BY t.interval_min ASC
  LIMIT 1
$$;
