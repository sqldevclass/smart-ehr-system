-- Migration 005: Audit Log
-- Append-only table tracking all important state changes.
-- No UPDATE or DELETE ever permitted on this table.
-- Written by triggers only — never by application code directly.

CREATE TABLE public.audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id  uuid REFERENCES public.hospitals(id),
  table_name   text NOT NULL,
  record_id    uuid NOT NULL,
  operation    text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  old_values   jsonb,
  new_values   jsonb,
  performed_by uuid REFERENCES public.profiles(id),
  performed_at timestamptz DEFAULT now()
);

-- Index for common queries
CREATE INDEX audit_logs_hospital_id_idx ON public.audit_logs(hospital_id);
CREATE INDEX audit_logs_table_record_idx ON public.audit_logs(table_name, record_id);
CREATE INDEX audit_logs_performed_at_idx ON public.audit_logs(performed_at DESC);

-- ============================================================
-- Generic audit trigger function
-- Applied to specific tables in later migrations
-- Captures old and new values as jsonb
-- Gets performed_by from current user's profile
-- ============================================================

CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hospital_id uuid;
  v_record_id   uuid;
  v_old_values  jsonb;
  v_new_values  jsonb;
BEGIN
  -- Get hospital_id and record_id from the affected row
  IF TG_OP = 'DELETE' THEN
    v_hospital_id := OLD.hospital_id;
    v_record_id   := OLD.id;
    v_old_values  := to_jsonb(OLD);
    v_new_values  := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_hospital_id := NEW.hospital_id;
    v_record_id   := NEW.id;
    v_old_values  := NULL;
    v_new_values  := to_jsonb(NEW);
  ELSE -- UPDATE
    v_hospital_id := NEW.hospital_id;
    v_record_id   := NEW.id;
    v_old_values  := to_jsonb(OLD);
    v_new_values  := to_jsonb(NEW);
  END IF;

  INSERT INTO public.audit_logs (
    hospital_id,
    table_name,
    record_id,
    operation,
    old_values,
    new_values,
    performed_by
  ) VALUES (
    v_hospital_id,
    TG_TABLE_NAME,
    v_record_id,
    TG_OP,
    v_old_values,
    v_new_values,
    auth.uid()
  );

  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    -- Never let audit failure block the main operation
    -- Log the error but continue
    RAISE WARNING 'Audit log failed for % on %: %', 
      TG_OP, TG_TABLE_NAME, SQLERRM;
    RETURN NULL;
END;
$$;