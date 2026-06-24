-- Migration 142: Migrate document_participants from physicians to staff_roles
--
-- document_participants.physician_id referenced the deprecated physicians
-- table. New physicians only have staff_roles rows, causing silent failures
-- in the multi-sig check inside complete_document RPC.

-- ── 1. Drop dependent policies ──────────────────────────────
DROP POLICY IF EXISTS "doc_participants_select" ON public.document_participants;
DROP POLICY IF EXISTS "doc_participants_insert" ON public.document_participants;
DROP POLICY IF EXISTS "doc_participants_update" ON public.document_participants;

-- ── 2. Add staff_role_id as nullable first ───────────────────
ALTER TABLE public.document_participants
  ADD COLUMN IF NOT EXISTS staff_role_id uuid
    REFERENCES public.staff_roles(id) ON DELETE RESTRICT;

-- ── 3. Backfill: map physician_id → staff_role_id
-- Use a subquery to avoid invalid alias reference in UPDATE FROM
UPDATE public.document_participants
SET staff_role_id = (
  SELECT sr.id
  FROM public.physicians ph
  JOIN public.profiles pr  ON pr.id          = ph.profile_id
  JOIN public.staff_roles sr ON sr.person_id  = pr.person_id
    AND sr.hospital_id = document_participants.hospital_id
    AND sr.role_type   = 'physician'
  WHERE ph.id = document_participants.physician_id
  LIMIT 1
)
WHERE physician_id IS NOT NULL
  AND staff_role_id IS NULL;

-- ── 4. Delete rows that could not be backfilled ──────────────
DELETE FROM public.document_participants
WHERE staff_role_id IS NULL;

-- ── 5. Enforce NOT NULL ──────────────────────────────────────
ALTER TABLE public.document_participants
  ALTER COLUMN staff_role_id SET NOT NULL;

-- ── 6. Drop old unique constraint, index, and physician_id ───
ALTER TABLE public.document_participants
  DROP CONSTRAINT IF EXISTS document_participants_patient_document_id_physician_id_key;

DROP INDEX IF EXISTS doc_participants_document_idx;

ALTER TABLE public.document_participants
  DROP COLUMN IF EXISTS physician_id;

-- ── 7. Add new unique constraint and indexes ─────────────────
ALTER TABLE public.document_participants
  ADD CONSTRAINT doc_participants_unique
    UNIQUE (patient_document_id, staff_role_id);

CREATE INDEX doc_participants_document_idx
  ON public.document_participants (patient_document_id);

CREATE INDEX doc_participants_staff_role_idx
  ON public.document_participants (staff_role_id);

-- ── 8. Recreate RLS policies ─────────────────────────────────
CREATE POLICY "doc_participants_select" ON public.document_participants
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "doc_participants_insert" ON public.document_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('documents.complete')
  );

CREATE POLICY "doc_participants_update" ON public.document_participants
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('documents.complete')
  );
