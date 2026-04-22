-- Migration 006: Row Level Security Policies
-- Enforces hospital isolation on every table.
-- All policies use security-definer helper functions
-- from Migration 004 — never inline subqueries.

-- ============================================================
-- HOSPITALS
-- Users can only see their own hospital
-- Only admin can update hospital details
-- ============================================================

ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hospitals_select" ON public.hospitals
  FOR SELECT TO authenticated
  USING (id = public.get_my_hospital_id());

CREATE POLICY "hospitals_update" ON public.hospitals
  FOR UPDATE TO authenticated
  USING (id = public.get_my_hospital_id())
  WITH CHECK (
    id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_settings')
  );

-- ============================================================
-- PROFILES
-- Users can see all profiles in their hospital
-- Users can update their own profile only
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================
-- ROLES (read-only for all authenticated users)
-- ============================================================

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roles_select" ON public.roles
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- PERMISSIONS (read-only for all authenticated users)
-- ============================================================

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permissions_select" ON public.permissions
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- ROLE_PERMISSIONS (read-only for all authenticated users)
-- ============================================================

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_permissions_select" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- USER_ROLES
-- Users can see all user_roles in their hospital
-- Only admin can insert/delete
-- ============================================================

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles_select" ON public.user_roles
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "user_roles_insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_users')
  );

CREATE POLICY "user_roles_delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_users')
  );

-- ============================================================
-- USER_PERMISSIONS
-- Users can see all user_permissions in their hospital
-- Only admin can insert/update/delete
-- ============================================================

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_permissions_select" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "user_permissions_insert" ON public.user_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_users')
  );

CREATE POLICY "user_permissions_update" ON public.user_permissions
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_users')
  );

CREATE POLICY "user_permissions_delete" ON public.user_permissions
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_users')
  );

-- ============================================================
-- HOSPITAL_SETTINGS
-- Users can read their hospital settings
-- Only admin can update
-- ============================================================

ALTER TABLE public.hospital_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hospital_settings_select" ON public.hospital_settings
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "hospital_settings_update" ON public.hospital_settings
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_settings')
  );

-- ============================================================
-- HOSPITAL_SEQUENCES (internal use only)
-- Readable by all authenticated users in hospital
-- Not directly writable by application — only via generate_sequence_number()
-- ============================================================

ALTER TABLE public.hospital_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hospital_sequences_select" ON public.hospital_sequences
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

-- ============================================================
-- STAFF_INVITATIONS
-- Admin can see and manage all invitations for their hospital
-- ============================================================

ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_invitations_select" ON public.staff_invitations
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "staff_invitations_insert" ON public.staff_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_users')
  );

CREATE POLICY "staff_invitations_update" ON public.staff_invitations
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_users')
  );

-- ============================================================
-- AUDIT_LOGS (append-only — no update or delete ever)
-- Users can read audit logs for their hospital
-- No direct insert from application — trigger only
-- ============================================================

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

-- ============================================================
-- LOOKUP TABLES (global, read-only for all authenticated users)
-- service_statuses, status_transitions, payment_methods,
-- routes_of_administration, administration_rules,
-- medication_order_statuses, units_of_measurement,
-- release_forms, packaging_types, product_types,
-- warehouse_types, write_off_types, hospitalization_types,
-- hospitalization_urgency, anesthesia_types, diet_types,
-- activity_modes, document_group_types
-- ============================================================

ALTER TABLE public.service_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_statuses_select" ON public.service_statuses
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.status_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "status_transitions_select" ON public.status_transitions
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_methods_select" ON public.payment_methods
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.routes_of_administration ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routes_select" ON public.routes_of_administration
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.administration_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_rules_select" ON public.administration_rules
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.medication_order_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "med_order_statuses_select" ON public.medication_order_statuses
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.units_of_measurement ENABLE ROW LEVEL SECURITY;
CREATE POLICY "units_select" ON public.units_of_measurement
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.release_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "release_forms_select" ON public.release_forms
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.packaging_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "packaging_types_select" ON public.packaging_types
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.product_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_types_select" ON public.product_types
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.warehouse_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warehouse_types_select" ON public.warehouse_types
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.write_off_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "write_off_types_select" ON public.write_off_types
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.hospitalization_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hospitalization_types_select" ON public.hospitalization_types
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.hospitalization_urgency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hospitalization_urgency_select" ON public.hospitalization_urgency
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.anesthesia_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anesthesia_types_select" ON public.anesthesia_types
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.diet_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "diet_types_select" ON public.diet_types
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.activity_modes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_modes_select" ON public.activity_modes
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.document_group_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "document_group_types_select" ON public.document_group_types
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- HOSPITAL-MANAGED LOOKUP TABLES
-- job_positions, specializations, service_types
-- Readable by all in hospital
-- Writable by admin/hr
-- ============================================================

ALTER TABLE public.job_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_positions_select" ON public.job_positions
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "job_positions_insert" ON public.job_positions
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('system.manage_users')
      OR public.has_permission('schedules.manage')
    )
  );

CREATE POLICY "job_positions_update" ON public.job_positions
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('system.manage_users')
      OR public.has_permission('schedules.manage')
    )
  );

ALTER TABLE public.specializations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "specializations_select" ON public.specializations
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "specializations_insert" ON public.specializations
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('system.manage_users')
      OR public.has_permission('schedules.manage')
    )
  );

CREATE POLICY "specializations_update" ON public.specializations
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('system.manage_users')
      OR public.has_permission('schedules.manage')
    )
  );

ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_types_select" ON public.service_types
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "service_types_insert" ON public.service_types
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );

CREATE POLICY "service_types_update" ON public.service_types
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_services')
  );