-- Migration 075: Clinical Alerts Framework + Paediatric Sepsis 6
-- Generic alert table for all future clinical decision support alerts
-- Paediatric Sepsis 6 is the first alert type

-- ============================================================
-- 1. CLINICAL ALERTS TABLE
-- ============================================================
CREATE TABLE public.clinical_alerts (
  id                      uuid PRIMARY KEY
    DEFAULT gen_random_uuid(),
  hospital_id             uuid NOT NULL
    REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  hospitalization_id      uuid NOT NULL
    REFERENCES public.hospitalizations(id)
    ON DELETE CASCADE,
  patient_id              uuid NOT NULL
    REFERENCES public.patients(id)
    ON DELETE CASCADE,

  -- Alert type — extensible for future alert types
  -- Current: 'paediatric_sepsis_6'
  -- Future:  'adult_sepsis', 'deterioration', etc.
  alert_type              text NOT NULL,

  -- What EWS reading triggered this alert
  triggered_by_reading_id uuid
    REFERENCES public.ews_readings(id)
    ON DELETE SET NULL,

  triggered_at            timestamptz NOT NULL
    DEFAULT now(),

  -- Which signs were present e.g.
  -- ["temperature","tachycardia","poor_perfusion"]
  trigger_signs           jsonb NOT NULL
    DEFAULT '[]'::jsonb,

  -- Acknowledgment
  acknowledged_at         timestamptz,
  acknowledged_by         uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,

  -- Active = unacknowledged alert
  -- false = acknowledged (history only)
  is_active               boolean DEFAULT true,

  created_at              timestamptz DEFAULT now()
);

CREATE INDEX clinical_alerts_hospitalization_idx
  ON public.clinical_alerts(hospitalization_id);

CREATE INDEX clinical_alerts_patient_idx
  ON public.clinical_alerts(patient_id);

-- Partial index for fast active alert lookups
CREATE INDEX clinical_alerts_active_idx
  ON public.clinical_alerts(hospitalization_id, is_active)
  WHERE is_active = true;

CREATE INDEX clinical_alerts_triggered_at_idx
  ON public.clinical_alerts(
    hospitalization_id, triggered_at DESC);

-- ============================================================
-- 2. RLS POLICIES
-- ============================================================
ALTER TABLE public.clinical_alerts
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinical_alerts_select"
  ON public.clinical_alerts
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "clinical_alerts_insert"
  ON public.clinical_alerts
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
  );

-- Acknowledge only — no full updates
CREATE POLICY "clinical_alerts_update"
  ON public.clinical_alerts
  FOR UPDATE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND is_active = true
  )
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
  );

-- No DELETE — alerts are permanent history

-- ============================================================
-- 3. ADD INFECTION FLAG TO HOSPITALIZATIONS
-- ============================================================
ALTER TABLE public.hospitalizations
  ADD COLUMN IF NOT EXISTS suspected_infection
    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspected_infection_set_by
    uuid REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspected_infection_set_at
    timestamptz;

-- ============================================================
-- 4. ACKNOWLEDGE ALERT RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.acknowledge_clinical_alert(
  p_alert_id    uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   uuid;
  v_hospital_id uuid;
BEGIN
  v_caller_id   := auth.uid();
  v_hospital_id := public.get_my_hospital_id();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.clinical_alerts
  SET
    acknowledged_at = now(),
    acknowledged_by = v_caller_id,
    is_active       = false
  WHERE id          = p_alert_id
    AND hospital_id = v_hospital_id
    AND is_active   = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Alert not found or already acknowledged';
  END IF;

  RETURN jsonb_build_object(
    'success',          true,
    'acknowledged_at',  now(),
    'acknowledged_by',  v_caller_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION
      'acknowledge_clinical_alert failed: %',
      SQLERRM;
END;
$$;
