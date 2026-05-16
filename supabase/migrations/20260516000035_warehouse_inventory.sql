-- Migration 035: Warehouse & Inventory
-- Phase 5 — warehouses, suppliers, manufacturers, products,
-- inventory_batches, inventory_transactions, transfer_records,
-- transfer_record_items, write_off_records, write_off_record_items,
-- equipment, equipment_service_records

-- ============================================================
-- WAREHOUSES
-- ============================================================

CREATE TABLE public.warehouses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id       uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  warehouse_type_id uuid NOT NULL REFERENCES public.warehouse_types(id),
  department_id     uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  name              text NOT NULL,
  is_active         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  UNIQUE (hospital_id, name)
);

CREATE INDEX warehouses_hospital_idx ON public.warehouses(hospital_id);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warehouses_select" ON public.warehouses
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "warehouses_insert" ON public.warehouses
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_settings')
  );

CREATE POLICY "warehouses_update" ON public.warehouses
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('system.manage_settings')
  );

-- Seed Kaiser Test hospital with Central Pharmacy + General Warehouse
INSERT INTO public.warehouses (hospital_id, warehouse_type_id, name)
SELECT
  'cf74311c-1827-4066-9376-f9270815c339',
  id,
  'Центральная аптека'
FROM public.warehouse_types WHERE code = 'central_pharmacy';

INSERT INTO public.warehouses (hospital_id, warehouse_type_id, name)
SELECT
  'cf74311c-1827-4066-9376-f9270815c339',
  id,
  'Общий склад'
FROM public.warehouse_types WHERE code = 'general';

-- ============================================================
-- SUPPLIERS
-- ============================================================

CREATE TABLE public.suppliers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  name        text NOT NULL,
  contact     text,
  phone       text,
  email       text,
  address     text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (hospital_id, name)
);

CREATE INDEX suppliers_hospital_idx ON public.suppliers(hospital_id);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_select" ON public.suppliers
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "suppliers_insert" ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('warehouse.receive_incoming')
  );

CREATE POLICY "suppliers_update" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('warehouse.receive_incoming')
  );

-- ============================================================
-- MANUFACTURERS
-- ============================================================

CREATE TABLE public.manufacturers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  name        text NOT NULL,
  country     text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (hospital_id, name)
);

CREATE INDEX manufacturers_hospital_idx ON public.manufacturers(hospital_id);

ALTER TABLE public.manufacturers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manufacturers_select" ON public.manufacturers
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "manufacturers_insert" ON public.manufacturers
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('warehouse.receive_incoming')
  );

CREATE POLICY "manufacturers_update" ON public.manufacturers
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('warehouse.receive_incoming')
  );

-- ============================================================
-- PRODUCTS
-- Catalog of items that can be stocked in warehouses
-- ============================================================

CREATE TABLE public.products (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id         uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  product_type_id     uuid NOT NULL REFERENCES public.product_types(id),
  manufacturer_id     uuid REFERENCES public.manufacturers(id) ON DELETE SET NULL,
  unit_id             uuid REFERENCES public.units_of_measurement(id),
  release_form_id     uuid REFERENCES public.release_forms(id),
  packaging_type_id   uuid REFERENCES public.packaging_types(id),
  name                text NOT NULL,
  inn                 text,       -- for medications: international non-proprietary name
  barcode             text,
  units_per_package   numeric(10,3) DEFAULT 1, -- e.g. 10 tablets per pack
  min_stock_quantity  numeric(12,3) DEFAULT 0,
  expiry_notify_days  int DEFAULT 30,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (hospital_id, name, release_form_id)
);

CREATE INDEX products_hospital_idx ON public.products(hospital_id);
CREATE INDEX products_type_idx ON public.products(product_type_id);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select" ON public.products
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "products_insert" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('warehouse.receive_incoming')
  );

CREATE POLICY "products_update" ON public.products
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('warehouse.receive_incoming')
  );

  -- ============================================================
-- INVENTORY BATCHES
-- Each row = one stock receipt (one delivery of one product)
-- Quantities tracked at batch level for FIFO write-off by expiry
-- ============================================================

