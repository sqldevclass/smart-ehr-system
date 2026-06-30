-- Migration 147: Nursing Daily Notes
-- Phase 9 gap closure. Free-text daily nursing notes per
-- hospitalization. Activated via the existing generic
-- hospitalization_active_forms mechanism (scale_code = 'daily_notes'),
-- consistent with fluid_balance and wound_monitoring.

CREATE TABLE public.nursing_daily_notes (
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

  note_text           text NOT NULL
    CHECK (trim(note_text) <> ''),

  recorded_at         timestamptz NOT NULL
    DEFAULT now(),
  recorded_by         uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX nursing_daily_notes_hosp_idx
  ON public.nursing_daily_notes(
    hospitalization_id);
CREATE INDEX nursing_daily_notes_recorded_at_idx
  ON public.nursing_daily_notes(
    hospitalization_id, recorded_at DESC);

ALTER TABLE public.nursing_daily_notes
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nursing_daily_notes_select"
  ON public.nursing_daily_notes
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "nursing_daily_notes_insert"
  ON public.nursing_daily_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id());
