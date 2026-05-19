-- Migration 036: Phase 5 Schema Gap Closures
--
-- Migration 035 already covers:
--   warehouses.department_id
--   inventory_batches.series_number, markup_percent, selling_price
--   write_off_records.employee_id
--   products table with inn, min_stock_quantity, expiry_notify_days
--
-- This migration adds only what 035 did not:
--   1. inventory_batches: batch_number, barcode
--   2. drug_formulary: CREATE TABLE
--   3. units_of_measurement, release_forms, packaging_types: hospital_id
--   4. profiles: department_id
--   5. Head Nurse warehouse permissions
--   6. inventory_batches RLS fix for Head Nurse dept scoping

-- ============================================================
-- 1. inventory_batches — batch_number and barcode
-- ============================================================

ALTER TABLE public.inventory_batches
  ADD COLUMN batch_number text,
  ADD COLUMN barcode      text;

COMMENT ON COLUMN public.inventory_batches.series_number IS
  'Pharmaceutical lot/series number — Central Pharmacy.';
COMMENT ON COLUMN public.inventory_batches.batch_number IS
  'Inventory batch number — General Warehouse.';
COMMENT ON COLUMN public.inventory_batches.barcode IS
  'Item barcode — General Warehouse items.';

-- ============================================================
-- 2. drug_formulary
-- ============================================================

CREATE TABLE public.drug_formulary (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id             uuid NOT NULL
                            REFERENCES public.hospitals(id) ON DELETE CASCADE,
  trade_name              text NOT NULL,
  inn                     text NOT NULL,
  release_form_id         uuid REFERENCES public.release_forms(id),
  packaging_id            uuid REFERENCES public.packaging_types(id),
  unit_id                 uuid REFERENCES public.units_of_measurement(id),
  manufacturer_id         uuid REFERENCES public.manufacturers(id) ON DELETE SET NULL,
  dose                    text,
  min_write_off_qty       numeric(10,3)
                            CONSTRAINT chk_min_writeoff_positive
                            CHECK (min_write_off_qty IS NULL OR min_write_off_qty > 0),
  min_quantity            numeric(10,3)
                            CONSTRAINT chk_min_qty_positive
                            CHECK (min_quantity IS NULL OR min_quantity > 0),
  expiry_notify_days      integer DEFAULT 30
                            CONSTRAINT chk_expiry_notify_positive
                            CHECK (expiry_notify_days > 0),
  notify_below_min_qty    numeric(10,3)
                            CONSTRAINT chk_notify_below_min_positive
                            CHECK (notify_below_min_qty IS NULL OR notify_below_min_qty > 0),
  clinical_effect         text,
  clinical_significance   text,
  actions_recommendations text,
  is_active               boolean DEFAULT true,
  created_at              timestamptz DEFAULT now()
);

COMMENT ON COLUMN public.drug_formulary.min_write_off_qty IS
  'Minimum quantity per single write-off operation.';
COMMENT ON COLUMN public.drug_formulary.min_quantity IS
  'Minimum stock level before low-stock alert fires.';
COMMENT ON COLUMN public.drug_formulary.expiry_notify_days IS
  'Days before expiry to show expiry alert.';
COMMENT ON COLUMN public.drug_formulary.notify_below_min_qty IS
  'Alert threshold — notify when stock drops below this quantity.
   e.g. 10 = alert when fewer than 10 units remain.';

CREATE INDEX drug_formulary_hospital_idx ON public.drug_formulary(hospital_id);
CREATE INDEX drug_formulary_inn_idx      ON public.drug_formulary(inn);
CREATE INDEX drug_formulary_name_idx     ON public.drug_formulary(trade_name);

ALTER TABLE public.drug_formulary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drug_formulary_select" ON public.drug_formulary
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "drug_formulary_insert" ON public.drug_formulary
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('system.manage_settings')
      OR public.has_permission('warehouse.receive_incoming')
    )
  );

CREATE POLICY "drug_formulary_update" ON public.drug_formulary
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('system.manage_settings')
      OR public.has_permission('warehouse.receive_incoming')
    )
  );

-- No DELETE policy — deactivate via is_active = false

-- ============================================================
-- 3. units_of_measurement — hospital-overridable
-- ============================================================

ALTER TABLE public.units_of_measurement
  ADD COLUMN hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE;

CREATE INDEX uom_hospital_idx ON public.units_of_measurement(hospital_id)
  WHERE hospital_id IS NOT NULL;

DROP POLICY IF EXISTS "units_select" ON public.units_of_measurement;

CREATE POLICY "units_select" ON public.units_of_measurement
  FOR SELECT TO authenticated
  USING (
    hospital_id IS NULL
    OR hospital_id = public.get_my_hospital_id()
  );

CREATE POLICY "units_insert" ON public.units_of_measurement
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('system.manage_settings')
      OR public.has_permission('warehouse.receive_incoming')
    )
  );

CREATE POLICY "units_update" ON public.units_of_measurement
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('system.manage_settings')
      OR public.has_permission('warehouse.receive_incoming')
    )
  );

