-- Migration 027: Change room_assignments.bed_number from text to integer
-- Bed numbers are always numeric — enforces data integrity
-- and enables visual bed picker

ALTER TABLE public.room_assignments
  ALTER COLUMN bed_number TYPE integer
  USING bed_number::integer;