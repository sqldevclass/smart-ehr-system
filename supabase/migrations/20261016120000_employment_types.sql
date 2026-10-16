-- New HR lookup table "Вид трудоустройства" (employment type), mirroring
-- staff_types exactly (same shape, indexes, and RLS policies), plus the
-- FK column on employments so it can be set per employee.

CREATE TABLE public.employment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (hospital_id, code)
);

CREATE INDEX employment_types_hospital_idx ON public.employment_types (hospital_id);

ALTER TABLE public.employment_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY employment_types_select ON public.employment_types
  FOR SELECT
  USING (hospital_id = get_my_hospital_id());

CREATE POLICY employment_types_insert ON public.employment_types
  FOR INSERT
  WITH CHECK (hospital_id = get_my_hospital_id() AND has_permission('system.manage_services'));

CREATE POLICY employment_types_update ON public.employment_types
  FOR UPDATE
  USING (hospital_id = get_my_hospital_id())
  WITH CHECK (hospital_id = get_my_hospital_id() AND has_permission('system.manage_services'));

CREATE POLICY employment_types_delete ON public.employment_types
  FOR DELETE
  USING (hospital_id = get_my_hospital_id() AND has_permission('system.manage_services'));

ALTER TABLE public.employments
  ADD COLUMN employment_type_id uuid REFERENCES public.employment_types(id);
