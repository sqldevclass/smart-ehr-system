-- Migration 180: Daily Report foundation (Tab 1 - Service Category
-- Summary, Tab 2 - By Department). Remaining 7 tabs are future work.

-- ============================================================
-- 1. New permission: reports.view_daily
-- ============================================================

INSERT INTO public.permissions (code, name_ru, name_en, module)
VALUES ('reports.view_daily', 'Просмотр дневного отчёта', 'View daily report', 'reports');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.code IN ('admin', 'senior_manager')
  AND p.code = 'reports.view_daily';

-- ============================================================
-- 2. daily_report_service_items
--    One row per completed visit_service.
--
--    bucket: 'operating_room' takes priority (matched by room_types.name,
--    since room_types has no stable code column -- fragile if renamed,
--    same caveat class as other name-matched lookups in this schema),
--    else 'inpatient' if hospitalization_id is set (the established
--    OP/IP signal used throughout this codebase), else 'outpatient'.
--
--    department_id: inpatient -> hospitalizations.department_id;
--    outpatient/operating_room -> the performing physician's own
--    staff_roles.department_id (per explicit decision -- not the
--    room's department).
-- ============================================================

CREATE OR REPLACE VIEW public.daily_report_service_items
WITH (security_invoker = true)
AS
SELECT
  vs.id,
  vs.hospital_id,
  vs.completed_at,
  vs.cost_at_time,
  vs.patient_id,
  s.service_type_id,
  vs.service_id,
  CASE
    WHEN rt.name = 'Operating Room' THEN 'operating_room'
    WHEN vs.hospitalization_id IS NOT NULL THEN 'inpatient'
    ELSE 'outpatient'
  END AS bucket,
  CASE
    WHEN vs.hospitalization_id IS NOT NULL THEN h.department_id
    ELSE sr.department_id
  END AS department_id
FROM public.visit_services vs
JOIN public.service_statuses ss ON ss.id = vs.status_id
JOIN public.services s ON s.id = vs.service_id
LEFT JOIN public.rooms r ON r.id = vs.assigned_room_id
LEFT JOIN public.room_types rt ON rt.id = r.room_type_id
LEFT JOIN public.hospitalizations h ON h.id = vs.hospitalization_id
LEFT JOIN public.staff_roles sr ON sr.id = vs.assigned_staff_role_id
WHERE ss.code = 'completed';
