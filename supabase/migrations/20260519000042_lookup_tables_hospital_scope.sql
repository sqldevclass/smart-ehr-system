-- Migration 042: Add hospital_id to lookup tables
-- Idempotent: safe to run multiple times

-- ============================================================
-- 1. units_of_measurement
-- ============================================================
ALTER TABLE public.units_of_measurement
  ADD COLUMN IF NOT EXISTS hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE;
ALTER TABLE public.units_of_measurement
  DROP CONSTRAINT IF EXISTS units_of_measurement_code_key;
ALTER TABLE public.units_of_measurement
  DROP CONSTRAINT IF EXISTS units_of_measurement_code_hospital_unique;
ALTER TABLE public.units_of_measurement
  ADD CONSTRAINT units_of_measurement_code_hospital_unique UNIQUE (code, hospital_id);
CREATE INDEX IF NOT EXISTS units_of_measurement_hospital_idx ON public.units_of_measurement(hospital_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='units_of_measurement' AND policyname='units_of_measurement_insert') THEN
    CREATE POLICY "units_of_measurement_insert" ON public.units_of_measurement FOR INSERT TO authenticated WITH CHECK (hospital_id = public.get_my_hospital_id() AND public.has_permission('warehouse.receive_incoming'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='units_of_measurement' AND policyname='units_of_measurement_update') THEN
    CREATE POLICY "units_of_measurement_update" ON public.units_of_measurement FOR UPDATE TO authenticated USING (hospital_id = public.get_my_hospital_id()) WITH CHECK (hospital_id = public.get_my_hospital_id() AND public.has_permission('warehouse.receive_incoming'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='units_of_measurement' AND policyname='units_of_measurement_delete') THEN
    CREATE POLICY "units_of_measurement_delete" ON public.units_of_measurement FOR DELETE TO authenticated USING (hospital_id = public.get_my_hospital_id() AND public.has_permission('warehouse.receive_incoming'));
  END IF;
END $$;

-- ============================================================
-- 2. release_forms
-- ============================================================
ALTER TABLE public.release_forms
  ADD COLUMN IF NOT EXISTS hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE;
ALTER TABLE public.release_forms
  DROP CONSTRAINT IF EXISTS release_forms_code_key;
ALTER TABLE public.release_forms
  DROP CONSTRAINT IF EXISTS release_forms_code_hospital_unique;
ALTER TABLE public.release_forms
  ADD CONSTRAINT release_forms_code_hospital_unique UNIQUE (code, hospital_id);
CREATE INDEX IF NOT EXISTS release_forms_hospital_idx ON public.release_forms(hospital_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='release_forms' AND policyname='release_forms_insert') THEN
    CREATE POLICY "release_forms_insert" ON public.release_forms FOR INSERT TO authenticated WITH CHECK (hospital_id = public.get_my_hospital_id() AND public.has_permission('warehouse.receive_incoming'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='release_forms' AND policyname='release_forms_update') THEN
    CREATE POLICY "release_forms_update" ON public.release_forms FOR UPDATE TO authenticated USING (hospital_id = public.get_my_hospital_id()) WITH CHECK (hospital_id = public.get_my_hospital_id() AND public.has_permission('warehouse.receive_incoming'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='release_forms' AND policyname='release_forms_delete') THEN
    CREATE POLICY "release_forms_delete" ON public.release_forms FOR DELETE TO authenticated USING (hospital_id = public.get_my_hospital_id() AND public.has_permission('warehouse.receive_incoming'));
  END IF;
END $$;

-- ============================================================
-- 3. packaging_types
-- ============================================================
ALTER TABLE public.packaging_types
  ADD COLUMN IF NOT EXISTS hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE;
ALTER TABLE public.packaging_types
  DROP CONSTRAINT IF EXISTS packaging_types_code_key;
ALTER TABLE public.packaging_types
  DROP CONSTRAINT IF EXISTS packaging_types_code_hospital_unique;
ALTER TABLE public.packaging_types
  ADD CONSTRAINT packaging_types_code_hospital_unique UNIQUE (code, hospital_id);
CREATE INDEX IF NOT EXISTS packaging_types_hospital_idx ON public.packaging_types(hospital_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='packaging_types' AND policyname='packaging_types_insert') THEN
    CREATE POLICY "packaging_types_insert" ON public.packaging_types FOR INSERT TO authenticated WITH CHECK (hospital_id = public.get_my_hospital_id() AND public.has_permission('warehouse.receive_incoming'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='packaging_types' AND policyname='packaging_types_update') THEN
    CREATE POLICY "packaging_types_update" ON public.packaging_types FOR UPDATE TO authenticated USING (hospital_id = public.get_my_hospital_id()) WITH CHECK (hospital_id = public.get_my_hospital_id() AND public.has_permission('warehouse.receive_incoming'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='packaging_types' AND policyname='packaging_types_delete') THEN
    CREATE POLICY "packaging_types_delete" ON public.packaging_types FOR DELETE TO authenticated USING (hospital_id = public.get_my_hospital_id() AND public.has_permission('warehouse.receive_incoming'));
  END IF;
END $$;

-- ============================================================
-- 4. product_types
-- ============================================================
ALTER TABLE public.product_types
  ADD COLUMN IF NOT EXISTS hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE;
ALTER TABLE public.product_types
  DROP CONSTRAINT IF EXISTS product_types_code_key;
ALTER TABLE public.product_types
  DROP CONSTRAINT IF EXISTS product_types_code_hospital_unique;
ALTER TABLE public.product_types
  ADD CONSTRAINT product_types_code_hospital_unique UNIQUE (code, hospital_id);
CREATE INDEX IF NOT EXISTS product_types_hospital_idx ON public.product_types(hospital_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='product_types' AND policyname='product_types_insert') THEN
    CREATE POLICY "product_types_insert" ON public.product_types FOR INSERT TO authenticated WITH CHECK (hospital_id = public.get_my_hospital_id() AND public.has_permission('warehouse.receive_incoming'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='product_types' AND policyname='product_types_update') THEN
    CREATE POLICY "product_types_update" ON public.product_types FOR UPDATE TO authenticated USING (hospital_id = public.get_my_hospital_id()) WITH CHECK (hospital_id = public.get_my_hospital_id() AND public.has_permission('warehouse.receive_incoming'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='product_types' AND policyname='product_types_delete') THEN
    CREATE POLICY "product_types_delete" ON public.product_types FOR DELETE TO authenticated USING (hospital_id = public.get_my_hospital_id() AND public.has_permission('warehouse.receive_incoming'));
  END IF;
END $$;