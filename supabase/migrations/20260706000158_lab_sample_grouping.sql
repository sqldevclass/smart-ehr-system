-- Migration 158: Tube-color-based lab sample grouping.
--
-- 1. service_groups.color — lets admins assign the real physical
--    tube/probe-container color per group. Editable on existing
--    groups too (same dialog handles create + edit).
--
-- 2. lab_sample_services — the actual fix enabling "one barcode,
--    many services." lab_samples.visit_service_id was a singular
--    NOT NULL FK; going forward, a sample can serve multiple
--    services (all sharing the same tube color) via this junction
--    table instead. Existing samples are backfilled so old and
--    new code paths both resolve correctly through the junction.
--
--    lab_results already links to lab_sample_id, not to a specific
--    service — no change needed there, it already supports one
--    sample producing results across multiple services' parameter
--    sets.

ALTER TABLE public.service_groups
  ADD COLUMN color text;

CREATE TABLE public.lab_sample_services (
  id                uuid PRIMARY KEY
    DEFAULT gen_random_uuid(),
  hospital_id       uuid NOT NULL
    REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  sample_id         uuid NOT NULL
    REFERENCES public.lab_samples(id)
    ON DELETE CASCADE,
  visit_service_id  uuid NOT NULL
    REFERENCES public.visit_services(id)
    ON DELETE CASCADE,
  created_at         timestamptz DEFAULT now(),
  UNIQUE (sample_id, visit_service_id)
);

CREATE INDEX lab_sample_services_sample_idx
  ON public.lab_sample_services(sample_id);

CREATE INDEX lab_sample_services_visit_service_idx
  ON public.lab_sample_services(visit_service_id);

ALTER TABLE public.lab_sample_services
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lab_sample_services_select"
  ON public.lab_sample_services
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "lab_sample_services_insert"
  ON public.lab_sample_services
  FOR INSERT TO authenticated
  WITH CHECK (hospital_id = public.get_my_hospital_id());

-- Backfill: every existing sample already has exactly one service
-- via the old singular FK — mirror that into the junction table so
-- all code querying through lab_sample_services sees complete data
-- for both old and new samples.
INSERT INTO public.lab_sample_services (hospital_id, sample_id, visit_service_id)
SELECT hospital_id, id, visit_service_id
FROM public.lab_samples
WHERE visit_service_id IS NOT NULL;

-- Old column stays, now nullable — new grouped draws can leave it
-- NULL and rely purely on the junction table; historical samples
-- keep resolving through it exactly as before, nothing retroactively
-- breaks.
ALTER TABLE public.lab_samples
  ALTER COLUMN visit_service_id DROP NOT NULL;
