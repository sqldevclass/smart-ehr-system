-- Migration 001: Drop all existing public tables
-- Preserves: hospitals, profiles, staff_invitations (data needed for rebuild)
-- Everything else in public schema is dropped

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
      AND tablename NOT IN (
        'hospitals',
        'profiles',
        'staff_invitations'
      )
  ) LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' 
      || quote_ident(r.tablename) 
      || ' CASCADE';
  END LOOP;
END $$;