-- Migration 107: Link drug_formulary to inventory_batches
-- Adds drug_formulary_id to inventory_batches so medication stock
-- can be tracked separately from non-medication products.
-- Makes quantity_packages nullable (UI removes this field).
-- Adds dept_batch_id to drug_prescriptions for dept warehouse tracking.

-- ============================================================
-- 1. Add drug_formulary_id to inventory_batches
--    Nullable: only set for medication batches
--    product_id remains for non-medication batches
-- ============================================================

ALTER TABLE public.inventory_batches
  ADD COLUMN drug_formulary_id uuid
    REFERENCES public.drug_formulary(id) ON DELETE RESTRICT;

-- Enforce: exactly one of drug_formulary_id or product_id must be set
ALTER TABLE public.inventory_batches
  ADD CONSTRAINT inventory_batches_product_xor_formulary CHECK (
    (drug_formulary_id IS NOT NULL AND product_id IS NULL)
    OR (drug_formulary_id IS NULL AND product_id IS NOT NULL)
  );

CREATE INDEX inventory_batches_formulary_idx
  ON public.inventory_batches(drug_formulary_id)
  WHERE drug_formulary_id IS NOT NULL;

-- ============================================================
-- 2. Make quantity_packages nullable on inventory_batches
--    UI no longer requires packages — units only for medications
-- ============================================================

ALTER TABLE public.inventory_batches
  ALTER COLUMN quantity_packages DROP NOT NULL,
  ALTER COLUMN quantity_packages SET DEFAULT 0;

-- ============================================================
-- 3. Make quantity_packages nullable on transfer_record_items
-- ============================================================

ALTER TABLE public.transfer_record_items
  ALTER COLUMN quantity_packages DROP NOT NULL,
  ALTER COLUMN quantity_packages SET DEFAULT 0;

-- ============================================================
-- 4. Add dept_batch_id to drug_prescriptions
--    Set when nurse accepts the prescription.
--    Points to the inventory_batch created in dept warehouse.
-- ============================================================

ALTER TABLE public.drug_prescriptions
  ADD COLUMN dept_batch_id uuid
    REFERENCES public.inventory_batches(id) ON DELETE SET NULL;

-- ============================================================
-- 5. Add drug_formulary_id to transfer_record_items
--    So medication transfers carry formulary reference
-- ============================================================

ALTER TABLE public.transfer_record_items
  ADD COLUMN drug_formulary_id uuid
    REFERENCES public.drug_formulary(id) ON DELETE RESTRICT;

-- Either product_id or drug_formulary_id must be set
ALTER TABLE public.transfer_record_items
  ADD CONSTRAINT transfer_items_product_xor_formulary CHECK (
    (drug_formulary_id IS NOT NULL AND product_id IS NULL)
    OR (drug_formulary_id IS NULL AND product_id IS NOT NULL)
  );

-- ============================================================
-- 6. Add drug_formulary_id to inventory_transactions ledger
-- ============================================================

ALTER TABLE public.inventory_transactions
  ADD COLUMN drug_formulary_id uuid
    REFERENCES public.drug_formulary(id) ON DELETE RESTRICT;

-- ============================================================
-- 7. Update general_clinic_stock VIEW to include
--    medication batches (drug_formulary_id based)
-- ============================================================

DROP VIEW IF EXISTS public.general_clinic_stock;

CREATE OR REPLACE VIEW public.general_clinic_stock AS
-- Non-medication stock (product_id based)
SELECT
  ib.hospital_id,
  ib.warehouse_id,
  w.name                              AS warehouse_name,
  wt.code                             AS warehouse_type,
  ib.product_id,
  NULL::uuid                          AS drug_formulary_id,
  p.name                              AS item_name,
  pt.code                             AS product_type,
  p.inn,
  u.abbreviation                      AS unit,
  COALESCE(SUM(ib.quantity_units), 0) AS total_units,
  MIN(ib.expiry_date)                 AS earliest_expiry,
  COUNT(ib.id)                        AS batch_count
FROM public.inventory_batches ib
JOIN public.warehouses w        ON w.id = ib.warehouse_id
JOIN public.warehouse_types wt  ON wt.id = w.warehouse_type_id
JOIN public.products p          ON p.id = ib.product_id
JOIN public.product_types pt    ON pt.id = p.product_type_id
LEFT JOIN public.units_of_measurement u ON u.id = p.unit_id
WHERE ib.product_id IS NOT NULL
  AND COALESCE(ib.quantity_units, 0) > 0
GROUP BY
  ib.hospital_id, ib.warehouse_id, w.name, wt.code,
  ib.product_id, p.name, pt.code, p.inn, u.abbreviation

UNION ALL

-- Medication stock (drug_formulary_id based)
SELECT
  ib.hospital_id,
  ib.warehouse_id,
  w.name                              AS warehouse_name,
  wt.code                             AS warehouse_type,
  NULL::uuid                          AS product_id,
  ib.drug_formulary_id,
  df.trade_name                       AS item_name,
  'medications'                       AS product_type,
  df.inn,
  u.abbreviation                      AS unit,
  COALESCE(SUM(ib.quantity_units), 0) AS total_units,
  MIN(ib.expiry_date)                 AS earliest_expiry,
  COUNT(ib.id)                        AS batch_count
FROM public.inventory_batches ib
JOIN public.warehouses w        ON w.id = ib.warehouse_id
JOIN public.warehouse_types wt  ON wt.id = w.warehouse_type_id
JOIN public.drug_formulary df   ON df.id = ib.drug_formulary_id
LEFT JOIN public.units_of_measurement u ON u.id = df.unit_id
WHERE ib.drug_formulary_id IS NOT NULL
  AND COALESCE(ib.quantity_units, 0) > 0
GROUP BY
  ib.hospital_id, ib.warehouse_id, w.name, wt.code,
  ib.drug_formulary_id, df.trade_name, df.inn, u.abbreviation;

