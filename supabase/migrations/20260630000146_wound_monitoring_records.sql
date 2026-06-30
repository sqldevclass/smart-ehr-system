-- Migration 146: Wound Monitoring Records
-- Phase 9 gap closure. Tracks post-operative wound monitoring
-- entries per hospitalization, activated via the existing generic
-- hospitalization_active_forms mechanism (scale_code = 'wound_monitoring'),
-- same pattern as fluid_balance_entries.
--
-- hospitalizations.track_wound_monitoring (boolean column added in
-- migration 024) is dead — nothing reads or writes it. Left in place
-- for now; activation goes through hospitalization_active_forms instead,
-- consistent with how fluid_balance and pain scales were actually wired.

CREATE TABLE public.wound_monitoring_records (
  id                  uuid PRIMARY KEY
    DEFAULT gen_random_uuid(),
  hospital_id         uuid NOT NULL
    REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  hospitalization_id  uuid NOT NULL
    REFERENCES public.hospitalizations(id)
    ON DELETE CASCADE,
  patient_id          uuid NOT NULL
    REFERENCES public.patients(id)
    ON DELETE CASCADE,

  -- Free text identifying which wound (e.g. "post-op incision,
  -- right flank") — a patient may have multiple tracked wounds
  -- within one hospitalization, distinguished by this label.
  wound_location       text NOT NULL,

  -- healing | unchanged | deteriorating | infected
  condition             text NOT NULL
    CHECK (condition IN (
      'healing', 'unchanged',
      'deteriorating', 'infected'
    )),

  size_cm               numeric,
  drainage_description  text,
  dressing_changed      boolean NOT NULL DEFAULT false,
  dressing_type         text,
  notes                 text,

  recorded_at           timestamptz NOT NULL
    DEFAULT now(),
  recorded_by           uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX wound_monitoring_hosp_idx
  ON public.wound_monitoring_records(
    hospitalization_id);
CREATE INDEX wound_monitoring_recorded_at_idx
  ON public.wound_monitoring_records(
    hospitalization_id, recorded_at DESC);
-- Supports "chronological history per wound" — filtering by
-- location within a hospitalization.
CREATE INDEX wound_monitoring_location_idx
  ON public.wound_monitoring_records(
    hospitalization_id, wound_location);

ALTER TABLE public.wound_monitoring_records
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wound_monitoring_select"
  ON public.wound_monitoring_records
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "wound_monitoring_insert"
  ON public.wound_monitoring_records
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id());