CREATE TABLE public.inventory_batches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id       uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  warehouse_id      uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  product_id        uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  supplier_id       uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  series_number     text,
  expiry_date       date,
  quantity_packages numeric(12,3) NOT NULL CHECK (quantity_packages >= 0),
  quantity_units    numeric(12,3) NOT NULL CHECK (quantity_units >= 0),
  purchase_price    numeric(12,2),   -- per package
  markup_percent    numeric(5,2) DEFAULT 0,
  selling_price     numeric(12,2) GENERATED ALWAYS AS (
                      purchase_price * (1 + COALESCE(markup_percent, 0) / 100)
                    ) STORED,
  received_by       uuid REFERENCES public.profiles(id),
  received_at       timestamptz DEFAULT now(),
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX inventory_batches_hospital_idx ON public.inventory_batches(hospital_id);
CREATE INDEX inventory_batches_warehouse_idx ON public.inventory_batches(warehouse_id);
CREATE INDEX inventory_batches_product_idx ON public.inventory_batches(product_id);
CREATE INDEX inventory_batches_expiry_idx ON public.inventory_batches(expiry_date);

ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;

-- Base policy: warehouse.view_all sees everything in hospital
-- Head Nurse: sees only their department's warehouse
CREATE POLICY "inventory_batches_select" ON public.inventory_batches
  FOR SELECT TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('warehouse.view_all')
      OR EXISTS (
        SELECT 1 FROM public.warehouses w
        WHERE w.id = inventory_batches.warehouse_id
          AND w.hospital_id = public.get_my_hospital_id()
          AND (
            -- department warehouse: head nurse sees own department only
            w.department_id IS NULL
            OR w.department_id IN (
              SELECT r.department_id FROM public.room_assignments ra
              JOIN public.rooms r ON r.id = ra.room_id
              JOIN public.hospitalizations h ON h.id = ra.hospitalization_id
              WHERE h.hospital_id = public.get_my_hospital_id()
            )
          )
      )
    )
  );

CREATE POLICY "inventory_batches_insert" ON public.inventory_batches
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('warehouse.receive_incoming')
  );

CREATE POLICY "inventory_batches_update" ON public.inventory_batches
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('warehouse.receive_incoming')
      OR public.has_permission('warehouse.writeoff')
      OR public.has_permission('warehouse.transfer_accept')
    )
  );

-- ============================================================
-- INVENTORY TRANSACTIONS
-- Append-only ledger of all stock movements
-- source_type: 'incoming' | 'transfer_out' | 'transfer_in' | 'writeoff' | 'consumable'
-- ============================================================

CREATE TABLE public.inventory_transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id         uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  warehouse_id        uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  inventory_batch_id  uuid NOT NULL REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
  product_id          uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  source_type         text NOT NULL CHECK (source_type IN (
                        'incoming', 'transfer_out', 'transfer_in',
                        'writeoff', 'consumable'
                      )),
  quantity_packages   numeric(12,3) NOT NULL, -- negative = deduction
  quantity_units      numeric(12,3) NOT NULL,
  reference_id        uuid,   -- transfer_record_id, write_off_record_id, visit_service_id
  performed_by        uuid REFERENCES public.profiles(id),
  performed_at        timestamptz DEFAULT now()
);

CREATE INDEX inventory_transactions_hospital_idx ON public.inventory_transactions(hospital_id);
CREATE INDEX inventory_transactions_warehouse_idx ON public.inventory_transactions(warehouse_id);
CREATE INDEX inventory_transactions_batch_idx ON public.inventory_transactions(inventory_batch_id);
CREATE INDEX inventory_transactions_performed_at_idx ON public.inventory_transactions(performed_at);

-- Audit trigger
CREATE TRIGGER inventory_transactions_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_transactions_select" ON public.inventory_transactions
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

