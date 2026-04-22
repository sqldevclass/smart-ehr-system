-- Migration 003: Foundation Tables
-- Creates core tables: hospitals (rebuild), profiles (rebuild),
-- user_roles, user_permissions, hospital_settings,
-- hospital_sequences, staff_invitations

-- ============================================================
-- Step 1: Rebuild hospitals with correct schema
-- Save existing data first, drop, recreate, reinsert
-- ============================================================

CREATE TABLE public.hospitals_backup AS 
  SELECT id, name, email, phone, address FROM public.hospitals;

DROP TABLE public.hospitals CASCADE;

CREATE TABLE public.hospitals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  email      text UNIQUE,
  phone      text,
  address    text,
  logo_url   text,
  is_active  boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.hospitals (id, name, email, phone, address)
SELECT id, name, email, phone, address
FROM public.hospitals_backup;

DROP TABLE public.hospitals_backup;

-- ============================================================
-- Step 2: Rebuild profiles with correct schema
-- ============================================================

CREATE TABLE public.profiles_backup AS
  SELECT id, hospital_id, full_name, phone FROM public.profiles;

DROP TABLE public.profiles CASCADE;

CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  phone       text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

INSERT INTO public.profiles (id, hospital_id, full_name)
SELECT id, hospital_id, full_name
FROM public.profiles_backup;

DROP TABLE public.profiles_backup;

-- ============================================================
-- Step 3: User Roles junction table
-- ============================================================

CREATE TABLE public.user_roles (
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id     uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  granted_by  uuid REFERENCES public.profiles(id),
  granted_at  timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

-- Seed roles for existing test users
-- John Doe → admin
INSERT INTO public.user_roles (user_id, role_id, hospital_id)
SELECT 
  '527dc340-738c-41e4-bd2f-451d84dd0f30',
  r.id,
  'cf74311c-1827-4066-9376-f9270815c339'
FROM public.roles r WHERE r.code = 'admin';

-- Asqar Sobirov → outpatient_registrar
INSERT INTO public.user_roles (user_id, role_id, hospital_id)
SELECT 
  '87a5bedf-ed2f-4699-82ae-3a05df2d92af',
  r.id,
  'cf74311c-1827-4066-9376-f9270815c339'
FROM public.roles r WHERE r.code = 'outpatient_registrar';

-- Bunyod Babajonov → physician
INSERT INTO public.user_roles (user_id, role_id, hospital_id)
SELECT 
  '26fe042f-ee52-4570-adf9-ecc1fee35fee',
  r.id,
  'cf74311c-1827-4066-9376-f9270815c339'
FROM public.roles r WHERE r.code = 'physician';

-- ============================================================
-- Step 4: User Permissions (individual overrides)
-- ============================================================

CREATE TABLE public.user_permissions (
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  hospital_id   uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  granted       boolean DEFAULT true,
  granted_by    uuid REFERENCES public.profiles(id),
  granted_at    timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, permission_id)
);

-- ============================================================
-- Step 5: Hospital Settings
-- ============================================================

CREATE TABLE public.hospital_settings (
  hospital_id                 uuid PRIMARY KEY 
                                REFERENCES public.hospitals(id) ON DELETE CASCADE,
  cashier_separate            boolean DEFAULT true,
  slot_selection_mode         text DEFAULT 'registrar',
  default_vat_rate            numeric(5,2) DEFAULT 12.00,
  physician_edit_window_hours int DEFAULT 48,
  medication_workflow_mode    text DEFAULT 'central',
  queue_reminder_minutes      int DEFAULT 10,
  expiry_notify_days_default  int DEFAULT 30,
  min_qty_notify_default      int DEFAULT 10
);

INSERT INTO public.hospital_settings (hospital_id)
VALUES ('cf74311c-1827-4066-9376-f9270815c339');

-- ============================================================
-- Step 6: Hospital Sequences (auto-number generation)
-- ============================================================

CREATE TABLE public.hospital_sequences (
  hospital_id   uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  sequence_type text NOT NULL,
  prefix        text NOT NULL,
  last_value    bigint DEFAULT 0,
  PRIMARY KEY (hospital_id, sequence_type)
);

INSERT INTO public.hospital_sequences (hospital_id, sequence_type, prefix) VALUES
  ('cf74311c-1827-4066-9376-f9270815c339', 'patient',          'P'),
  ('cf74311c-1827-4066-9376-f9270815c339', 'hospitalization',  'H'),
  ('cf74311c-1827-4066-9376-f9270815c339', 'invoice',          'INV'),
  ('cf74311c-1827-4066-9376-f9270815c339', 'receipt',          'RCP');

-- ============================================================
-- Step 7: Staff Invitations
-- ============================================================

DROP TABLE IF EXISTS public.staff_invitations;

CREATE TABLE public.staff_invitations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id      uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  invited_by       uuid REFERENCES public.profiles(id),
  email            text NOT NULL,
  full_name        text NOT NULL,
  role_codes       text[] NOT NULL,
  specialization   text,
  phone            text,
  status           text DEFAULT 'pending' 
                     CHECK (status IN ('pending','accepted','revoked')),
  token            uuid DEFAULT gen_random_uuid(),
  token_expires_at timestamptz,
  invited_at       timestamptz DEFAULT now(),
  accepted_at      timestamptz,
  auth_user_id     uuid REFERENCES auth.users(id)
);