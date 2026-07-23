-- Migration 165: drop the old 3-param assign_queue_number overload
-- (p_queue_config_id, p_visit_service_id, p_hospital_id). This
-- predates the physicians-to-staff_roles rewrite and was never
-- updated to match — CREATE OR REPLACE only replaces a function
-- with an identical parameter list, so migrations 104/163/164 all
-- correctly updated the newer 5-param version while leaving this
-- one untouched and unused. Confirmed no call sites reference it
-- anywhere in the frontend — only the 5-param version
-- (p_visit_service_id, p_hospital_id, p_staff_role_id, p_room_id,
-- p_queue_config_id) is ever called, from BookingModal.tsx and
-- MultiCalendar.tsx.

DROP FUNCTION IF EXISTS public.assign_queue_number(uuid, uuid, uuid);
