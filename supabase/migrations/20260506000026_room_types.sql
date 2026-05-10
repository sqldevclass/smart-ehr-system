-- Migration 026: Convert room_type from hardcoded CHECK to lookup table
-- Room types are hospital-managed, not platform-level enums

-- Step 1: Create room_types lookup table
CREATE TABLE public.room_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  name        text NOT NULL,
  is_active   boolean DEFAULT true,
  UNIQUE (hospital_id, name)
);

CREATE INDEX room_types_hospital_idx ON public.room_types(hospital_id);

ALTER TABLE public.room_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "room_types_select" ON public.room_types
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "room_types_insert" ON public.room_types
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_settings')
  );

CREATE POLICY "room_types_update" ON public.room_types
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_settings')
  );

-- Step 2: Seed existing room types for Kaiser Test
INSERT INTO public.room_types (hospital_id, name) VALUES
  ('cf74311c-1827-4066-9376-f9270815c339', 'Ward'),
  ('cf74311c-1827-4066-9376-f9270815c339', 'Procedure'),
  ('cf74311c-1827-4066-9376-f9270815c339', 'Laboratory'),
  ('cf74311c-1827-4066-9376-f9270815c339', 'Imaging'),
  ('cf74311c-1827-4066-9376-f9270815c339', 'ICU'),
  ('cf74311c-1827-4066-9376-f9270815c339', 'Operating Room'),
  ('cf74311c-1827-4066-9376-f9270815c339', 'Emergency');

-- Step 3: Add room_type_id column to rooms
ALTER TABLE public.rooms
  ADD COLUMN room_type_id uuid REFERENCES public.room_types(id);

-- Step 4: Migrate existing room_type text values to room_type_id
UPDATE public.rooms r
SET room_type_id = rt.id
FROM public.room_types rt
WHERE rt.hospital_id = r.hospital_id
  AND LOWER(rt.name) = LOWER(r.room_type);

-- Step 5: Drop the old room_type text column and CHECK constraint
ALTER TABLE public.rooms
  DROP COLUMN room_type;

-- Step 6: Make room_type_id required going forward
-- (not NOT NULL immediately to avoid breaking existing nulls)
-- Admin will assign types to existing rooms via UI