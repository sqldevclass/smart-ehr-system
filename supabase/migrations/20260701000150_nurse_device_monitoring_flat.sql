-- Migration 150: Replace device monitoring framework with a single
-- flat table, matching the wound_monitoring_records pattern.
--
-- Migration 149 built a 5-table generalized framework (types,
-- criteria, device instances, entries, responses) plus a custom
-- RPC. That does not match how nurse forms are actually built in
-- this system (see wound_monitoring_records, migration 146) and
-- has no UI or data on top of it yet, so it's safe to drop outright
-- rather than migrate data.

-- ============================================================
-- 1. DROP — children first, then parents, then the RPC.
--    IF EXISTS + CASCADE on each so this is safe to re-run and
--    order-independent (CASCADE clears dependent FKs/policies/
--    indexes automatically; it does not drop sibling tables).
-- ============================================================
DROP FUNCTION IF EXISTS public.submit_device_monitoring_entry(uuid, uuid, jsonb, text) CASCADE;

DROP TABLE IF EXISTS public.device_monitoring_entry_responses CASCADE;
DROP TABLE IF EXISTS public.device_monitoring_entries          CASCADE;
DROP TABLE IF EXISTS public.patient_device_monitors             CASCADE;
DROP TABLE IF EXISTS public.device_monitoring_criteria          CASCADE;
DROP TABLE IF EXISTS public.device_monitoring_types             CASCADE;

-- ============================================================
-- 2. CREATE — one flat table, four form types, jsonb criteria.
--    Structural clone of wound_monitoring_records.
-- ============================================================
CREATE TABLE public.nurse_device_monitoring_records (
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

  form_type           text NOT NULL
    CHECK (form_type IN (
      'cvc', 'tracheostomy',
      'ventilator', 'urinary_catheter'
    )),

  -- Site/location, e.g. "яремная вена" for CVC. Disambiguates
  -- multiple concurrent devices on one patient — same role as
  -- wound_location on wound_monitoring_records.
  device_label         text,

  inserted_at           date,
  removed_at            date,

  -- Criteria answers for this form_type, e.g.
  -- {"cvc_1": true, "cvc_2": false, "cvc_5": true}.
  -- Criteria labels/order/escalation flags live client-side,
  -- same way AssessmentSection hardcodes per-scaleCode logic.
  responses             jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Set client-side when a flagged criterion (e.g. CVC #5) is
  -- answered "yes". Same field name/pattern as
  -- patient_documents.criticality_flag.
  criticality_flag       boolean NOT NULL DEFAULT false,

  notes                  text,

  recorded_by             uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  recorded_at             timestamptz NOT NULL
    DEFAULT now(),

  -- Second sign-off (epidemiologist on the source forms). No role
  -- constraint — 'epidemiologist' is not a defined staff_role/
  -- job_position in this system yet. TODO(backlog): once that
  -- role exists, add a CHECK/trigger enforcing verified_by
  -- resolves to a staff member holding it. Until then this is any
  -- authenticated profile, enforced only as a client-side warning.
  verified_by              uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,
  verified_at              timestamptz,

  created_at               timestamptz DEFAULT now()
);

CREATE INDEX nurse_device_monitoring_hosp_idx
  ON public.nurse_device_monitoring_records(hospitalization_id);

CREATE INDEX nurse_device_monitoring_recorded_at_idx
  ON public.nurse_device_monitoring_records(hospitalization_id, recorded_at DESC);

-- Supports "history per device" — filtering by type + label
-- within a hospitalization, same role as wound's location index.
CREATE INDEX nurse_device_monitoring_type_label_idx
  ON public.nurse_device_monitoring_records(hospitalization_id, form_type, device_label);

ALTER TABLE public.nurse_device_monitoring_records
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nurse_device_monitoring_select"
  ON public.nurse_device_monitoring_records
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "nurse_device_monitoring_insert"
  ON public.nurse_device_monitoring_records
  FOR INSERT TO authenticated
  WITH CHECK (hospital_id = public.get_my_hospital_id());
