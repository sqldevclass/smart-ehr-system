-- Migration 037: Add missing unique constraint on staff_invitations (hospital_id, email)
-- Required for upsert conflict resolution in invite-staff-user Edge Function

ALTER TABLE public.staff_invitations
ADD CONSTRAINT staff_invitations_hospital_email_unique
UNIQUE (hospital_id, email);