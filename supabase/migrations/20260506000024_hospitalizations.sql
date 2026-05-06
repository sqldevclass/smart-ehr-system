-- Migration 024: Hospitalizations, Room Assignments, Patient Diagnoses,
-- Hospitalization Orders, PACS Studies

-- ============================================================
-- HOSPITALIZATIONS
-- ============================================================

CREATE TABLE public.hospitalizations (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id                    uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  hospital_id                   uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  hospitalization_number        text UNIQUE,
  hospitalization_type_id       uuid NOT NULL REFERENCES public.hospitalization_types(id),
  urgency_id                    uuid NOT NULL REFERENCES public.hospitalization_urgency(id),
  department_id                 uuid NOT NULL REFERENCES public.departments(id),
  primary_physician_id          uuid REFERENCES public.physicians(id),
  admitted_by                   uuid REFERENCES public.profiles(id),
  admitted_at                   timestamptz DEFAULT now(),
  discharged_at                 timestamptz,
  discharge_type                text CHECK (discharge_type IN ('discharged','transferred','deceased')),
  created_from_visit_service_id uuid REFERENCES public.visit_services(id),
  track_fluid_balance           boolean DEFAULT false,
  track_wound_monitoring        boolean DEFAULT false,
  created_at                    timestamptz DEFAULT now()
);

CREATE INDEX hospitalizations_hospital_idx ON public.hospitalizations(hospital_id);
CREATE INDEX hospitalizations_patient_idx ON public.hospitalizations(patient_id);
CREATE INDEX hospitalizations_department_idx ON public.hospitalizations(department_id);

-- Hospitalization number generation trigger
CREATE OR REPLACE FUNCTION public.generate_hospitalization_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.hospitalization_number IS NULL THEN
    NEW.hospitalization_number := public.generate_sequence_number(
      NEW.hospital_id,
      'hospitalization'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hospitalizations_generate_number
  BEFORE INSERT ON public.hospitalizations
  FOR EACH ROW EXECUTE FUNCTION public.generate_hospitalization_number();

-- Audit trigger
CREATE TRIGGER hospitalizations_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.hospitalizations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

ALTER TABLE public.hospitalizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hospitalizations_select" ON public.hospitalizations
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "hospitalizations_insert" ON public.hospitalizations
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('hospitalizations.open')
  );

CREATE POLICY "hospitalizations_update" ON public.hospitalizations
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('hospitalizations.open')
      OR public.has_permission('hospitalizations.discharge')
      OR public.has_permission('hospitalizations.assign_room')
    )
  );

-- ============================================================
-- ROOM ASSIGNMENTS
-- ============================================================

CREATE TABLE public.room_assignments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospitalization_id uuid NOT NULL REFERENCES public.hospitalizations(id) ON DELETE CASCADE,
  hospital_id        uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  room_id            uuid NOT NULL REFERENCES public.rooms(id),
  bed_number         text,
  assigned_at        timestamptz DEFAULT now(),
  assigned_by        uuid REFERENCES public.profiles(id),
  discharged_at      timestamptz
);

CREATE INDEX room_assignments_hospitalization_idx 
  ON public.room_assignments(hospitalization_id);
CREATE INDEX room_assignments_room_idx 
  ON public.room_assignments(room_id);

ALTER TABLE public.room_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "room_assignments_select" ON public.room_assignments
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "room_assignments_insert" ON public.room_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('hospitalizations.assign_room')
  );

CREATE POLICY "room_assignments_update" ON public.room_assignments
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('hospitalizations.assign_room')
  );

-- ============================================================
-- PATIENT DIAGNOSES
-- ============================================================

CREATE TABLE public.patient_diagnoses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id         uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  hospitalization_id uuid REFERENCES public.hospitalizations(id) ON DELETE CASCADE,
  visit_id           uuid REFERENCES public.visits(id) ON DELETE CASCADE,
  hospital_id        uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  icd10_code         text NOT NULL REFERENCES public.icd10_codes(code),
  diagnosis_type     text NOT NULL CHECK (diagnosis_type IN (
                       'main','complication','competing','background','comorbid'
                     )),
  acuity             text CHECK (acuity IN ('acute','chronic')),
  notes              text,
  recorded_by        uuid REFERENCES public.profiles(id),
  recorded_at        timestamptz DEFAULT now()
);

CREATE INDEX patient_diagnoses_hospital_idx ON public.patient_diagnoses(hospital_id);
CREATE INDEX patient_diagnoses_patient_idx ON public.patient_diagnoses(patient_id);
CREATE INDEX patient_diagnoses_hospitalization_idx 
  ON public.patient_diagnoses(hospitalization_id);
CREATE INDEX patient_diagnoses_icd10_idx ON public.patient_diagnoses(icd10_code);

-- Audit trigger
CREATE TRIGGER patient_diagnoses_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.patient_diagnoses
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

ALTER TABLE public.patient_diagnoses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_diagnoses_select" ON public.patient_diagnoses
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "patient_diagnoses_insert" ON public.patient_diagnoses
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('documents.create')
  );

CREATE POLICY "patient_diagnoses_update" ON public.patient_diagnoses
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('documents.edit')
  );

CREATE POLICY "patient_diagnoses_delete" ON public.patient_diagnoses
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('documents.edit')
  );

-- ============================================================
-- HOSPITALIZATION ORDERS
-- (diet, activity mode, free-text care orders from physician)
-- ============================================================

CREATE TABLE public.hospitalization_orders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospitalization_id uuid NOT NULL REFERENCES public.hospitalizations(id) ON DELETE CASCADE,
  hospital_id        uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  order_type         text NOT NULL CHECK (order_type IN ('diet','activity_mode','care')),
  order_value        text NOT NULL,
  ordered_by         uuid NOT NULL REFERENCES public.profiles(id),
  ordered_at         timestamptz DEFAULT now(),
  is_active          boolean DEFAULT true,
  cancelled_at       timestamptz,
  cancelled_by       uuid REFERENCES public.profiles(id)
);

CREATE INDEX hospitalization_orders_hospitalization_idx 
  ON public.hospitalization_orders(hospitalization_id);

ALTER TABLE public.hospitalization_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hospitalization_orders_select" ON public.hospitalization_orders
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "hospitalization_orders_insert" ON public.hospitalization_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('documents.create')
  );

CREATE POLICY "hospitalization_orders_update" ON public.hospitalization_orders
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('documents.edit')
  );

-- ============================================================
-- PACS STUDIES
-- Links patient to external radiology images
-- ============================================================

CREATE TABLE public.pacs_studies (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id         uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  hospitalization_id uuid REFERENCES public.hospitalizations(id) ON DELETE CASCADE,
  hospital_id        uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  pacs_reference     text NOT NULL,
  study_date         date,
  study_type         text,
  description        text,
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX pacs_studies_hospital_idx ON public.pacs_studies(hospital_id);
CREATE INDEX pacs_studies_patient_idx ON public.pacs_studies(patient_id);

ALTER TABLE public.pacs_studies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pacs_studies_select" ON public.pacs_studies
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "pacs_studies_insert" ON public.pacs_studies
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('documents.create')
  );

-- ============================================================
-- Add hospitalization_id FK to visit_services
-- (deferred until hospitalizations table existed)
-- ============================================================

ALTER TABLE public.visit_services
  ADD CONSTRAINT visit_services_hospitalization_fk
  FOREIGN KEY (hospitalization_id)
  REFERENCES public.hospitalizations(id)
  ON DELETE SET NULL;