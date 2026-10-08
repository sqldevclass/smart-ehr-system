-- Migration: Выписной эпикриз (discharge_summary) rework
-- 1. Move admission/discharge/bed-days fields into "Жалобы и Анамнез" tab (top)
-- 2. Hide "Специальная диета" (tx.special_diet) without deleting historical data
-- 3. Move all "vitals.*" fields into "Объективная оценка" (objective_assessment_full)
--    -- this empties the "vitals" section for discharge_summary, which the
--    -- frontend already drops automatically when a section has 0 fields.
-- 4. New RPC discharge_patient_with_summary: atomically stamps the computed
--    admission/discharge/bed-days values, discharges the hospitalization, and
--    completes the discharge-summary document in one transaction (reusing the
--    existing discharge_patient and complete_document functions).

-- ============================================================
-- 1) Move dc.admission_date / dc.discharge_date / dc.bed_days
--    into complaints_and_history, sort_order 1/2/3 (top of tab)
-- ============================================================
update document_type_fields dtf
set section_id = (select id from document_sections where code = 'complaints_and_history'),
    sort_order = case fd.attribute_code
      when 'dc.admission_date' then 1
      when 'dc.discharge_date' then 2
      when 'dc.bed_days' then 3
    end
from field_definitions fd
join document_types dt on dt.code = 'discharge_summary'
where dtf.field_definition_id = fd.id
  and dtf.document_type_id = dt.id
  and fd.attribute_code in ('dc.admission_date', 'dc.discharge_date', 'dc.bed_days');

-- ============================================================
-- 2) Hide Специальная диета (tx.special_diet) -- keep the one
--    historical document's data intact, just stop rendering it.
-- ============================================================
update document_type_fields dtf
set is_visible = false
from field_definitions fd
join document_types dt on dt.code = 'discharge_summary'
where dtf.field_definition_id = fd.id
  and dtf.document_type_id = dt.id
  and fd.attribute_code = 'tx.special_diet';

-- ============================================================
-- 3) Move all vitals.* fields into objective_assessment_full,
--    continuing sort_order after the existing 170 (psych.pathology).
-- ============================================================
update document_type_fields dtf
set section_id = (select id from document_sections where code = 'objective_assessment_full'),
    sort_order = case fd.attribute_code
      when 'vitals.bp' then 180
      when 'vitals.pulse' then 190
      when 'vitals.heart_rate' then 200
      when 'vitals.rr' then 210
      when 'vitals.spo2' then 220
      when 'vitals.temperature' then 230
      when 'vitals.height' then 240
      when 'vitals.weight' then 250
      when 'vitals.bmi' then 260
    end
from field_definitions fd
join document_types dt on dt.code = 'discharge_summary'
where dtf.field_definition_id = fd.id
  and dtf.document_type_id = dt.id
  and fd.attribute_code like 'vitals.%';

-- ============================================================
-- 4) discharge_patient_with_summary: one atomic transaction that
--    (a) stamps dc.admission_date / dc.discharge_date / dc.bed_days
--        on the discharge_summary document,
--    (b) discharges the hospitalization (reuses discharge_patient),
--    (c) completes the discharge_summary document (reuses complete_document).
--    Any failure (e.g. mandatory fields missing on the document) rolls
--    back the whole thing -- a patient cannot be discharged unless the
--    discharge-summary document can actually be completed.
-- ============================================================
create or replace function public.discharge_patient_with_summary(
  p_hospitalization_id uuid,
  p_discharge_type text,
  p_discharge_notes text,
  p_document_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital_id uuid;
  v_tz text;
  v_admitted_at timestamptz;
  v_admission_date date;
  v_discharge_date date;
  v_bed_days int;
  v_admission_date_fd uuid;
  v_discharge_date_fd uuid;
  v_bed_days_fd uuid;
  v_recorded_by uuid := auth.uid();
begin
  select h.hospital_id, h.admitted_at, coalesce(hs.timezone, 'Asia/Tashkent')
    into v_hospital_id, v_admitted_at, v_tz
  from hospitalizations h
  left join hospital_settings hs on hs.hospital_id = h.hospital_id
  where h.id = p_hospitalization_id;

  if v_hospital_id is null then
    raise exception 'discharge_patient_with_summary failed: hospitalization not found';
  end if;

  -- compute admission/discharge date and bed-days in the hospital's own
  -- timezone, mirroring the frontend's useHospitalTimezone() fallback
  v_admission_date := (v_admitted_at at time zone v_tz)::date;
  v_discharge_date := (now() at time zone v_tz)::date;
  v_bed_days := greatest(v_discharge_date - v_admission_date, 0);

  select id into v_admission_date_fd from field_definitions where attribute_code = 'dc.admission_date';
  select id into v_discharge_date_fd from field_definitions where attribute_code = 'dc.discharge_date';
  select id into v_bed_days_fd from field_definitions where attribute_code = 'dc.bed_days';

  insert into patient_document_field_values
    (patient_document_id, field_definition_id, hospital_id, value, recorded_by)
  values
    (p_document_id, v_admission_date_fd, v_hospital_id, v_admission_date::text, v_recorded_by),
    (p_document_id, v_discharge_date_fd, v_hospital_id, v_discharge_date::text, v_recorded_by),
    (p_document_id, v_bed_days_fd, v_hospital_id, v_bed_days::text, v_recorded_by)
  on conflict (patient_document_id, field_definition_id)
  do update set value = excluded.value, recorded_by = excluded.recorded_by;

  -- discharge the hospitalization (existing permission checks apply)
  perform public.discharge_patient(p_hospitalization_id, p_discharge_type, p_discharge_notes);

  -- complete the discharge-summary document (existing permission +
  -- mandatory-field checks apply); any failure here rolls back the
  -- field-value stamps and the discharge above too.
  perform public.complete_document(p_document_id);
end;
$$;

grant execute on function public.discharge_patient_with_summary(uuid, text, text, uuid) to authenticated;
