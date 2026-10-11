-- The previous migration's CREATE OR REPLACE FUNCTION calls added a new
-- trailing parameter (p_source_document_id). Postgres only replaces a
-- function with the exact same argument signature -- adding a parameter
-- creates a second overload instead of replacing the original, leaving
-- both versions live and able to cause "function is not unique" errors.
-- Drop the old signatures so only the new (tagged) versions remain.

drop function if exists public.inpatient_order_service(
  uuid, uuid, uuid, uuid, uuid, uuid
);

drop function if exists public.physician_order_services(
  uuid, uuid, uuid, jsonb, uuid
);
