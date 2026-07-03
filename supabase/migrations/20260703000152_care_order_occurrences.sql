-- Migration 152: Structured scheduling for Уход (care) orders.
-- Diet/activity_mode orders are unaffected — this only applies to
-- order_type = 'care'.
--
-- Mirrors the existing drug_administration_slots pattern: one
-- parent order (hospitalization_orders) generates N scheduled
-- occurrences, each independently completable by a nurse.

-- ============================================================
-- 1. surgical_context on the parent order — one value describing
--    the whole care instruction (not per-occurrence).
-- ============================================================
ALTER TABLE public.hospitalization_orders
  ADD COLUMN surgical_context text
    CHECK (surgical_context IN ('none', 'pre_op', 'post_op'));

-- ============================================================
-- 2. Scheduled occurrences — one row per day/time the physician
--    picks for a care order. Diet/activity_mode orders never get
--    rows here; they stay single-entry, exactly as today.
-- ============================================================
CREATE TABLE public.hospitalization_order_occurrences (
  id                  uuid PRIMARY KEY
    DEFAULT gen_random_uuid(),
  hospital_id         uuid NOT NULL
    REFERENCES public.hospitals(id)
    ON DELETE CASCADE,
  hospitalization_id  uuid NOT NULL
    REFERENCES public.hospitalizations(id)
    ON DELETE CASCADE,
  order_id            uuid NOT NULL
    REFERENCES public.hospitalization_orders(id)
    ON DELETE CASCADE,

  scheduled_at         timestamptz NOT NULL,

  status                text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done')),

  completed_at           timestamptz,
  completed_by             uuid
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,

  created_at               timestamptz DEFAULT now()
);

CREATE INDEX hosp_order_occurrences_order_idx
  ON public.hospitalization_order_occurrences(order_id, scheduled_at);

CREATE INDEX hosp_order_occurrences_hosp_idx
  ON public.hospitalization_order_occurrences(hospitalization_id, scheduled_at);

ALTER TABLE public.hospitalization_order_occurrences
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hosp_order_occurrences_select"
  ON public.hospitalization_order_occurrences
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "hosp_order_occurrences_insert"
  ON public.hospitalization_order_occurrences
  FOR INSERT TO authenticated
  WITH CHECK (hospital_id = public.get_my_hospital_id());

CREATE POLICY "hosp_order_occurrences_update"
  ON public.hospitalization_order_occurrences
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (hospital_id = public.get_my_hospital_id());
