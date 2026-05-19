-- Add shelf_life_days to drug_formulary
ALTER TABLE public.drug_formulary
  ADD COLUMN IF NOT EXISTS shelf_life_days integer
    CONSTRAINT chk_shelf_life_positive CHECK (shelf_life_days IS NULL OR shelf_life_days > 0);

-- Create drug_interactions
CREATE TABLE public.drug_interactions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id             uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  drug_a_id               uuid NOT NULL REFERENCES public.drug_formulary(id) ON DELETE CASCADE,
  drug_b_id               uuid NOT NULL REFERENCES public.drug_formulary(id) ON DELETE CASCADE,
  clinical_effect         text,
  clinical_significance   text,
  actions_recommendations text,
  created_at              timestamptz DEFAULT now(),
  CONSTRAINT no_self_interaction CHECK (drug_a_id != drug_b_id),
  CONSTRAINT canonical_order     CHECK (drug_a_id < drug_b_id),
  UNIQUE (hospital_id, drug_a_id, drug_b_id)
);

CREATE INDEX drug_interactions_hospital_idx ON public.drug_interactions(hospital_id);
CREATE INDEX drug_interactions_drug_a_idx   ON public.drug_interactions(drug_a_id);
CREATE INDEX drug_interactions_drug_b_idx   ON public.drug_interactions(drug_b_id);

ALTER TABLE public.drug_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drug_interactions_select" ON public.drug_interactions
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "drug_interactions_insert" ON public.drug_interactions
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('warehouse.receive_incoming')
  );

CREATE POLICY "drug_interactions_update" ON public.drug_interactions
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('warehouse.receive_incoming')
  );

CREATE POLICY "drug_interactions_delete" ON public.drug_interactions
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('warehouse.receive_incoming')
  );