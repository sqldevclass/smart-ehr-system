-- Migration 010: Patients, Contacts, Allergies, Files

-- ============================================================
-- PATIENTS
-- ============================================================

CREATE TABLE public.patients (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id         uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_number      text UNIQUE,
  first_name          text NOT NULL,
  last_name           text NOT NULL,
  middle_name         text,
  date_of_birth       date,
  gender              text CHECK (gender IN ('male','female','other')),
  blood_type          text CHECK (blood_type IN (
                        'A+','A-','B+','B-','AB+','AB-','O+','O-'
                      )),
  national_id         text,
  phone               text,
  email               text,
  address             text,
  registration_status text DEFAULT 'minimal' 
                        CHECK (registration_status IN ('minimal','full')),
  registered_by       uuid REFERENCES public.profiles(id),
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX patients_hospital_idx ON public.patients(hospital_id);
CREATE INDEX patients_number_idx ON public.patients(patient_number);
CREATE INDEX patients_phone_idx ON public.patients(phone);
CREATE INDEX patients_national_id_idx ON public.patients(national_id);
CREATE INDEX patients_name_idx ON public.patients(last_name, first_name);

-- Full text search index for patient search
CREATE INDEX patients_search_idx ON public.patients
  USING gin(
    to_tsvector('simple', 
      coalesce(first_name,'') || ' ' || 
      coalesce(last_name,'') || ' ' || 
      coalesce(middle_name,'')
    )
  );

-- Audit trigger
CREATE TRIGGER patients_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- RLS
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patients_select" ON public.patients
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "patients_insert" ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('patients.add')
  );

CREATE POLICY "patients_update" ON public.patients
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('patients.edit')
  );

-- ============================================================
-- PATIENT NUMBER GENERATION TRIGGER
-- Fires BEFORE INSERT, generates formatted patient number
-- Format: P-YYYY-00001
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_patient_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.patient_number IS NULL THEN
    NEW.patient_number := public.generate_sequence_number(
      NEW.hospital_id, 
      'patient'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER patients_generate_number
  BEFORE INSERT ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.generate_patient_number();

-- ============================================================
-- PATIENT CONTACTS
-- ============================================================

CREATE TABLE public.patient_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  name        text NOT NULL,
  relationship text,
  phone       text NOT NULL,
  is_primary  boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX patient_contacts_patient_idx ON public.patient_contacts(patient_id);

-- RLS
ALTER TABLE public.patient_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_contacts_select" ON public.patient_contacts
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "patient_contacts_insert" ON public.patient_contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('patients.edit')
  );

CREATE POLICY "patient_contacts_update" ON public.patient_contacts
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('patients.edit')
  );

CREATE POLICY "patient_contacts_delete" ON public.patient_contacts
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('patients.edit')
  );

-- ============================================================
-- PATIENT ALLERGIES
-- ============================================================

CREATE TABLE public.patient_allergies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  hospital_id  uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  allergy_type text NOT NULL CHECK (allergy_type IN ('drug','environmental')),
  drug_id      uuid, -- FK added in Phase 6 when drug_formulary is created
  description  text,
  severity     text CHECK (severity IN ('mild','moderate','severe')),
  recorded_by  uuid REFERENCES public.profiles(id),
  recorded_at  timestamptz DEFAULT now()
);

CREATE INDEX patient_allergies_patient_idx ON public.patient_allergies(patient_id);

-- Audit trigger
CREATE TRIGGER patient_allergies_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.patient_allergies
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- RLS
ALTER TABLE public.patient_allergies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_allergies_select" ON public.patient_allergies
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "patient_allergies_insert" ON public.patient_allergies
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('patients.edit')
  );

CREATE POLICY "patient_allergies_update" ON public.patient_allergies
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('patients.edit')
  );

CREATE POLICY "patient_allergies_delete" ON public.patient_allergies
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('patients.edit')
  );

-- ============================================================
-- PATIENT FILES
-- (scanned documents, referral letters, external records)
-- ============================================================

CREATE TABLE public.patient_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  hospital_id  uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  file_name    text NOT NULL,
  file_url     text NOT NULL,
  file_type    text CHECK (file_type IN ('pdf','image','document','other')),
  description  text,
  uploaded_by  uuid REFERENCES public.profiles(id),
  uploaded_at  timestamptz DEFAULT now()
);

CREATE INDEX patient_files_patient_idx ON public.patient_files(patient_id);

-- RLS
ALTER TABLE public.patient_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_files_select" ON public.patient_files
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "patient_files_insert" ON public.patient_files
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('patients.edit')
  );

CREATE POLICY "patient_files_delete" ON public.patient_files
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('patients.edit')
  );