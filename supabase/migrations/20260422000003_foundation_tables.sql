-- Migration 003: Foundation Tables
-- Creates core tables: hospitals (rebuild), profiles (rebuild),
-- user_roles, user_permissions, hospital_settings,
-- hospital_sequences, staff_invitations

-- Step 1: Create hospitals
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

-- Seed Kaiser Test hospital
INSERT INTO public.hospitals (id, name)
VALUES ('cf74311c-1827-4066-9376-f9270815c339', 'Kaiser Test');

-- Step 2: Create profiles
CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  phone       text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

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
-- ============================================================
-- Hospital-managed lookup tables
-- Moved here from 002 because they reference hospitals
-- ============================================================

CREATE TABLE public.job_positions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('administration', 'medical_staff')),
  name        text NOT NULL,
  is_active   boolean DEFAULT true,
  UNIQUE (hospital_id, name)
);

CREATE TABLE public.specializations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  name        text NOT NULL,
  is_active   boolean DEFAULT true,
  UNIQUE (hospital_id, name)
);

CREATE TABLE public.service_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  code        text NOT NULL,
  name_ru     text NOT NULL,
  name_en     text,
  sort_order  int DEFAULT 0,
  is_active   boolean DEFAULT true,
  UNIQUE (hospital_id, code)
);

-- Seed starter data for Kaiser Test hospital
INSERT INTO public.job_positions (hospital_id, type, name) VALUES
  ('cf74311c-1827-4066-9376-f9270815c339', 'medical_staff', 'Кардиолог'),
  ('cf74311c-1827-4066-9376-f9270815c339', 'medical_staff', 'Кардиохирург'),
  ('cf74311c-1827-4066-9376-f9270815c339', 'medical_staff', 'Дерматолог'),
  ('cf74311c-1827-4066-9376-f9270815c339', 'medical_staff', 'Уролог');

INSERT INTO public.specializations (hospital_id, name) VALUES
  ('cf74311c-1827-4066-9376-f9270815c339', 'Кардиология'),
  ('cf74311c-1827-4066-9376-f9270815c339', 'Кардиохирургия'),
  ('cf74311c-1827-4066-9376-f9270815c339', 'Дерматология'),
  ('cf74311c-1827-4066-9376-f9270815c339', 'Урология');

INSERT INTO public.service_types (hospital_id, code, name_ru, name_en, sort_order) VALUES
  ('cf74311c-1827-4066-9376-f9270815c339', 'surgery',       'Хирургия',      'Surgery',       1),
  ('cf74311c-1827-4066-9376-f9270815c339', 'inpatient',     'Стационар',     'Inpatient',     2),
  ('cf74311c-1827-4066-9376-f9270815c339', 'laboratory',    'Лаборатория',   'Laboratory',    3),
  ('cf74311c-1827-4066-9376-f9270815c339', 'polyclinic',    'Поликлиника',   'Polyclinic',    4),
  ('cf74311c-1827-4066-9376-f9270815c339', 'icu',           'Реанимация',    'ICU',           5),
  ('cf74311c-1827-4066-9376-f9270815c339', 'radiology',     'Радиология',    'Radiology',     6),
  ('cf74311c-1827-4066-9376-f9270815c339', 'angiography',   'Ангиография',   'Angiography',   7),
  ('cf74311c-1827-4066-9376-f9270815c339', 'physiotherapy', 'Физиотерапия',  'Physiotherapy', 8),
  ('cf74311c-1827-4066-9376-f9270815c339', 'spa',           'СПА',           'SPA',           9),
  ('cf74311c-1827-4066-9376-f9270815c339', 'consultation',  'Консультация',  'Consultation',  10),
  ('cf74311c-1827-4066-9376-f9270815c339', 'diagnostics',   'Диагностика',   'Diagnostics',   11);
