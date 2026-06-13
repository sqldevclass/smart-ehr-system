-- Migration 123: Fix physician_document_templates to use staff_roles instead of physicians
--
-- Join chain: physicians.profile_id → profiles.id → profiles.person_id
--             → staff_roles.person_id + role_type='physician'

-- ============================================================
-- 1. Drop all dependent policies FIRST (before any column changes)
-- ============================================================

DROP POLICY IF EXISTS "pdt_select"  ON public.physician_document_templates;
DROP POLICY IF EXISTS "pdt_insert"  ON public.physician_document_templates;
DROP POLICY IF EXISTS "pdt_delete"  ON public.physician_document_templates;
DROP POLICY IF EXISTS "pdtv_select" ON public.physician_document_template_values;
DROP POLICY IF EXISTS "pdtv_insert" ON public.physician_document_template_values;
DROP POLICY IF EXISTS "pdtv_delete" ON public.physician_document_template_values;

-- ============================================================
-- 2. Add staff_role_id (nullable for backfill)
-- ============================================================

ALTER TABLE public.physician_document_templates
  ADD COLUMN IF NOT EXISTS staff_role_id uuid
    REFERENCES public.staff_roles(id) ON DELETE CASCADE;

-- ============================================================
-- 3. Backfill: physicians.profile_id → profiles.person_id
--             → staff_roles.person_id
-- ============================================================

UPDATE public.physician_document_templates pdt
SET staff_role_id = sr.id
FROM public.physicians ph,
     public.profiles pr,
     public.staff_roles sr
WHERE ph.id         = pdt.physician_id
  AND pr.id         = ph.profile_id
  AND sr.person_id  = pr.person_id
  AND sr.role_type  = 'physician'
  AND sr.hospital_id = pdt.hospital_id
  AND pdt.staff_role_id IS NULL;

-- Delete orphaned rows that couldn't be backfilled
DELETE FROM public.physician_document_templates
WHERE staff_role_id IS NULL;

-- ============================================================
-- 4. Make staff_role_id NOT NULL
-- ============================================================

ALTER TABLE public.physician_document_templates
  ALTER COLUMN staff_role_id SET NOT NULL;

-- ============================================================
-- 5. Drop old physician_id column and its index
--    (policies already dropped in step 1 — no dependents left)
-- ============================================================

DROP INDEX IF EXISTS pdt_physician_idx;

ALTER TABLE public.physician_document_templates
  DROP COLUMN IF EXISTS physician_id;

CREATE INDEX IF NOT EXISTS pdt_staff_role_idx
  ON public.physician_document_templates(staff_role_id);

-- ============================================================
-- 6. Update UNIQUE constraint
-- ============================================================

ALTER TABLE public.physician_document_templates
  DROP CONSTRAINT IF EXISTS physician_document_templates_physician_id_document_type_id_nam;

ALTER TABLE public.physician_document_templates
  ADD CONSTRAINT pdt_unique_staff_role_doctype_name
    UNIQUE (staff_role_id, document_type_id, name);

-- ============================================================
-- 7. Helper: current user's physician staff_role_id
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_physician_staff_role_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT sr.id
  FROM public.staff_roles sr
  JOIN public.profiles pr ON pr.person_id = sr.person_id
  WHERE pr.id        = auth.uid()
    AND sr.role_type = 'physician'
    AND sr.hospital_id = public.get_my_hospital_id()
  LIMIT 1;
$$;

-- ============================================================
-- 8. Recreate RLS on physician_document_templates
-- ============================================================

CREATE POLICY "pdt_select" ON public.physician_document_templates
  FOR SELECT TO authenticated
  USING (
    hospital_id   = public.get_my_hospital_id()
    AND staff_role_id = public.get_my_physician_staff_role_id()
  );

CREATE POLICY "pdt_insert" ON public.physician_document_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id   = public.get_my_hospital_id()
    AND staff_role_id = public.get_my_physician_staff_role_id()
  );

CREATE POLICY "pdt_delete" ON public.physician_document_templates
  FOR DELETE TO authenticated
  USING (
    hospital_id   = public.get_my_hospital_id()
    AND staff_role_id = public.get_my_physician_staff_role_id()
  );

-- ============================================================
-- 9. Recreate RLS on physician_document_template_values
-- ============================================================

CREATE POLICY "pdtv_select" ON public.physician_document_template_values
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.physician_document_templates pdt
      WHERE pdt.id          = template_id
        AND pdt.hospital_id    = public.get_my_hospital_id()
        AND pdt.staff_role_id  = public.get_my_physician_staff_role_id()
    )
  );

CREATE POLICY "pdtv_insert" ON public.physician_document_template_values
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.physician_document_templates pdt
      WHERE pdt.id          = template_id
        AND pdt.hospital_id    = public.get_my_hospital_id()
        AND pdt.staff_role_id  = public.get_my_physician_staff_role_id()
    )
  );

CREATE POLICY "pdtv_delete" ON public.physician_document_template_values
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.physician_document_templates pdt
      WHERE pdt.id          = template_id
        AND pdt.hospital_id    = public.get_my_hospital_id()
        AND pdt.staff_role_id  = public.get_my_physician_staff_role_id()
    )
  );
