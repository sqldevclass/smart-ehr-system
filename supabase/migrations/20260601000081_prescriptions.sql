-- Migration 081: Drug Prescriptions Schema
-- drug_formulary_products junction, drug_prescriptions,
-- drug_administration_slots, physician_favorites
-- RPCs: submit_prescriptions, update_prescription_status

-- ============================================================
-- 1. LINK DRUG FORMULARY TO PRODUCTS (many-to-many)
-- ============================================================
CREATE TABLE public.drug_formulary_products (
  id                uuid PRIMARY KEY
    DEFAULT gen_random_uuid(),
  drug_formulary_id uuid NOT NULL
    REFERENCES public.drug_formulary(id)
    ON DELETE CASCADE,
  product_id        uuid NOT NULL
    REFERENCES public.products(id)
    ON DELETE CASCADE,
  is_preferred      boolean DEFAULT false,
    -- preferred product to dispense for this drug
  created_at        timestamptz DEFAULT now(),
  UNIQUE (drug_formulary_id, product_id)
);

CREATE INDEX drug_formulary_products_drug_idx
  ON public.drug_formulary_products(drug_formulary_id);
CREATE INDEX drug_formulary_products_product_idx
  ON public.drug_formulary_products(product_id);

ALTER TABLE public.drug_formulary_products
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drug_formulary_products_select"
  ON public.drug_formulary_products
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.drug_formulary df
    WHERE df.id = drug_formulary_id
      AND df.hospital_id =
        public.get_my_hospital_id()
  ));

CREATE POLICY "drug_formulary_products_insert"
  ON public.drug_formulary_products
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.drug_formulary df
    WHERE df.id = drug_formulary_id
      AND df.hospital_id =
        public.get_my_hospital_id()
  ));

-- ============================================================
-- 2. DRUG PRESCRIPTIONS
-- One row per drug per patient
-- ============================================================
CREATE TABLE public.drug_prescriptions (
  id                    uuid PRIMARY KEY
    DEFAULT gen_random_uuid(),
  hospital_id           uuid NOT NULL
    REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  hospitalization_id    uuid NOT NULL
    REFERENCES public.hospitalizations(id)
    ON DELETE CASCADE,
  patient_id            uuid NOT NULL
    REFERENCES public.patients(id)
    ON DELETE CASCADE,
  physician_id          uuid NOT NULL
    REFERENCES public.profiles(id)
    ON DELETE RESTRICT,

  drug_formulary_id     uuid NOT NULL
    REFERENCES public.drug_formulary(id)
    ON DELETE RESTRICT,

  -- Dosing
  dose                  text NOT NULL,
  dose_unit             text,

  -- Route of administration
  -- per_os | iv_bolus | iv_drip | im | sc |
  -- nasal | rectal | nasogastric | sublingual |
  -- ear | eye | vaginal | epidural |
  -- transdermal | intrathecal | intraosseous |
  -- endotracheal | other
  route                 text NOT NULL,

  -- Schedule: array of times e.g. ['08:00','20:00']
  schedule_times        text[] NOT NULL DEFAULT '{}',

  -- Duration
  duration_days         integer,

  -- Food rule
  -- any | before_meal | during_meal |
  -- after_meal | before_sleep | fasting
  food_rule             text DEFAULT 'any',

  -- Mixing with another drug
  mix_with_drug_id      uuid
    REFERENCES public.drug_formulary(id)
    ON DELETE SET NULL,

  -- Type
  -- regular | prn | antibiotic_prophylaxis
  prescription_type     text NOT NULL
    DEFAULT 'regular'
    CHECK (prescription_type IN (
      'regular', 'prn',
      'antibiotic_prophylaxis'
    )),

  -- PRN condition (text, only for prn type)
  prn_condition         text,

  notes                 text,

  -- Draft: true = not yet sent to pharmacy
  -- false = submitted ("Заказывать" clicked)
  is_drafted            boolean DEFAULT true,

  -- Status
  status_code           text NOT NULL
    DEFAULT 'preliminary'
    REFERENCES public.medication_order_statuses(code)
    ON UPDATE CASCADE,
  status_changed_at     timestamptz,
  status_changed_by     uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,

  -- Audit
  prescribed_at         timestamptz
    DEFAULT now(),
  prescribed_by         uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  cancelled_at          timestamptz,
  cancelled_by          uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,

  created_at            timestamptz DEFAULT now()
);

