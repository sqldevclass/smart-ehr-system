-- Migration 103: Fix privilege tables PRIMARY KEY to use staff_role_id
-- The old PK was (physician_id, service_id/document_type_id).
-- physician_id is now nullable — need a new PK based on staff_role_id.

-- ============================================================
-- 1. physician_service_privileges
-- ============================================================

-- Drop old PK (physician_id, service_id)
ALTER TABLE public.physician_service_privileges
  DROP CONSTRAINT IF EXISTS physician_service_privileges_pkey;

-- Make physician_id nullable
ALTER TABLE public.physician_service_privileges
  ALTER COLUMN physician_id DROP NOT NULL;

-- Add new PK on staff_role_id + service_id
-- First add id column for rows that have physician_id but no staff_role_id
ALTER TABLE public.physician_service_privileges
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

-- Set id for existing rows
UPDATE public.physician_service_privileges
  SET id = gen_random_uuid()
  WHERE id IS NULL;

ALTER TABLE public.physician_service_privileges
  ALTER COLUMN id SET NOT NULL;

-- New PK on id
ALTER TABLE public.physician_service_privileges
  ADD PRIMARY KEY (id);

-- Unique constraint: one privilege per staff_role + service
CREATE UNIQUE INDEX IF NOT EXISTS psp_staff_role_service_unique
  ON public.physician_service_privileges(staff_role_id, service_id)
  WHERE staff_role_id IS NOT NULL;

-- ============================================================
-- 2. physician_document_privileges
-- ============================================================

-- Drop old PK (physician_id, document_type_id)
ALTER TABLE public.physician_document_privileges
  DROP CONSTRAINT IF EXISTS physician_document_privileges_pkey;

-- Make physician_id nullable
ALTER TABLE public.physician_document_privileges
  ALTER COLUMN physician_id DROP NOT NULL;

-- Add id column
ALTER TABLE public.physician_document_privileges
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

-- Set id for existing rows
UPDATE public.physician_document_privileges
  SET id = gen_random_uuid()
  WHERE id IS NULL;

ALTER TABLE public.physician_document_privileges
  ALTER COLUMN id SET NOT NULL;

-- New PK on id
ALTER TABLE public.physician_document_privileges
  ADD PRIMARY KEY (id);

-- Unique constraint: one privilege per staff_role + document_type
CREATE UNIQUE INDEX IF NOT EXISTS pdp_staff_role_doc_type_unique
  ON public.physician_document_privileges(staff_role_id, document_type_id)
  WHERE staff_role_id IS NOT NULL;
