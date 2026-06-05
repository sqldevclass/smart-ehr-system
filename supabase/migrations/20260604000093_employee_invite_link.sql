-- Migration 093: Link staff_invitations to employees
-- Enforces the rule: admin can only invite via an existing employee record
-- employee_id is the authoritative source of email/name for invitations

-- 1. Add employee_id FK to staff_invitations
ALTER TABLE public.staff_invitations
  ADD COLUMN IF NOT EXISTS employee_id uuid
    REFERENCES public.employees(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS staff_invitations_employee_idx
  ON public.staff_invitations(employee_id);

-- 2. Prevent double-inviting the same employee
--    (only one pending invite per employee at a time)
CREATE UNIQUE INDEX IF NOT EXISTS staff_invitations_employee_pending_unique
  ON public.staff_invitations(employee_id)
  WHERE status = 'pending' AND employee_id IS NOT NULL;

-- 3. Prevent inviting an employee who already has a user account
--    Enforced in the edge function, but add a DB-level check:
--    employees.profile_id must be NULL for a pending invite to exist
--    (enforced via edge function — no pure SQL constraint needed here
--     since profile_id lives on a different table)