-- Append-only: insert only, no update/delete
CREATE POLICY "inventory_transactions_insert" ON public.inventory_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('warehouse.receive_incoming')
      OR public.has_permission('warehouse.transfer_send')
      OR public.has_permission('warehouse.transfer_accept')
      OR public.has_permission('warehouse.writeoff')
    )
  );

  -- ============================================================
-- TRANSFER RECORDS
-- Two-step transfer: pending_acceptance → accepted
-- Sender creates record + items → receiver accepts
-- On acceptance: inventory_batches quantities updated via RPC
-- ============================================================

CREATE TABLE public.transfer_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id     uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  from_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id   uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  status          text NOT NULL DEFAULT 'pending_acceptance'
                    CHECK (status IN ('pending_acceptance', 'accepted', 'cancelled')),
  notes           text,
  sent_by         uuid REFERENCES public.profiles(id),
  sent_at         timestamptz DEFAULT now(),
  accepted_by     uuid REFERENCES public.profiles(id),
  accepted_at     timestamptz,
  cancelled_by    uuid REFERENCES public.profiles(id),
  cancelled_at    timestamptz,
  created_at      timestamptz DEFAULT now(),
  CONSTRAINT transfer_different_warehouses CHECK (from_warehouse_id != to_warehouse_id)
);

CREATE INDEX transfer_records_hospital_idx ON public.transfer_records(hospital_id);
CREATE INDEX transfer_records_status_idx ON public.transfer_records(status);
CREATE INDEX transfer_records_to_warehouse_idx ON public.transfer_records(to_warehouse_id);

ALTER TABLE public.transfer_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transfer_records_select" ON public.transfer_records
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "transfer_records_insert" ON public.transfer_records
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('warehouse.transfer_send')
  );

CREATE POLICY "transfer_records_update" ON public.transfer_records
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND (
      public.has_permission('warehouse.transfer_send')
      OR public.has_permission('warehouse.transfer_accept')
    )
  );

-- ============================================================
-- TRANSFER RECORD ITEMS
-- Line items on a transfer record
-- ============================================================

CREATE TABLE public.transfer_record_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_record_id  uuid NOT NULL REFERENCES public.transfer_records(id) ON DELETE CASCADE,
  hospital_id         uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  inventory_batch_id  uuid NOT NULL REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
  product_id          uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity_packages   numeric(12,3) NOT NULL CHECK (quantity_packages > 0),
  quantity_units      numeric(12,3) NOT NULL CHECK (quantity_units > 0)
);

CREATE INDEX transfer_record_items_record_idx ON public.transfer_record_items(transfer_record_id);
CREATE INDEX transfer_record_items_hospital_idx ON public.transfer_record_items(hospital_id);

ALTER TABLE public.transfer_record_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transfer_record_items_select" ON public.transfer_record_items
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "transfer_record_items_insert" ON public.transfer_record_items
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('warehouse.transfer_send')
  );

-- ============================================================
-- WRITE-OFF RECORDS
-- Three types: act (damaged), employee (salary deduction), return_supplier
-- ============================================================

CREATE TABLE public.write_off_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id         uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  warehouse_id        uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  write_off_type_id   uuid NOT NULL REFERENCES public.write_off_types(id),
  employee_id         uuid REFERENCES public.profiles(id), -- for type = 'employee'
  supplier_id         uuid REFERENCES public.suppliers(id), -- for type = 'return_supplier'
  notes               text,
  written_off_by      uuid REFERENCES public.profiles(id),
  written_off_at      timestamptz DEFAULT now(),
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX write_off_records_hospital_idx ON public.write_off_records(hospital_id);
CREATE INDEX write_off_records_warehouse_idx ON public.write_off_records(warehouse_id);

-- Audit trigger
CREATE TRIGGER write_off_records_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.write_off_records
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

ALTER TABLE public.write_off_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "write_off_records_select" ON public.write_off_records
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "write_off_records_insert" ON public.write_off_records
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('warehouse.writeoff')
  );

-- ============================================================
-- WRITE-OFF RECORD ITEMS
-- Line items on a write-off record (FIFO by expiry date)
-- ============================================================

