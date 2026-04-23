-- Migration 009: Physicians, Schedules, and Privileges

-- ============================================================
-- PHYSICIANS
-- ============================================================

CREATE TABLE public.physicians (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  hospital_id     uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  specialization  text,
  job_position_id uuid REFERENCES public.job_positions(id),
  employment_rate numeric(3,2) DEFAULT 1.00,
  dashboard_type  text DEFAULT 'clinical' 
                    CHECK (dashboard_type IN ('clinical','worklist')),
  photo_url       text,
  signature_url   text,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX physicians_hospital_idx ON public.physicians(hospital_id);
CREATE INDEX physicians_profile_idx ON public.physicians(profile_id);

-- Now add the FK from departments to physicians for head_physician
ALTER TABLE public.departments 
  ADD CONSTRAINT departments_head_physician_fk 
  FOREIGN KEY (head_physician_id) 
  REFERENCES public.physicians(id);

-- Audit trigger
CREATE TRIGGER physicians_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.physicians
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- RLS
ALTER TABLE public.physicians ENABLE ROW LEVEL SECURITY;

CREATE POLICY "physicians_select" ON public.physicians
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "physicians_insert" ON public.physicians
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_users')
  );

CREATE POLICY "physicians_update" ON public.physicians
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('system.manage_users')
      OR public.has_permission('schedules.manage')
    )
  );

-- ============================================================
-- PHYSICIAN SCHEDULES
-- ============================================================

CREATE TABLE public.physician_schedules (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  physician_id          uuid NOT NULL REFERENCES public.physicians(id) ON DELETE CASCADE,
  hospital_id           uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  schedule_type         text NOT NULL CHECK (schedule_type IN ('slots','queue')),
  work_start            time NOT NULL,
  work_end              time NOT NULL,
  slot_duration_minutes int,
  days_of_week          int[] NOT NULL,
  valid_from            date NOT NULL DEFAULT current_date,
  valid_to              date,
  created_by            uuid REFERENCES public.profiles(id),
  created_at            timestamptz DEFAULT now(),
  CONSTRAINT slot_duration_required 
    CHECK (schedule_type = 'queue' OR slot_duration_minutes IS NOT NULL)
);

CREATE INDEX physician_schedules_physician_idx 
  ON public.physician_schedules(physician_id);

-- RLS
ALTER TABLE public.physician_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "physician_schedules_select" ON public.physician_schedules
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "physician_schedules_insert" ON public.physician_schedules
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('schedules.manage')
  );

CREATE POLICY "physician_schedules_update" ON public.physician_schedules
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('schedules.manage')
  );

CREATE POLICY "physician_schedules_delete" ON public.physician_schedules
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('schedules.manage')
  );

-- ============================================================
-- PHYSICIAN SCHEDULE BLOCKS
-- (lunch breaks, vacations, leave — set by HR)
-- ============================================================

CREATE TABLE public.physician_schedule_blocks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  physician_id uuid NOT NULL REFERENCES public.physicians(id) ON DELETE CASCADE,
  hospital_id  uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  blocked_from timestamptz NOT NULL,
  blocked_to   timestamptz NOT NULL,
  reason       text,
  blocked_by   uuid REFERENCES public.profiles(id),
  created_at   timestamptz DEFAULT now(),
  CONSTRAINT valid_block_range CHECK (blocked_to > blocked_from)
);

CREATE INDEX schedule_blocks_physician_idx 
  ON public.physician_schedule_blocks(physician_id);
CREATE INDEX schedule_blocks_range_idx 
  ON public.physician_schedule_blocks(blocked_from, blocked_to);

-- RLS
ALTER TABLE public.physician_schedule_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_blocks_select" ON public.physician_schedule_blocks
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "schedule_blocks_insert" ON public.physician_schedule_blocks
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('schedules.block')
  );

CREATE POLICY "schedule_blocks_delete" ON public.physician_schedule_blocks
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('schedules.block')
  );

-- ============================================================
-- SCHEDULE SLOTS
-- (generated from physician_schedules — one row per bookable slot)
-- ============================================================

CREATE TABLE public.schedule_slots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  physician_id     uuid NOT NULL REFERENCES public.physicians(id) ON DELETE CASCADE,
  hospital_id      uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  slot_datetime    timestamptz NOT NULL,
  is_booked        boolean DEFAULT false,
  visit_service_id uuid, -- FK added in Phase 2 when visit_services is created
  UNIQUE (physician_id, slot_datetime)
);

CREATE INDEX schedule_slots_physician_date_idx 
  ON public.schedule_slots(physician_id, slot_datetime);
CREATE INDEX schedule_slots_hospital_idx 
  ON public.schedule_slots(hospital_id);

-- RLS
ALTER TABLE public.schedule_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_slots_select" ON public.schedule_slots
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "schedule_slots_update" ON public.schedule_slots
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (hospital_id = public.get_my_hospital_id());

-- ============================================================
-- PHYSICIAN SERVICE PRIVILEGES
-- (which services each physician is authorized to perform)
-- Set by HR in employee profile
-- ============================================================

CREATE TABLE public.physician_service_privileges (
  physician_id uuid NOT NULL REFERENCES public.physicians(id) ON DELETE CASCADE,
  service_id   uuid NOT NULL, -- FK added in Phase 2 when services table is created
  hospital_id  uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  granted_by   uuid REFERENCES public.profiles(id),
  granted_at   timestamptz DEFAULT now(),
  PRIMARY KEY (physician_id, service_id)
);

CREATE INDEX physician_service_priv_idx 
  ON public.physician_service_privileges(physician_id);

-- RLS
ALTER TABLE public.physician_service_privileges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "physician_service_priv_select" ON public.physician_service_privileges
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "physician_service_priv_insert" ON public.physician_service_privileges
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('schedules.manage')
  );

CREATE POLICY "physician_service_priv_delete" ON public.physician_service_privileges
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('schedules.manage')
  );

-- ============================================================
-- PHYSICIAN DOCUMENT PRIVILEGES
-- (which document types each physician can create)
-- Set by HR in employee profile
-- ============================================================

CREATE TABLE public.physician_document_privileges (
  physician_id     uuid NOT NULL REFERENCES public.physicians(id) ON DELETE CASCADE,
  document_type_id uuid NOT NULL, -- FK added in Phase 7 when document_types is created
  hospital_id      uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  granted_by       uuid REFERENCES public.profiles(id),
  granted_at       timestamptz DEFAULT now(),
  PRIMARY KEY (physician_id, document_type_id)
);

CREATE INDEX physician_doc_priv_idx 
  ON public.physician_document_privileges(physician_id);

-- RLS
ALTER TABLE public.physician_document_privileges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "physician_doc_priv_select" ON public.physician_document_privileges
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "physician_doc_priv_insert" ON public.physician_document_privileges
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('schedules.manage')
  );

CREATE POLICY "physician_doc_priv_delete" ON public.physician_document_privileges
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('schedules.manage')
  );

-- ============================================================
-- Seed test physician for Bunyod Babajonov
-- ============================================================

INSERT INTO public.physicians (profile_id, hospital_id, specialization, dashboard_type)
SELECT 
  '26fe042f-ee52-4570-adf9-ecc1fee35fee',
  'cf74311c-1827-4066-9376-f9270815c339',
  'Кардиология',
  'clinical';