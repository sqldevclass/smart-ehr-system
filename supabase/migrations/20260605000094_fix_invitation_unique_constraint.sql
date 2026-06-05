-- Migration 094: Fix staff_invitations unique constraint
-- Old constraint blocked re-inviting the same email after removal.
-- Replace with a partial unique index — only one pending invite per email per hospital.

ALTER TABLE public.staff_invitations
DROP CONSTRAINT IF EXISTS staff_invitations_hospital_email_unique;

CREATE UNIQUE INDEX IF NOT EXISTS staff_invitations_pending_email_unique
  ON public.staff_invitations(hospital_id, email)
  WHERE status = 'pending';
