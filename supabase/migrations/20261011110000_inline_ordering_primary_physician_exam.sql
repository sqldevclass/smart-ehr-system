-- =========================================================================
-- Первичный осмотр врача (primary_physician_exam) -- inline ordering in
-- План лечения. Scoped to this document type only, per explicit
-- confirmation: other document types keep today's read-only
-- AssignmentsSection behavior untouched.
-- =========================================================================

-- ---- 1) Remove the 3 free-text placeholder fields, replaced by real
--      service ordering. tx.lab_diagnostics and tx.prescription are
--      shared with other document types -- hide scoped to this document
--      type's own row only. tx.specialist_consult is used only here. ----
update document_type_fields set is_visible = false
where id in (
  '2a73273c-d24a-4e6f-944a-6e30be7828c1', -- tx.lab_diagnostics
  'cef6c2c4-f4ce-4db3-834a-ecfd4851753f', -- tx.specialist_consult
  '0b497bbe-6192-4a7d-aad8-ac993f954f7e'  -- tx.prescription
);

-- ---- 2) Tag orders with the document they were placed from, so a
--      document can show only its own orders while the general
--      Инструментальные/Лаборатория/Консультация/Уход tabs keep showing
--      everything regardless of origin. ----
alter table public.visit_services
  add column if not exists source_document_id uuid references public.patient_documents(id);

alter table public.hospitalization_orders
  add column if not exists source_document_id uuid references public.patient_documents(id);

-- ---- 3) Extend the two ordering RPCs with a new optional parameter.
--      Appending a DEFAULT NULL parameter is backward compatible --
--      existing callers (the general tabs) keep working unchanged and
--      leave orders untagged. ----
create or replace function public.inpatient_order_service(
  p_hospitalization_id uuid,
  p_patient_id uuid,
  p_hospital_id uuid,
  p_service_id uuid,
  p_ordered_by uuid,
  p_assigned_staff_role_id uuid default null::uuid,
  p_source_document_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    status_id, source, cost_at_time, created_by,
    source_document_id
  ) VALUES (
    NULL, p_patient_id, p_hospital_id, p_hospitalization_id,
    p_service_id, p_assigned_staff_role_id,
    v_preliminary_status, 'physician', v_cost, p_ordered_by,
    p_source_document_id
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
$function$;

create or replace function public.physician_order_services(
  p_patient_id uuid,
  p_hospital_id uuid,
  p_ordered_by uuid,
  p_services jsonb,
  p_source_visit_service_id uuid default null::uuid,
  p_source_document_id uuid default null::uuid
)
returns uuid[]
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      ordered_from_visit_service_id, source_document_id
    ) VALUES (
      NULL, p_patient_id, p_hospital_id,
      (v_item->>'service_id')::uuid,
      NULL,
      v_preliminary, 'physician',
      (v_item->>'cost_at_time')::numeric,
      p_ordered_by,
      p_source_visit_service_id, p_source_document_id
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
$function$;
