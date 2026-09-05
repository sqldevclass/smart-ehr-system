-- Migration 128: Drop unused/superseded interaction tables
--
-- drug_interactions: per-hospital, formulary-UUID-based manual override
-- table with a settings-page UI to add/remove pairs. Never wired into
-- the actual detection pipeline (detect_patient_interactions and
-- check_new_drug_interactions only ever queried inn_interactions).
-- Confirmed empty, confirmed no other table/RPC depends on it as a
-- parent. Decision: remove the table and its UI entirely rather than
-- leave a dormant, disconnected feature in place.
--
-- drug_interactions_staging: one-time data dump used to populate
-- inn_interactions (migration 125, 2140 rows loaded). Fully consumed;
-- inn_interactions is now the system of record. Safe to drop.

DROP TABLE IF EXISTS public.drug_interactions;
DROP TABLE IF EXISTS public.drug_interactions_staging;
