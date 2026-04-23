-- Migration 008: Departments and Rooms

-- ============================================================
-- DEPARTMENTS
-- ============================================================

CREATE TABLE public.departments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id       uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  name              text NOT NULL,
  code              text,
  head_physician_id uuid, -- FK added after physicians table is created
  is_active         boolean DEFAULT true,
  UNIQUE (hospital_id, name)
);

CREATE INDEX departments_hospital_idx ON public.departments(hospital_id);

-- Audit trigger
CREATE TRIGGER departments_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- RLS
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "departments_select" ON public.departments
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "departments_insert" ON public.departments
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_settings')
  );

CREATE POLICY "departments_update" ON public.departments
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_settings')
  );

-- ============================================================
-- ROOMS
-- ============================================================

CREATE TABLE public.rooms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id   uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name          text NOT NULL,
  room_type     text NOT NULL CHECK (
                  room_type IN ('ward','procedure','lab','imaging','icu','other')
                ),
  capacity      int DEFAULT 1,
  is_active     boolean DEFAULT true,
  UNIQUE (hospital_id, department_id, name)
);

CREATE INDEX rooms_hospital_idx ON public.rooms(hospital_id);
CREATE INDEX rooms_department_idx ON public.rooms(department_id);

-- RLS
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rooms_select" ON public.rooms
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "rooms_insert" ON public.rooms
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_settings')
  );

CREATE POLICY "rooms_update" ON public.rooms
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_settings')
  );

-- ============================================================
-- Seed test department and rooms for Kaiser Test hospital
-- ============================================================

INSERT INTO public.departments (hospital_id, name, code) VALUES
  ('cf74311c-1827-4066-9376-f9270815c339', 'Кардиология',      'CARD'),
  ('cf74311c-1827-4066-9376-f9270815c339', 'Хирургия',         'SURG'),
  ('cf74311c-1827-4066-9376-f9270815c339', 'Лаборатория',      'LAB'),
  ('cf74311c-1827-4066-9376-f9270815c339', 'Приёмный покой',   'ADMN');