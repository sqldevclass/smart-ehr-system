-- Migration 031: Laboratory Workflow
-- lab_parameter_templates, lab_samples, lab_results

-- ============================================================
-- LAB PARAMETER TEMPLATES
-- Defines expected parameters for each lab service
-- Set up by admin per service in the service catalog
-- ============================================================

CREATE TABLE public.lab_parameter_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id      uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  hospital_id     uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  name            text NOT NULL,
  unit            text,
  ref_min_male    numeric(10,4),
  ref_max_male    numeric(10,4),
  ref_min_female  numeric(10,4),
  ref_max_female  numeric(10,4),
  ref_min_child   numeric(10,4),
  ref_max_child   numeric(10,4),
  critical_min    numeric(10,4),
  critical_max    numeric(10,4),
  sort_order      int DEFAULT 0,
  is_active       boolean DEFAULT true,
  UNIQUE (service_id, name)
);

CREATE INDEX lab_param_templates_service_idx 
  ON public.lab_parameter_templates(service_id);
CREATE INDEX lab_param_templates_hospital_idx 
  ON public.lab_parameter_templates(hospital_id);

ALTER TABLE public.lab_parameter_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lab_param_templates_select" ON public.lab_parameter_templates
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "lab_param_templates_insert" ON public.lab_parameter_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

CREATE POLICY "lab_param_templates_update" ON public.lab_parameter_templates
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

CREATE POLICY "lab_param_templates_delete" ON public.lab_parameter_templates
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

-- ============================================================
-- LAB SAMPLES
-- One row per drawn blood/urine/other sample
-- Created when blood draw nurse processes the service
-- ============================================================

CREATE TABLE public.lab_samples (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_service_id uuid NOT NULL REFERENCES public.visit_services(id) ON DELETE CASCADE,
  patient_id       uuid NOT NULL REFERENCES public.patients(id),
  hospital_id      uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  barcode          text NOT NULL,
  status           text NOT NULL DEFAULT 'drawn'
                     CHECK (status IN ('drawn','in_progress','completed')),
  drawn_by         uuid REFERENCES public.profiles(id),
  drawn_at         timestamptz DEFAULT now(),
  completed_at     timestamptz,
  notes            text,
  UNIQUE (hospital_id, barcode)
);

CREATE INDEX lab_samples_hospital_idx ON public.lab_samples(hospital_id);
CREATE INDEX lab_samples_patient_idx ON public.lab_samples(patient_id);
CREATE INDEX lab_samples_barcode_idx ON public.lab_samples(barcode);
CREATE INDEX lab_samples_visit_service_idx ON public.lab_samples(visit_service_id);

-- Enable Realtime for lab workflow
ALTER PUBLICATION supabase_realtime ADD TABLE public.lab_samples;

ALTER TABLE public.lab_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lab_samples_select" ON public.lab_samples
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "lab_samples_insert" ON public.lab_samples
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('services.status_forward')
  );

CREATE POLICY "lab_samples_update" ON public.lab_samples
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('services.status_forward')
  );

-- ============================================================
-- LAB RESULTS
-- One row per parameter per sample
-- Populated by lab physician manually or by analyzer
-- ============================================================

CREATE TABLE public.lab_results (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_sample_id           uuid NOT NULL REFERENCES public.lab_samples(id) ON DELETE CASCADE,
  hospital_id             uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  parameter_template_id   uuid REFERENCES public.lab_parameter_templates(id),
  parameter_name          text NOT NULL,
  value                   text,
  unit                    text,
  ref_min                 numeric(10,4),
  ref_max                 numeric(10,4),
  critical_min            numeric(10,4),
  critical_max            numeric(10,4),
  flag                    text DEFAULT 'pending'
                            CHECK (flag IN (
                              'pending','normal','high','low',
                              'critical_high','critical_low'
                            )),
  source                  text DEFAULT 'manual'
                            CHECK (source IN ('manual','analyzer')),
  confirmed_by            uuid REFERENCES public.profiles(id),
  confirmed_at            timestamptz,
  created_at              timestamptz DEFAULT now()
);

CREATE INDEX lab_results_sample_idx ON public.lab_results(lab_sample_id);
CREATE INDEX lab_results_hospital_idx ON public.lab_results(hospital_id);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lab_results;

ALTER TABLE public.lab_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lab_results_select" ON public.lab_results
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "lab_results_insert" ON public.lab_results
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('services.status_forward')
  );

CREATE POLICY "lab_results_update" ON public.lab_results
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('services.status_forward')
  );

-- ============================================================
-- Auto-flag function
-- Called after inserting/updating a lab_result value
-- Sets flag based on value vs reference ranges
-- ============================================================

CREATE OR REPLACE FUNCTION public.compute_lab_flag(
  p_value    text,
  p_ref_min  numeric,
  p_ref_max  numeric,
  p_crit_min numeric,
  p_crit_max numeric
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_numeric numeric;
BEGIN
  -- Try to parse value as numeric
  BEGIN
    v_numeric := p_value::numeric;
  EXCEPTION WHEN OTHERS THEN
    RETURN 'normal'; -- non-numeric values (e.g. "positive") treated as normal
  END;

  -- Check critical thresholds first
  IF p_crit_min IS NOT NULL AND v_numeric < p_crit_min THEN
    RETURN 'critical_low';
  END IF;
  IF p_crit_max IS NOT NULL AND v_numeric > p_crit_max THEN
    RETURN 'critical_high';
  END IF;

  -- Check normal thresholds
  IF p_ref_min IS NOT NULL AND v_numeric < p_ref_min THEN
    RETURN 'low';
  END IF;
  IF p_ref_max IS NOT NULL AND v_numeric > p_ref_max THEN
    RETURN 'high';
  END IF;

  RETURN 'normal';
END;
$$;

-- Trigger to auto-compute flag when value is set
CREATE OR REPLACE FUNCTION public.lab_result_auto_flag()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.value IS NOT NULL THEN
    NEW.flag := public.compute_lab_flag(
      NEW.value,
      NEW.ref_min,
      NEW.ref_max,
      NEW.critical_min,
      NEW.critical_max
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lab_results_auto_flag
  BEFORE INSERT OR UPDATE OF value, ref_min, ref_max, critical_min, critical_max
  ON public.lab_results
  FOR EACH ROW EXECUTE FUNCTION public.lab_result_auto_flag();