-- Migration 168: data cleanup — Kaiser Test has its own hospital-
-- scoped "Инструментальные исследования" type (code = diagnostics),
-- which duplicates the global instrumental type. Move its groups
-- and services onto the global type, then remove the duplicate.

DO $$
DECLARE
  v_hospital_id     uuid := 'cf74311c-1827-4066-9376-f9270815c339';
  v_instrumental_id uuid;
  v_diagnostics_id  uuid;
  v_groups_moved    int;
  v_services_moved  int;
BEGIN
  SELECT id INTO v_instrumental_id
  FROM public.service_types
  WHERE code = 'instrumental' AND hospital_id IS NULL;

  IF v_instrumental_id IS NULL THEN
    RAISE EXCEPTION 'Global instrumental service_type not found';
  END IF;

  SELECT id INTO v_diagnostics_id
  FROM public.service_types
  WHERE code = 'diagnostics' AND hospital_id = v_hospital_id;

  IF v_diagnostics_id IS NULL THEN
    RAISE NOTICE 'No diagnostics service_type found for this hospital — nothing to clean up.';
    RETURN;
  END IF;

  UPDATE public.service_groups
  SET service_type_id = v_instrumental_id
  WHERE service_type_id = v_diagnostics_id;
  GET DIAGNOSTICS v_groups_moved = ROW_COUNT;

  UPDATE public.services
  SET service_type_id = v_instrumental_id
  WHERE service_type_id = v_diagnostics_id;
  GET DIAGNOSTICS v_services_moved = ROW_COUNT;

  DELETE FROM public.service_types
  WHERE id = v_diagnostics_id;

  RAISE NOTICE 'Moved % group(s) and % service(s) from diagnostics to instrumental; diagnostics type deleted.',
    v_groups_moved, v_services_moved;
END $$;