CREATE INDEX drug_prescriptions_hosp_idx
  ON public.drug_prescriptions(hospitalization_id);
CREATE INDEX drug_prescriptions_patient_idx
  ON public.drug_prescriptions(patient_id);
CREATE INDEX drug_prescriptions_status_idx
  ON public.drug_prescriptions(
    hospital_id, status_code);
CREATE INDEX drug_prescriptions_drafted_idx
  ON public.drug_prescriptions(
    hospitalization_id, is_drafted);

ALTER TABLE public.drug_prescriptions
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drug_prescriptions_select"
  ON public.drug_prescriptions
  FOR SELECT TO authenticated
  USING (hospital_id =
    public.get_my_hospital_id());

CREATE POLICY "drug_prescriptions_insert"
  ON public.drug_prescriptions
  FOR INSERT TO authenticated
  WITH CHECK (hospital_id =
    public.get_my_hospital_id());

CREATE POLICY "drug_prescriptions_update"
  ON public.drug_prescriptions
  FOR UPDATE TO authenticated
  USING (hospital_id =
    public.get_my_hospital_id())
  WITH CHECK (hospital_id =
    public.get_my_hospital_id());

-- ============================================================
-- 3. DRUG ADMINISTRATION SLOTS
-- Generated from schedule_times × duration_days
-- ============================================================
CREATE TABLE public.drug_administration_slots (
  id                    uuid PRIMARY KEY
    DEFAULT gen_random_uuid(),
  prescription_id       uuid NOT NULL
    REFERENCES public.drug_prescriptions(id)
    ON DELETE CASCADE,
  hospital_id           uuid NOT NULL
    REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  hospitalization_id    uuid NOT NULL
    REFERENCES public.hospitalizations(id)
    ON DELETE CASCADE,
  patient_id            uuid NOT NULL
    REFERENCES public.patients(id)
    ON DELETE CASCADE,

  scheduled_at          timestamptz NOT NULL,

  -- Administration record
  administered_at       timestamptz,
  administered_by       uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  dose_given            text,

  -- pending | done | skipped
  status                text NOT NULL
    DEFAULT 'pending'
    CHECK (status IN ('pending', 'done',
      'skipped')),

  notes                 text,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX drug_admin_slots_prescription_idx
  ON public.drug_administration_slots(
    prescription_id);
CREATE INDEX drug_admin_slots_hosp_idx
  ON public.drug_administration_slots(
    hospitalization_id);
CREATE INDEX drug_admin_slots_scheduled_idx
  ON public.drug_administration_slots(
    hospital_id, scheduled_at);

ALTER TABLE public.drug_administration_slots
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drug_admin_slots_select"
  ON public.drug_administration_slots
  FOR SELECT TO authenticated
  USING (hospital_id =
    public.get_my_hospital_id());

CREATE POLICY "drug_admin_slots_insert"
  ON public.drug_administration_slots
  FOR INSERT TO authenticated
  WITH CHECK (hospital_id =
    public.get_my_hospital_id());

CREATE POLICY "drug_admin_slots_update"
  ON public.drug_administration_slots
  FOR UPDATE TO authenticated
  USING (hospital_id =
    public.get_my_hospital_id())
  WITH CHECK (hospital_id =
    public.get_my_hospital_id());

-- ============================================================
-- 4. PHYSICIAN FAVORITES
-- Per-physician frequently used drugs
-- ============================================================
CREATE TABLE public.physician_favorites (
  id                uuid PRIMARY KEY
    DEFAULT gen_random_uuid(),
  physician_id      uuid NOT NULL
    REFERENCES public.profiles(id)
    ON DELETE CASCADE,
  drug_formulary_id uuid NOT NULL
    REFERENCES public.drug_formulary(id)
    ON DELETE CASCADE,
  use_count         integer NOT NULL DEFAULT 1,
  last_used_at      timestamptz DEFAULT now(),
  UNIQUE (physician_id, drug_formulary_id)
);

CREATE INDEX physician_favorites_physician_idx
  ON public.physician_favorites(
    physician_id, use_count DESC);

ALTER TABLE public.physician_favorites
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "physician_favorites_select"
  ON public.physician_favorites
  FOR SELECT TO authenticated
  USING (physician_id = auth.uid());

CREATE POLICY "physician_favorites_insert"
  ON public.physician_favorites
  FOR INSERT TO authenticated
  WITH CHECK (physician_id = auth.uid());

CREATE POLICY "physician_favorites_update"
  ON public.physician_favorites
  FOR UPDATE TO authenticated
  USING (physician_id = auth.uid())
  WITH CHECK (physician_id = auth.uid());

-- ============================================================
-- 5. RPC: submit_prescriptions
-- Physician clicks "Заказывать"
-- Sets all drafted prescriptions to preliminary
-- Generates administration slots
-- Updates physician favorites
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_prescriptions(
  p_hospitalization_id  uuid,
  p_hospital_id         uuid,
  p_physician_id        uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id     uuid;
  v_prescription  record;
  v_slot_time     text;
  v_slot_at       timestamptz;
  v_day           integer;
  v_count         integer := 0;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Process each drafted prescription
  FOR v_prescription IN
    SELECT id, drug_formulary_id,
      schedule_times, duration_days,
      prescribed_at
    FROM public.drug_prescriptions
    WHERE hospitalization_id =
        p_hospitalization_id
      AND hospital_id = p_hospital_id
      AND is_drafted = true
  LOOP
    -- Mark as submitted + preliminary
    UPDATE public.drug_prescriptions
    SET
      is_drafted        = false,
      status_code       = 'preliminary',
      status_changed_at = now(),
      status_changed_by = v_caller_id
    WHERE id = v_prescription.id;

    -- Generate administration slots
    -- For each day in duration × each time
    IF v_prescription.schedule_times IS NOT NULL
      AND array_length(
        v_prescription.schedule_times, 1) > 0
      AND v_prescription.duration_days IS NOT NULL
    THEN
      FOR v_day IN 0..
          (v_prescription.duration_days - 1)
      LOOP
        FOREACH v_slot_time IN ARRAY
          v_prescription.schedule_times
        LOOP
          -- Parse HH:MM into timestamptz
          v_slot_at := (
            date_trunc('day',
              v_prescription.prescribed_at)
            + v_day * interval '1 day'
            + v_slot_time::interval
          );

          INSERT INTO public.drug_administration_slots
            (prescription_id, hospital_id,
             hospitalization_id, patient_id,
             scheduled_at, status)
          SELECT
            v_prescription.id,
            p_hospital_id,
            p_hospitalization_id,
            patient_id,
            v_slot_at,
            'pending'
          FROM public.drug_prescriptions
          WHERE id = v_prescription.id;

        END LOOP;
      END LOOP;
    END IF;

    -- Update physician favorites
    INSERT INTO public.physician_favorites
      (physician_id, drug_formulary_id,
       use_count, last_used_at)
    VALUES
      (v_caller_id,
       v_prescription.drug_formulary_id,
       1, now())
    ON CONFLICT (physician_id, drug_formulary_id)
    DO UPDATE SET
      use_count    = physician_favorites.use_count + 1,
      last_used_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'submitted_count', v_count,
    'success', true
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION
      'submit_prescriptions failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- 6. RPC: update_prescription_status
-- Role-aware status transition
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_prescription_status(
  p_prescription_id uuid,
  p_new_status      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id     uuid;
  v_hospital_id   uuid;
  v_prescription  record;
  v_caller_roles  text[];
BEGIN
  v_caller_id   := auth.uid();
  v_hospital_id := public.get_my_hospital_id();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Get caller roles
  SELECT array_agg(r.code)
  INTO v_caller_roles
  FROM public.profile_roles pr
  JOIN public.roles r ON r.id = pr.role_id
  WHERE pr.profile_id = v_caller_id;

  -- Get prescription
  SELECT * INTO v_prescription
  FROM public.drug_prescriptions
  WHERE id = p_prescription_id
    AND hospital_id = v_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prescription not found';
  END IF;

  -- Validate role-based transitions
  -- Physician: preliminary → cancelled only
  -- Pharmacist: preliminary → in_progress
  --             return → returned_accepted
  -- Nurse: in_progress → ready_for_execution
  --        ready_for_execution → completed
  --        ready_for_execution → return

  IF p_new_status = 'cancelled' THEN
    IF NOT ('physician' = ANY(v_caller_roles)) THEN
      RAISE EXCEPTION
        'Only physicians can cancel prescriptions';
    END IF;

  ELSIF p_new_status = 'in_progress' THEN
    IF NOT ('pharmacist' = ANY(v_caller_roles)) THEN
      RAISE EXCEPTION
        'Only pharmacists can set in_progress';
    END IF;
    IF v_prescription.status_code !=
        'preliminary' THEN
      RAISE EXCEPTION
        'Can only move to in_progress from preliminary';
    END IF;

  ELSIF p_new_status = 'returned_accepted' THEN
    IF NOT ('pharmacist' = ANY(v_caller_roles)) THEN
      RAISE EXCEPTION
        'Only pharmacists can accept returns';
    END IF;
    IF v_prescription.status_code != 'return' THEN
      RAISE EXCEPTION
        'Can only accept returns from return status';
    END IF;

  ELSIF p_new_status = 'ready_for_execution' THEN
    IF NOT ('inpatient_nurse' = ANY(v_caller_roles)
        OR 'head_nurse' = ANY(v_caller_roles)) THEN
      RAISE EXCEPTION
        'Only nurses can set ready_for_execution';
    END IF;
    IF v_prescription.status_code !=
        'in_progress' THEN
      RAISE EXCEPTION
        'Can only move to ready_for_execution '
        'from in_progress';
    END IF;

  ELSIF p_new_status = 'completed' THEN
    IF NOT ('inpatient_nurse' = ANY(v_caller_roles)
        OR 'head_nurse' = ANY(v_caller_roles)) THEN
      RAISE EXCEPTION
        'Only nurses can complete prescriptions';
    END IF;
    IF v_prescription.status_code !=
        'ready_for_execution' THEN
      RAISE EXCEPTION
        'Can only complete from ready_for_execution';
    END IF;

  ELSIF p_new_status = 'return' THEN
    IF NOT ('inpatient_nurse' = ANY(v_caller_roles)
        OR 'head_nurse' = ANY(v_caller_roles)) THEN
      RAISE EXCEPTION
        'Only nurses can initiate returns';
    END IF;
    IF v_prescription.status_code !=
        'ready_for_execution' THEN
      RAISE EXCEPTION
        'Can only return from ready_for_execution';
    END IF;

  ELSE
    RAISE EXCEPTION
      'Invalid status transition: %', p_new_status;
  END IF;

  -- Apply status change
  UPDATE public.drug_prescriptions
  SET
    status_code       = p_new_status,
    status_changed_at = now(),
    status_changed_by = v_caller_id,
    cancelled_at = CASE
      WHEN p_new_status = 'cancelled'
        THEN now() ELSE cancelled_at END,
    cancelled_by = CASE
      WHEN p_new_status = 'cancelled'
        THEN v_caller_id ELSE cancelled_by END
  WHERE id = p_prescription_id;

  RETURN jsonb_build_object(
    'success',     true,
    'new_status',  p_new_status,
    'changed_at',  now()
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION
      'update_prescription_status failed: %',
      SQLERRM;
END;
$$;
