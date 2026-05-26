-- Migration 068: Track recently viewed inpatients per physician
-- Stores last 50 patients viewed, used for "Последние пациенты" dropdown

CREATE TABLE public.physician_recent_patients (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  physician_id   uuid NOT NULL REFERENCES public.physicians(id)
    ON DELETE CASCADE,
  hospital_id    uuid NOT NULL REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  patient_id     uuid NOT NULL REFERENCES public.patients(id)
    ON DELETE CASCADE,
  hospitalization_id uuid REFERENCES public.hospitalizations(id)
    ON DELETE CASCADE,
  viewed_at      timestamptz DEFAULT now(),
  UNIQUE (physician_id, patient_id)
);

CREATE INDEX physician_recent_patients_physician_idx
  ON public.physician_recent_patients(physician_id);
CREATE INDEX physician_recent_patients_viewed_idx
  ON public.physician_recent_patients(physician_id, viewed_at DESC);

ALTER TABLE public.physician_recent_patients
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recent_patients_select"
  ON public.physician_recent_patients
  FOR SELECT TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND physician_id = (
      SELECT id FROM public.physicians
      WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "recent_patients_insert"
  ON public.physician_recent_patients
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND physician_id = (
      SELECT id FROM public.physicians
      WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "recent_patients_update"
  ON public.physician_recent_patients
  FOR UPDATE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND physician_id = (
      SELECT id FROM public.physicians
      WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "recent_patients_delete"
  ON public.physician_recent_patients
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND physician_id = (
      SELECT id FROM public.physicians
      WHERE profile_id = auth.uid()
    )
  );

-- Function to upsert recent patient and trim to 50
CREATE OR REPLACE FUNCTION public.track_recent_patient(
  p_physician_id        uuid,
  p_hospital_id         uuid,
  p_patient_id          uuid,
  p_hospitalization_id  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_oldest_id uuid;
BEGIN
  -- Upsert — update viewed_at if exists, insert if not
  INSERT INTO public.physician_recent_patients (
    physician_id, hospital_id, patient_id,
    hospitalization_id, viewed_at
  ) VALUES (
    p_physician_id, p_hospital_id, p_patient_id,
    p_hospitalization_id, now()
  )
  ON CONFLICT (physician_id, patient_id)
  DO UPDATE SET
    viewed_at = now(),
    hospitalization_id = p_hospitalization_id;

  -- Trim to 50 most recent
  SELECT COUNT(*) INTO v_count
  FROM public.physician_recent_patients
  WHERE physician_id = p_physician_id;

  IF v_count > 50 THEN
    DELETE FROM public.physician_recent_patients
    WHERE id IN (
      SELECT id FROM public.physician_recent_patients
      WHERE physician_id = p_physician_id
      ORDER BY viewed_at ASC
      LIMIT (v_count - 50)
    );
  END IF;
END;
$$;