CREATE TABLE public.write_off_record_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  write_off_record_id uuid NOT NULL REFERENCES public.write_off_records(id) ON DELETE CASCADE,
  hospital_id         uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  inventory_batch_id  uuid NOT NULL REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
  product_id          uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity_packages   numeric(12,3) NOT NULL CHECK (quantity_packages > 0),
  quantity_units      numeric(12,3) NOT NULL CHECK (quantity_units > 0)
);

CREATE INDEX write_off_record_items_record_idx ON public.write_off_record_items(write_off_record_id);
CREATE INDEX write_off_record_items_hospital_idx ON public.write_off_record_items(hospital_id);

ALTER TABLE public.write_off_record_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "write_off_record_items_select" ON public.write_off_record_items
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "write_off_record_items_insert" ON public.write_off_record_items
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('warehouse.writeoff')
  );

  -- ============================================================
-- EQUIPMENT
-- Medical equipment register
-- ============================================================

CREATE TABLE public.equipment (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id           uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id         uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  name                  text NOT NULL,
  model                 text,
  serial_number         text,
  manufacturer_id       uuid REFERENCES public.manufacturers(id) ON DELETE SET NULL,
  purchase_date         date,
  purchase_price        numeric(12,2),
  warranty_expiry_date  date,
  next_service_date     date,
  service_interval_days int,   -- auto-compute next_service_date after each service
  notes                 text,
  is_active             boolean DEFAULT true,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX equipment_hospital_idx ON public.equipment(hospital_id);
CREATE INDEX equipment_next_service_idx ON public.equipment(next_service_date);

ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipment_select" ON public.equipment
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "equipment_insert" ON public.equipment
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('warehouse.view_all')
  );

CREATE POLICY "equipment_update" ON public.equipment
  FOR UPDATE TO authenticated
  USING (hospital_id = public.get_my_hospital_id())
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('warehouse.view_all')
  );

-- ============================================================
-- EQUIPMENT SERVICE RECORDS
-- History of maintenance and servicing per equipment
-- ============================================================

CREATE TABLE public.equipment_service_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id     uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  equipment_id    uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  serviced_at     date NOT NULL,
  serviced_by     text,   -- external company or person name
  notes           text,
  cost            numeric(12,2),
  next_service_date date, -- when set, updates equipment.next_service_date
  created_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX equipment_service_records_equipment_idx
  ON public.equipment_service_records(equipment_id);
CREATE INDEX equipment_service_records_hospital_idx
  ON public.equipment_service_records(hospital_id);

-- After inserting a service record, update equipment.next_service_date
CREATE OR REPLACE FUNCTION public.update_equipment_next_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.next_service_date IS NOT NULL THEN
    UPDATE public.equipment
    SET next_service_date = NEW.next_service_date
    WHERE id = NEW.equipment_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER equipment_service_update_next_date
  AFTER INSERT ON public.equipment_service_records
  FOR EACH ROW EXECUTE FUNCTION public.update_equipment_next_service();

ALTER TABLE public.equipment_service_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipment_service_records_select" ON public.equipment_service_records
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "equipment_service_records_insert" ON public.equipment_service_records
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.has_permission('warehouse.view_all')
  );

-- ============================================================
-- general_clinic_stock VIEW
-- Aggregated stock across Central Pharmacy + General Warehouse
-- Shows current quantity per product per warehouse
-- ============================================================

CREATE OR REPLACE VIEW public.general_clinic_stock AS
SELECT
  ib.hospital_id,
  ib.warehouse_id,
  w.name                        AS warehouse_name,
  wt.code                       AS warehouse_type,
  ib.product_id,
  p.name                        AS product_name,
  pt.code                       AS product_type,
  p.inn,
  p.barcode,
  p.min_stock_quantity,
  p.expiry_notify_days,
  u.abbreviation                AS unit,
  SUM(ib.quantity_packages)     AS total_packages,
  SUM(ib.quantity_units)        AS total_units,
  MIN(ib.expiry_date)           AS earliest_expiry,
  COUNT(ib.id)                  AS batch_count
