-- Migration 069: Patient vitals table
-- Entered by nurses during inpatient stay
-- Feeds physician Физикальные показатели view
-- and Phase 8 EWS/ШРПУ scoring

CREATE TABLE public.patient_vitals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id         uuid NOT NULL REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  hospitalization_id  uuid NOT NULL REFERENCES public.hospitalizations(id)
    ON DELETE CASCADE,
  patient_id          uuid NOT NULL REFERENCES public.patients(id)
    ON DELETE CASCADE,
  recorded_by         uuid REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  recorded_at         timestamptz NOT NULL DEFAULT now(),

  -- Cardiovascular
  bp_systolic         integer CHECK (bp_systolic BETWEEN 40 AND 300),
  bp_diastolic        integer CHECK (bp_diastolic BETWEEN 20 AND 200),
  pulse               integer CHECK (pulse BETWEEN 20 AND 300),

  -- Respiratory
  respiratory_rate    integer CHECK (respiratory_rate BETWEEN 4 AND 60),
  spo2                numeric(4,1) CHECK (spo2 BETWEEN 50 AND 100),

  -- Temperature
  temperature         numeric(4,1) CHECK (temperature BETWEEN 30 AND 45),

  -- Anthropometric
  weight_kg           numeric(5,1) CHECK (weight_kg BETWEEN 1 AND 500),
  height_cm           numeric(5,1) CHECK (height_cm BETWEEN 30 AND 250),

  -- Consciousness (AVPU scale for EWS)
  consciousness       text CHECK (consciousness IN
    ('alert', 'voice', 'pain', 'unresponsive')),

  -- Fluid balance
  fluid_intake_ml     integer CHECK (fluid_intake_ml >= 0),
  fluid_output_ml     integer CHECK (fluid_output_ml >= 0),

  -- Free text notes
  notes               text,

  created_at          timestamptz DEFAULT now()
);

CREATE INDEX patient_vitals_hospitalization_idx
  ON public.patient_vitals(hospitalization_id);
CREATE INDEX patient_vitals_patient_idx
  ON public.patient_vitals(patient_id);
CREATE INDEX patient_vitals_recorded_at_idx
  ON public.patient_vitals(hospitalization_id, recorded_at DESC);

ALTER TABLE public.patient_vitals
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_vitals_select"
  ON public.patient_vitals
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "patient_vitals_insert"
  ON public.patient_vitals
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('patients.view_all')
  );

CREATE POLICY "patient_vitals_update"
  ON public.patient_vitals
  FOR UPDATE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND recorded_by = auth.uid()
  )
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND recorded_by = auth.uid()
  );

CREATE POLICY "patient_vitals_delete"
  ON public.patient_vitals
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND recorded_by = auth.uid()
  );