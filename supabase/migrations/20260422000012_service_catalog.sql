-- Migration 012: Service Catalog
-- service_groups, service_subgroups, services, service_consumables
-- Also adds FK constraint from physician_service_privileges to services

-- ============================================================
-- SERVICE GROUPS
-- ============================================================

CREATE TABLE public.service_groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id     uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  service_type_id uuid NOT NULL REFERENCES public.service_types(id) ON DELETE CASCADE,
  name            text NOT NULL,
  is_active       boolean DEFAULT true,
  UNIQUE (hospital_id, service_type_id, name)
);

CREATE INDEX service_groups_hospital_idx ON public.service_groups(hospital_id);
CREATE INDEX service_groups_type_idx ON public.service_groups(service_type_id);

ALTER TABLE public.service_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_groups_select" ON public.service_groups
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "service_groups_insert" ON public.service_groups
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

CREATE POLICY "service_groups_update" ON public.service_groups
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

-- ============================================================
-- SERVICE SUBGROUPS
-- ============================================================

CREATE TABLE public.service_subgroups (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id      uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  service_group_id uuid NOT NULL REFERENCES public.service_groups(id) ON DELETE CASCADE,
  name             text NOT NULL,
  is_active        boolean DEFAULT true,
  UNIQUE (hospital_id, service_group_id, name)
);

CREATE INDEX service_subgroups_hospital_idx ON public.service_subgroups(hospital_id);
CREATE INDEX service_subgroups_group_idx ON public.service_subgroups(service_group_id);

ALTER TABLE public.service_subgroups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_subgroups_select" ON public.service_subgroups
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "service_subgroups_insert" ON public.service_subgroups
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

CREATE POLICY "service_subgroups_update" ON public.service_subgroups
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

-- ============================================================
-- SERVICES
-- ============================================================

CREATE TABLE public.services (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id             uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  service_type_id         uuid NOT NULL REFERENCES public.service_types(id),
  service_group_id        uuid NOT NULL REFERENCES public.service_groups(id),
  service_subgroup_id     uuid REFERENCES public.service_subgroups(id),
  name                    text NOT NULL,
  code                    text,
  cost                    numeric(12,2) NOT NULL CHECK (cost >= 0),
  vat_rate                numeric(5,2),
  cost_with_vat           numeric(12,2) GENERATED ALWAYS AS
                            (cost * (1 + COALESCE(vat_rate, 0) / 100)) STORED,
  linked_document_type_id uuid,
  is_active               boolean DEFAULT true,
  UNIQUE (hospital_id, name)
);

CREATE INDEX services_hospital_idx ON public.services(hospital_id);
CREATE INDEX services_type_idx ON public.services(service_type_id);
CREATE INDEX services_group_idx ON public.services(service_group_id);
CREATE INDEX services_name_idx ON public.services(name);

-- Audit trigger
CREATE TRIGGER services_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "services_select" ON public.services
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "services_insert" ON public.services
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

CREATE POLICY "services_update" ON public.services
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

-- ============================================================
-- SERVICE CONSUMABLES
-- Bill of materials: what gets written off when service is completed
-- ============================================================

CREATE TABLE public.service_consumables (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id  uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL,
  quantity    numeric(10,3) NOT NULL CHECK (quantity > 0),
  unit_id     uuid NOT NULL REFERENCES public.units_of_measurement(id),
  UNIQUE (service_id, product_id)
);

CREATE INDEX service_consumables_service_idx 
  ON public.service_consumables(service_id);

ALTER TABLE public.service_consumables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_consumables_select" ON public.service_consumables
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "service_consumables_insert" ON public.service_consumables
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

CREATE POLICY "service_consumables_delete" ON public.service_consumables
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

-- ============================================================
-- Add FK constraint from physician_service_privileges to services
-- (was deferred in Migration 009 because services didn't exist yet)
-- ============================================================

ALTER TABLE public.physician_service_privileges
  ADD CONSTRAINT physician_service_privileges_service_fk
  FOREIGN KEY (service_id)
  REFERENCES public.services(id)
  ON DELETE CASCADE;