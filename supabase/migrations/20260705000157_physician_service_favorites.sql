-- Migration 157: Make physician_favorites polymorphic so it can
-- track frequently-ordered lab services alongside drugs, rather
-- than creating a parallel physician_service_favorites table.
-- Exactly one of drug_formulary_id / service_id must be set per
-- row.

ALTER TABLE public.physician_favorites
  ALTER COLUMN drug_formulary_id DROP NOT NULL;

ALTER TABLE public.physician_favorites
  ADD COLUMN service_id uuid
    REFERENCES public.services(id)
    ON DELETE CASCADE;

ALTER TABLE public.physician_favorites
  ADD CONSTRAINT physician_favorites_exactly_one_item
  CHECK (num_nonnulls(drug_formulary_id, service_id) = 1);

-- The original UNIQUE (physician_id, drug_formulary_id) constraint
-- still works correctly with drug_formulary_id nullable (Postgres
-- treats each NULL as distinct), but partial unique indexes are
-- clearer and correctly scope uniqueness per item type.
ALTER TABLE public.physician_favorites
  DROP CONSTRAINT IF EXISTS physician_favorites_physician_id_drug_formulary_id_key;

CREATE UNIQUE INDEX physician_favorites_drug_uidx
  ON public.physician_favorites(physician_id, drug_formulary_id)
  WHERE drug_formulary_id IS NOT NULL;

CREATE UNIQUE INDEX physician_favorites_service_uidx
  ON public.physician_favorites(physician_id, service_id)
  WHERE service_id IS NOT NULL;

CREATE INDEX physician_favorites_service_idx
  ON public.physician_favorites(physician_id, use_count DESC)
  WHERE service_id IS NOT NULL;

-- ============================================================
-- Wire usage tracking into both service-ordering RPCs.
-- ============================================================

CREATE OR REPLACE FUNCTION public.physician_order_services(
  p_patient_id              uuid,
  p_hospital_id             uuid,
  p_ordered_by              uuid,
  p_services                jsonb,
  p_source_visit_service_id uuid DEFAULT NULL
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preliminary uuid;
  v_item        jsonb;
  v_vs_id       uuid;
  v_vs_ids      uuid[] := '{}';
BEGIN
  SELECT id INTO v_preliminary
  FROM public.service_statuses
  WHERE code = 'preliminary';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'preliminary status not found';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_services)
  LOOP
    INSERT INTO public.visit_services (
      visit_id, patient_id, hospital_id,
      service_id, assigned_staff_role_id,
      status_id, source, cost_at_time, created_by,
      ordered_from_visit_service_id
    ) VALUES (
      NULL, p_patient_id, p_hospital_id,
      (v_item->>'service_id')::uuid,
      NULL,
      v_preliminary, 'physician',
      (v_item->>'cost_at_time')::numeric,
      p_ordered_by,
      p_source_visit_service_id
    )
    RETURNING id INTO v_vs_id;

    v_vs_ids := array_append(v_vs_ids, v_vs_id);

    INSERT INTO public.physician_favorites
      (physician_id, service_id, use_count, last_used_at)
    VALUES
      (p_ordered_by, (v_item->>'service_id')::uuid, 1, now())
    ON CONFLICT (physician_id, service_id)
    WHERE service_id IS NOT NULL
    DO UPDATE SET
      use_count    = physician_favorites.use_count + 1,
      last_used_at = now();
  END LOOP;

  RETURN v_vs_ids;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'physician_order_services failed: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.inpatient_order_service(
  p_hospitalization_id     uuid,
  p_patient_id             uuid,
  p_hospital_id            uuid,
  p_service_id             uuid,
  p_ordered_by             uuid,
  p_assigned_staff_role_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id       uuid;
  v_vs_id            uuid;
  v_cost             numeric;
  v_preliminary_status uuid;
BEGIN
  SELECT id INTO v_preliminary_status
  FROM public.service_statuses
  WHERE code = 'preliminary';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'preliminary status not found';
  END IF;

  SELECT cost_with_vat INTO v_cost
  FROM public.services
  WHERE id = p_service_id AND hospital_id = p_hospital_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found: %', p_service_id;
  END IF;

  SELECT id INTO v_invoice_id
  FROM public.invoices
  WHERE hospitalization_id = p_hospitalization_id
    AND hospital_id = p_hospital_id
    AND status = 'active'
  LIMIT 1;

  IF v_invoice_id IS NULL THEN
    INSERT INTO public.invoices (hospitalization_id, hospital_id, created_by, status)
    VALUES (p_hospitalization_id, p_hospital_id, p_ordered_by, 'active')
    RETURNING id INTO v_invoice_id;
  END IF;

  INSERT INTO public.visit_services (
    visit_id, patient_id, hospital_id, hospitalization_id,
    service_id, assigned_staff_role_id,
    status_id, source, cost_at_time, created_by
  ) VALUES (
    NULL, p_patient_id, p_hospital_id, p_hospitalization_id,
    p_service_id, p_assigned_staff_role_id,
    v_preliminary_status, 'physician', v_cost, p_ordered_by
  )
  RETURNING id INTO v_vs_id;

  INSERT INTO public.invoice_items (invoice_id, visit_service_id, amount)
  VALUES (v_invoice_id, v_vs_id, v_cost);

  INSERT INTO public.physician_favorites
    (physician_id, service_id, use_count, last_used_at)
  VALUES
    (p_ordered_by, p_service_id, 1, now())
  ON CONFLICT (physician_id, service_id)
  WHERE service_id IS NOT NULL
  DO UPDATE SET
    use_count    = physician_favorites.use_count + 1,
    last_used_at = now();

  RETURN jsonb_build_object(
    'visit_service_id', v_vs_id,
    'invoice_id', v_invoice_id,
    'cost', v_cost
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'inpatient_order_service failed: %', SQLERRM;
END;
$$;
