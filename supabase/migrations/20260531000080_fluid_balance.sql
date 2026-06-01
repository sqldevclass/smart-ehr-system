-- Migration 080: Fluid Balance Entries
-- Tracks hourly fluid intake and output per hospitalization

CREATE TABLE public.fluid_balance_entries (
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

  -- 'intake' or 'output'
  entry_type          text NOT NULL
    CHECK (entry_type IN ('intake', 'output')),

  -- Intake:  per_os | iv | blood_in |
  --          nasogastric_in | other_in
  -- Output:  urine | vomit | blood_out |
  --          aspiration | nasogastric_out |
  --          other_out
  category            text NOT NULL,

  volume_ml           integer NOT NULL
    CHECK (volume_ml > 0),

  recorded_at         timestamptz NOT NULL
    DEFAULT now(),
  recorded_by         uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  notes               text,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX fluid_balance_hosp_idx
  ON public.fluid_balance_entries(
    hospitalization_id);
CREATE INDEX fluid_balance_recorded_at_idx
  ON public.fluid_balance_entries(
    hospitalization_id, recorded_at DESC);

ALTER TABLE public.fluid_balance_entries
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fluid_balance_select"
  ON public.fluid_balance_entries
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "fluid_balance_insert"
  ON public.fluid_balance_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id());