FROM public.inventory_batches ib
JOIN public.warehouses w       ON w.id = ib.warehouse_id
JOIN public.warehouse_types wt ON wt.id = w.warehouse_type_id
JOIN public.products p         ON p.id = ib.product_id
JOIN public.product_types pt   ON pt.id = p.product_type_id
LEFT JOIN public.units_of_measurement u ON u.id = p.unit_id
WHERE ib.quantity_packages > 0
  AND wt.code IN ('central_pharmacy', 'general')
GROUP BY
  ib.hospital_id, ib.warehouse_id, w.name, wt.code,
  ib.product_id, p.name, pt.code, p.inn, p.barcode,
  p.min_stock_quantity, p.expiry_notify_days, u.abbreviation;

-- ============================================================
-- accept_transfer RPC
-- Called when Head Nurse / receiver clicks Accept
-- Atomically:
--   1. Validates transfer is pending_acceptance
--   2. Deducts quantity from source inventory_batches
--   3. Creates new inventory_batch at destination warehouse
--   4. Inserts inventory_transaction rows for both sides
--   5. Marks transfer_record as accepted
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_transfer(
  p_transfer_record_id uuid,
  p_hospital_id        uuid,
  p_accepted_by        uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer    record;
  v_item        record;
  v_new_batch   uuid;
BEGIN
  -- Lock and validate transfer record
  SELECT * INTO v_transfer
  FROM public.transfer_records
  WHERE id = p_transfer_record_id
    AND hospital_id = p_hospital_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer record not found: %', p_transfer_record_id;
  END IF;

  IF v_transfer.status != 'pending_acceptance' THEN
    RAISE EXCEPTION 'Transfer is not pending acceptance. Current status: %', v_transfer.status;
  END IF;

  -- Process each line item
  FOR v_item IN
    SELECT * FROM public.transfer_record_items
    WHERE transfer_record_id = p_transfer_record_id
  LOOP
    -- Deduct from source batch
    UPDATE public.inventory_batches
    SET
      quantity_packages = quantity_packages - v_item.quantity_packages,
      quantity_units    = quantity_units    - v_item.quantity_units
    WHERE id = v_item.inventory_batch_id;

    -- Verify no negative stock
    IF (SELECT quantity_packages FROM public.inventory_batches
        WHERE id = v_item.inventory_batch_id) < 0 THEN
      RAISE EXCEPTION 'Insufficient stock in batch % for product %',
        v_item.inventory_batch_id, v_item.product_id;
    END IF;

    -- Record outgoing transaction
    INSERT INTO public.inventory_transactions (
      hospital_id, warehouse_id, inventory_batch_id, product_id,
      source_type, quantity_packages, quantity_units,
      reference_id, performed_by, performed_at
    )
    SELECT
      p_hospital_id,
      v_transfer.from_warehouse_id,
      v_item.inventory_batch_id,
      v_item.product_id,
      'transfer_out',
      -v_item.quantity_packages,
      -v_item.quantity_units,
      p_transfer_record_id,
      p_accepted_by,
      now();

    -- Create new batch at destination warehouse
    INSERT INTO public.inventory_batches (
      hospital_id, warehouse_id, product_id, supplier_id,
      series_number, expiry_date,
      quantity_packages, quantity_units,
      purchase_price, markup_percent,
      received_by, received_at
    )
    SELECT
      p_hospital_id,
      v_transfer.to_warehouse_id,
      v_item.product_id,
      src.supplier_id,
      src.series_number,
      src.expiry_date,
      v_item.quantity_packages,
      v_item.quantity_units,
      src.purchase_price,
      src.markup_percent,
      p_accepted_by,
      now()
    FROM public.inventory_batches src
    WHERE src.id = v_item.inventory_batch_id
    RETURNING id INTO v_new_batch;

    -- Record incoming transaction at destination
    INSERT INTO public.inventory_transactions (
      hospital_id, warehouse_id, inventory_batch_id, product_id,
      source_type, quantity_packages, quantity_units,
      reference_id, performed_by, performed_at
    ) VALUES (
      p_hospital_id,
      v_transfer.to_warehouse_id,
      v_new_batch,
      v_item.product_id,
      'transfer_in',
      v_item.quantity_packages,
      v_item.quantity_units,
      p_transfer_record_id,
      p_accepted_by,
      now()
    );
  END LOOP;

  -- Mark transfer as accepted
  UPDATE public.transfer_records
  SET
    status      = 'accepted',
    accepted_by = p_accepted_by,
    accepted_at = now()
  WHERE id = p_transfer_record_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'accept_transfer failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- perform_writeoff RPC
-- Called when pharmacist / warehouse staff writes off stock
-- Atomically:
--   1. Creates write_off_record
--   2. For each item: deducts from inventory_batches (FIFO by expiry)
--   3. Inserts inventory_transaction rows
-- ============================================================

CREATE OR REPLACE FUNCTION public.perform_writeoff(
  p_hospital_id       uuid,
  p_warehouse_id      uuid,
  p_write_off_type_id uuid,
  p_employee_id       uuid,
  p_supplier_id       uuid,
  p_notes             text,
  p_written_off_by    uuid,
  p_items             jsonb  -- [{product_id, quantity_packages, quantity_units}]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record_id   uuid;
  v_item        jsonb;
  v_batch       record;
  v_remaining_p numeric;
  v_remaining_u numeric;
BEGIN
  -- Create write-off record
  INSERT INTO public.write_off_records (
    hospital_id, warehouse_id, write_off_type_id,
    employee_id, supplier_id, notes,
    written_off_by, written_off_at
  ) VALUES (
    p_hospital_id, p_warehouse_id, p_write_off_type_id,
    p_employee_id, p_supplier_id, p_notes,
    p_written_off_by, now()
  )
  RETURNING id INTO v_record_id;

  -- Process each item using FIFO (earliest expiry first)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_remaining_p := (v_item->>'quantity_packages')::numeric;
    v_remaining_u := (v_item->>'quantity_units')::numeric;

    FOR v_batch IN
      SELECT * FROM public.inventory_batches
      WHERE warehouse_id  = p_warehouse_id
        AND product_id    = (v_item->>'product_id')::uuid
        AND quantity_packages > 0
      ORDER BY COALESCE(expiry_date, '9999-12-31') ASC, received_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining_p <= 0;

      DECLARE
        v_take_p numeric := LEAST(v_remaining_p, v_batch.quantity_packages);
        v_take_u numeric := LEAST(v_remaining_u, v_batch.quantity_units);
      BEGIN
        -- Deduct from batch
        UPDATE public.inventory_batches
        SET
          quantity_packages = quantity_packages - v_take_p,
          quantity_units    = quantity_units    - v_take_u
        WHERE id = v_batch.id;

        -- Insert write-off item
        INSERT INTO public.write_off_record_items (
          write_off_record_id, hospital_id,
          inventory_batch_id, product_id,
          quantity_packages, quantity_units
        ) VALUES (
          v_record_id, p_hospital_id,
          v_batch.id, (v_item->>'product_id')::uuid,
          v_take_p, v_take_u
        );

        -- Insert inventory transaction
        INSERT INTO public.inventory_transactions (
          hospital_id, warehouse_id, inventory_batch_id, product_id,
          source_type, quantity_packages, quantity_units,
          reference_id, performed_by, performed_at
        ) VALUES (
          p_hospital_id, p_warehouse_id, v_batch.id,
          (v_item->>'product_id')::uuid,
          'writeoff',
          -v_take_p, -v_take_u,
          v_record_id,
          p_written_off_by,
          now()
        );

        v_remaining_p := v_remaining_p - v_take_p;
        v_remaining_u := v_remaining_u - v_take_u;
      END;
    END LOOP;

    IF v_remaining_p > 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product %',
        (v_item->>'product_id');
    END IF;
  END LOOP;

  RETURN v_record_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'perform_writeoff failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- Enable Realtime on transfer_records
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.transfer_records;