CREATE POLICY "units_delete" ON public.units_of_measurement
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_settings')
  );

-- ============================================================
-- 4. release_forms — hospital-overridable
-- ============================================================

ALTER TABLE public.release_forms
  ADD COLUMN hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE;

CREATE INDEX release_forms_hospital_idx ON public.release_forms(hospital_id)
  WHERE hospital_id IS NOT NULL;

DROP POLICY IF EXISTS "release_forms_select" ON public.release_forms;

CREATE POLICY "release_forms_select" ON public.release_forms
  FOR SELECT TO authenticated
  USING (
    hospital_id IS NULL
    OR hospital_id = public.get_my_hospital_id()
  );

CREATE POLICY "release_forms_insert" ON public.release_forms
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('system.manage_settings')
      OR public.has_permission('warehouse.receive_incoming')
    )
  );

CREATE POLICY "release_forms_update" ON public.release_forms
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('system.manage_settings')
      OR public.has_permission('warehouse.receive_incoming')
    )
  );

CREATE POLICY "release_forms_delete" ON public.release_forms
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_settings')
  );

-- ============================================================
-- 5. packaging_types — hospital-overridable
-- ============================================================

ALTER TABLE public.packaging_types
  ADD COLUMN hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE;

CREATE INDEX packaging_types_hospital_idx ON public.packaging_types(hospital_id)
  WHERE hospital_id IS NOT NULL;

DROP POLICY IF EXISTS "packaging_types_select" ON public.packaging_types;

CREATE POLICY "packaging_types_select" ON public.packaging_types
  FOR SELECT TO authenticated
  USING (
    hospital_id IS NULL
    OR hospital_id = public.get_my_hospital_id()
  );

CREATE POLICY "packaging_types_insert" ON public.packaging_types
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('system.manage_settings')
      OR public.has_permission('warehouse.receive_incoming')
    )
  );

CREATE POLICY "packaging_types_update" ON public.packaging_types
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('system.manage_settings')
      OR public.has_permission('warehouse.receive_incoming')
    )
  );

CREATE POLICY "packaging_types_delete" ON public.packaging_types
  FOR DELETE TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_settings')
  );

-- ============================================================
-- 6. profiles — department_id for dept-scoped staff
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN department_id uuid
    REFERENCES public.departments(id) ON DELETE SET NULL;

CREATE INDEX profiles_department_idx ON public.profiles(department_id)
  WHERE department_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.department_id IS
  'Set for department-scoped staff (head_nurse, inpatient_nurse).
   NULL for hospital-wide roles. Drives warehouse RLS scoping.';

-- ============================================================
-- 7. Head Nurse warehouse permissions
-- ============================================================

INSERT INTO public.permissions (code, name_ru, name_en, module)
VALUES
  ('warehouse.department_view',
   'Просмотр склада отделения', 'View department warehouse', 'warehouse'),
  ('warehouse.department_order',
   'Заказать со склада', 'Order from warehouse', 'warehouse'),
  ('warehouse.department_writeoff',
   'Списание отделения', 'Department write-off', 'warehouse')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'head_nurse'
  AND p.code IN (
    'warehouse.department_view',
    'warehouse.department_order',
    'warehouse.department_writeoff'
  )
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'inpatient_nurse'
  AND p.code = 'warehouse.department_view'
ON CONFLICT DO NOTHING;

-- ============================================================
-- 8. Fix inventory_batches RLS — use profiles.department_id
-- ============================================================

DROP POLICY IF EXISTS "inventory_batches_select" ON public.inventory_batches;

CREATE POLICY "inventory_batches_select" ON public.inventory_batches
  FOR SELECT TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('warehouse.view_all')
      OR (
        public.has_permission('warehouse.department_view')
        AND EXISTS (
          SELECT 1
          FROM public.warehouses w
          JOIN public.profiles pr ON pr.department_id = w.department_id
          WHERE w.id = inventory_batches.warehouse_id
            AND w.department_id IS NOT NULL
            AND pr.id = auth.uid()
        )
      )
    )
  );

-- ============================================================
-- 9. Verification
-- ============================================================

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory_batches'
      AND column_name = 'batch_number'
  ), 'FAIL: batch_number missing from inventory_batches';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'drug_formulary'
  ), 'FAIL: drug_formulary table missing';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'drug_formulary'
      AND column_name = 'notify_below_min_qty'
  ), 'FAIL: notify_below_min_qty missing from drug_formulary';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'units_of_measurement'
      AND column_name = 'hospital_id'
  ), 'FAIL: hospital_id missing from units_of_measurement';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'department_id'
  ), 'FAIL: department_id missing from profiles';

  ASSERT EXISTS (
    SELECT 1 FROM public.permissions
    WHERE code = 'warehouse.department_view'
  ), 'FAIL: warehouse.department_view permission missing';

  RAISE NOTICE 'Migration 036 verification passed.';
END;
$$;