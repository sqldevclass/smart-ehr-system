-- Migration 062: Clean up physicians table
-- Drop redundant specialization text column
-- specialization_id FK replaces it
-- employee_id is now the link to HR data

ALTER TABLE public.physicians
  DROP COLUMN IF EXISTS specialization;