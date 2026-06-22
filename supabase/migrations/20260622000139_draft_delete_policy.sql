-- Migration 139: Add DELETE policy for drafted prescriptions
--
-- Physicians need to remove their own draft prescriptions
-- before ordering. The existing RLS has SELECT, INSERT, UPDATE
-- but no DELETE. Drafts (is_drafted = true) are pre-order
-- client-side working state — safe to delete before submission.
-- Scope: own hospital + drafted only.

CREATE POLICY "drug_prescriptions_delete_draft"
  ON public.drug_prescriptions
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND is_drafted = true
  );
