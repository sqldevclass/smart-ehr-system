-- Migration 095: Add employment_status to employees
-- Replaces is_active boolean with a proper enum.
-- is_active is kept as a generated column for backward compatibility.

-- 1. Create enum
CREATE TYPE public.employment_status AS ENUM ('active', 'fired', 'released');

-- 2. Add employment_status column
ALTER TABLE public.employees
  ADD COLUMN employment_status public.employment_status
    NOT NULL DEFAULT 'active';

-- 3. Migrate existing data
UPDATE public.employees
  SET employment_status = CASE
    WHEN is_active = true THEN 'active'::public.employment_status
    ELSE 'fired'::public.employment_status
  END;

-- 4. Drop old is_active column and replace with generated column
ALTER TABLE public.employees DROP COLUMN is_active;

ALTER TABLE public.employees
  ADD COLUMN is_active boolean
    GENERATED ALWAYS AS (employment_status = 'active') STORED;

-- 5. Add fired_at / released_at timestamps for audit trail
ALTER TABLE public.employees
  ADD COLUMN status_changed_at timestamptz,
  ADD COLUMN status_changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 6. Index for filtering active vs former employees
CREATE INDEX employees_employment_status_idx
  ON public.employees(hospital_id, employment_status);
