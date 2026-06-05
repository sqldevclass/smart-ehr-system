-- Migration 099: Create staff_roles table
-- staff_roles is the clinical role record for a person.
-- Replaces physicians table for privilege management.
-- physicians table stays intact for schedule/visit FKs — migrated later.

-- ============================================================
-- 1. Create staff_role_type enum
-- ============================================================

CREATE TYPE public.staff_role_type AS ENUM (
  'physician',
  'functional_diagnostics_physician',
  'lab_physician',
  'blood_draw_nurse',
  'inpatient_nurse',
  'head_nurse',
  'cashier',
  'outpatient_registrar',
  'call_center_registrar',
  'inpatient_registrar',
  'pharmacist',
  'warehouse_staff',
  'inventory_manager',
  'radiology_technician'
);

-- ============================================================
-- 2. Create staff_roles table
-- ============================================================

CREATE TABLE public.staff_roles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id         uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  hospital_id       uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  role_type         public.staff_role_type NOT NULL,

  -- Physician-specific fields (null for non-physicians)
  -- Will move to a physician_details extension table in a future migration
  -- when physicians table is dropped
  specialization_id uuid REFERENCES public.specializations(id) ON DELETE SET NULL,
  department_id     uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  dashboard_type    text DEFAULT 'clinical'
                      CHECK (dashboard_type IN ('clinical', 'worklist')),
  signature_url     text,
  photo_url         text,
  employment_rate   numeric(3,2) DEFAULT 1.00,

  is_active         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),

  UNIQUE (person_id, hospital_id, role_type)
);

CREATE INDEX staff_roles_person_idx    ON public.staff_roles(person_id);
CREATE INDEX staff_roles_hospital_idx  ON public.staff_roles(hospital_id);
CREATE INDEX staff_roles_type_idx      ON public.staff_roles(hospital_id, role_type);

-- RLS
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_roles_select" ON public.staff_roles
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "staff_roles_insert" ON public.staff_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('staff.manage')
  );

CREATE POLICY "staff_roles_update" ON public.staff_roles
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('staff.manage')
  );

CREATE POLICY "staff_roles_delete" ON public.staff_roles
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('staff.manage')
  );

-- ============================================================
-- 3. Migrate physicians → staff_roles
-- ============================================================

INSERT INTO public.staff_roles (
  id,
  person_id,
  hospital_id,
  role_type,
  specialization_id,
  department_id,
  dashboard_type,
  signature_url,
  photo_url,
  employment_rate,
  is_active,
  created_at
)
SELECT
  gen_random_uuid(),
  e.person_id,
  ph.hospital_id,
  'physician'::public.staff_role_type,
  ph.specialization_id,
  ph.department_id,
  ph.dashboard_type,
  ph.signature_url,
  ph.photo_url,
  ph.employment_rate,
  ph.is_active,
  ph.created_at
FROM public.physicians ph
JOIN public.employees e ON e.id = ph.employee_id
WHERE e.person_id IS NOT NULL;

-- For physicians without employee_id, link via profile_id → profiles → person_id
INSERT INTO public.staff_roles (
  person_id,
  hospital_id,
  role_type,
  specialization_id,
  department_id,
  dashboard_type,
  signature_url,
  photo_url,
  employment_rate,
  is_active,
  created_at
)
SELECT
  pr.person_id,
  ph.hospital_id,
  'physician'::public.staff_role_type,
  ph.specialization_id,
  ph.department_id,
  ph.dashboard_type,
  ph.signature_url,
  ph.photo_url,
  ph.employment_rate,
  ph.is_active,
  ph.created_at
FROM public.physicians ph
JOIN public.profiles pr ON pr.id = ph.profile_id
WHERE ph.employee_id IS NULL
  AND pr.person_id IS NOT NULL
ON CONFLICT (person_id, hospital_id, role_type) DO NOTHING;

-- ============================================================
-- 4. Add staff_role_id back-reference on physicians for migration safety
-- ============================================================

ALTER TABLE public.physicians
  ADD COLUMN staff_role_id uuid REFERENCES public.staff_roles(id) ON DELETE SET NULL;

UPDATE public.physicians ph
SET staff_role_id = sr.id
FROM public.staff_roles sr
JOIN public.profiles pr ON pr.person_id = sr.person_id
WHERE ph.profile_id = pr.id
  AND sr.hospital_id = ph.hospital_id
  AND sr.role_type = 'physician';

-- ============================================================
-- 5. Add staff_role_id back-reference on profiles
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN staff_role_id uuid REFERENCES public.staff_roles(id) ON DELETE SET NULL;

UPDATE public.profiles pr
SET staff_role_id = sr.id
FROM public.staff_roles sr
WHERE sr.person_id = pr.person_id
  AND sr.hospital_id = pr.hospital_id;
