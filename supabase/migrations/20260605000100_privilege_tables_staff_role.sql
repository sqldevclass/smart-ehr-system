-- Migration 100: Update privilege tables to reference staff_roles
-- Adds staff_role_id FK to document and service privilege tables.
-- Backfills from physicians → staff_roles mapping.
-- physician_id kept as nullable for backward compat — dropped in migration 102.

-- ============================================================
-- 1. physician_document_privileges
-- ============================================================

ALTER TABLE public.physician_document_privileges
  ADD COLUMN staff_role_id uuid REFERENCES public.staff_roles(id) ON DELETE CASCADE;

-- Backfill from physician → staff_role
UPDATE public.physician_document_privileges pdp
SET staff_role_id = ph.staff_role_id
FROM public.physicians ph
WHERE ph.id = pdp.physician_id
  AND ph.staff_role_id IS NOT NULL;

-- New partial unique constraint on staff_role_id
CREATE UNIQUE INDEX physician_doc_priv_staff_role_unique
  ON public.physician_document_privileges(staff_role_id, document_type_id)
  WHERE staff_role_id IS NOT NULL;

-- ============================================================
-- 2. physician_service_privileges
-- ============================================================

ALTER TABLE public.physician_service_privileges
  ADD COLUMN staff_role_id uuid REFERENCES public.staff_roles(id) ON DELETE CASCADE;

-- Backfill
UPDATE public.physician_service_privileges psp
SET staff_role_id = ph.staff_role_id
FROM public.physicians ph
WHERE ph.id = psp.physician_id
  AND ph.staff_role_id IS NOT NULL;

-- New partial unique constraint on staff_role_id
CREATE UNIQUE INDEX physician_svc_priv_staff_role_unique
  ON public.physician_service_privileges(staff_role_id, service_id)
  WHERE staff_role_id IS NOT NULL;

-- ============================================================
-- 3. Update RLS policies on privilege tables to allow
--    staff.manage permission (not just schedules.manage)
--    so HR can manage nurse privileges too
-- ============================================================

-- Document privileges
DROP POLICY IF EXISTS "physician_doc_priv_insert" ON public.physician_document_privileges;
CREATE POLICY "physician_doc_priv_insert" ON public.physician_document_privileges
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('schedules.manage')
      OR public.has_permission('staff.manage')
    )
  );

DROP POLICY IF EXISTS "physician_doc_priv_delete" ON public.physician_document_privileges;
CREATE POLICY "physician_doc_priv_delete" ON public.physician_document_privileges
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('schedules.manage')
      OR public.has_permission('staff.manage')
    )
  );

-- Service privileges
DROP POLICY IF EXISTS "physician_service_priv_insert" ON public.physician_service_privileges;
CREATE POLICY "physician_service_priv_insert" ON public.physician_service_privileges
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('schedules.manage')
      OR public.has_permission('staff.manage')
    )
  );

DROP POLICY IF EXISTS "physician_service_priv_delete" ON public.physician_service_privileges;
CREATE POLICY "physician_service_priv_delete" ON public.physician_service_privileges
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('schedules.manage')
      OR public.has_permission('staff.manage')
    )
  );
